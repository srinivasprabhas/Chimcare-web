import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { fileStamp, warnOnce } from './json-cache';

/**
 * ONE ROW PER REQUEST, from the migration pipeline's own SQLite file.
 *
 * Why this replaced the manifest. Stage 4 used to write every carried-over WordPress body into one
 * JSON document, `chimcare-migration/out/04-routes.json`, and this application parsed that document
 * to find one slug. It was 15.1 MB for 1,000 routes — ~151 MB at 10,000 and ~3.0 GB at 200,000. A
 * per-version cache (`lib/json-cache.ts`) removed the repeated parse but not the shape of the
 * problem: the process still had to parse and then HOLD the whole manifest, so the cost of serving
 * one page grew with the size of the run. Stage 4 now writes a `routes` table instead, and a
 * request is `SELECT payload FROM routes WHERE slug = ? LIMIT 1` — an index seek whose cost does
 * not move between a 1,000-URL run and a 200,000-URL one.
 *
 * `node:sqlite` is Node's own module, so this costs the application no dependency — the same
 * reasoning that put the pipeline on `sqlite3` from Python's standard library. The file is opened
 * READ-ONLY: this application never writes to a pipeline artifact.
 *
 * Torn reads are not handled here because they cannot happen. The store runs in WAL mode
 * (`PRAGMA journal_mode=WAL`, set in `chimcare-migration/scripts/lib/store.py`) and every stage
 * writes inside one transaction, so a reader sees either the previous run's rows or the new run's,
 * never a half-committed mixture. That is also why a live handle does not need reopening when the
 * pipeline commits: SQLite starts a fresh read transaction per statement and picks up whatever has
 * been committed. Retry-on-torn-read logic would be guarding against a state the storage engine
 * does not produce.
 *
 * The handle IS reopened when the file's identity changes — `mtimeMs:size`, the same test
 * `lib/json-cache.ts` uses and imported from there rather than reinvented. That is not about new
 * commits; it is about the file being REPLACED or deleted, which a pipeline re-run from scratch
 * does. An open handle then points at an unlinked inode and would serve a vanished run forever.
 *
 * Failure policy, identical to the manifest's: absent, unreadable, not a database, or missing the
 * `routes` table all mean "no rows here". The caller behaves exactly as it did with no manifest —
 * the database-backed branch still serves and an unknown slug 404s — and the failure is NOT
 * remembered, so the next request retries and picks up a store that has since appeared or been
 * repaired. A broken migration artifact must never take the site down.
 */

/**
 * Where the route store lives, in preference order.
 *
 * `data/routes.sqlite` is the published, serving-only copy: routes and redirects, with the raw
 * WordPress bodies dropped. It is what ships — 4 MB rather than 30 — and it is the only one that
 * exists on a deployed host, where no pipeline runs.
 *
 * The pipeline's own store is the fallback, so local development reads whatever the last run wrote
 * without anyone having to remember to publish first.
 */
const STORE_CANDIDATES = [
  path.join(process.cwd(), 'data/routes.sqlite'),
  path.join(process.cwd(), 'chimcare-migration/out/migration.sqlite'),
];

function storePath(): string | null {
  for (const candidate of STORE_CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // not there; try the next one
    }
  }
  return null;
}

const SELECT_ROUTE = 'SELECT payload FROM routes WHERE slug = ? LIMIT 1';

/**
 * Stage 7's rewrite. `redirects` is a LATER table than `routes`, so a store written by a pipeline
 * that predates it has no such table and preparing this statement throws. That failure must cost
 * the redirects only — never the routes — so it is prepared separately and the field is nullable:
 * no table means "this store has no redirects", which is exactly what it means.
 */
const SELECT_REDIRECT = 'SELECT to_slug FROM redirects WHERE from_slug = ? LIMIT 1';

type Handle = {
  /** `mtimeMs:size` of the file this handle was opened against. */
  stamp: string;
  db: DatabaseSync;
  /** Prepared ONCE per handle, not per request: the parse and the plan are the fixed cost here. */
  select: StatementSync;
  /** The same, for stage 7's redirects — null when this store has no `redirects` table. */
  redirect: StatementSync | null;
};

let handle: Handle | null = null;

function drop(): void {
  if (!handle) return;
  try {
    handle.db.close();
  } catch {
    // A handle whose file is already gone can refuse to close; it is being discarded either way.
  }
  handle = null;
}

/** The live handle, reopening it when the file underneath has been replaced. Null when there is no
 *  usable store, which is a normal state: the pipeline may simply never have been run here. */
function open(): Handle | null {
  const store = storePath();
  if (!store) return null; // no artifact deployed: the database branch still serves
  const stamp = fileStamp(store);
  if (stamp === null) {
    drop(); // the file has gone away; so does the handle pointing at it
    return null;
  }
  if (handle && handle.stamp === stamp) return handle;

  drop();
  try {
    const db = new DatabaseSync(store, { readOnly: true });
    const select = db.prepare(SELECT_ROUTE); // throws here if this is not the pipeline's store
    let redirect: StatementSync | null = null;
    try {
      redirect = db.prepare(SELECT_REDIRECT);
    } catch {
      redirect = null; // a store from before stage 7 existed: routes still serve, nothing redirects
    }
    handle = { stamp, db, select, redirect };
    return handle;
  } catch (err) {
    handle = null; // not cached as a failure: the next request re-stats and tries again
    warnOnce(store, stamp, err, 'route-store');
    return null;
  }
}

/**
 * The route payload for one slug, or null when this store has no row for it — including when there
 * is no store at all. The payload is deflated JSON exactly as `store.pack` wrote it; it carries the
 * parsed block stream and the page's own fields, and deliberately NOT the raw WordPress body, which
 * lives once in the `content` table and is never copied.
 */
export function readRoute(slug: string): unknown | null {
  const live = open();
  if (!live) return null;
  try {
    const row = live.select.get(slug) as { payload?: unknown } | undefined;
    const payload = row?.payload;
    if (!payload || !(payload instanceof Uint8Array)) return null;
    return JSON.parse(inflateSync(payload).toString('utf8'));
  } catch (err) {
    // A corrupt row, a truncated blob, or a file that has been removed under the open handle. Drop
    // the handle so the next request opens whatever is there now, and serve this one as "no row".
    drop();
    warnOnce(storePath() ?? 'route-store', '', err, 'route-store');
    return null;
  }
}

/**
 * The slug stage 7 moved this one to, or null when nothing here redirects — including when there is
 * no store, no `redirects` table, and no row for this slug.
 *
 * Stage 7 rewrites `{service}-in-{city}-{st}` to `{service}-{city}-{st}`, inserts the page under the
 * new slug and DELETES the old `routes` row, so this table is the only thing that keeps the old URL
 * answering. The caller must therefore consult it BEFORE the route lookup: after the old row is gone
 * a route lookup on the old slug finds nothing and the URL would 404 instead of moving.
 *
 * The failure policy is the reader's, unchanged: anything unreadable means "no redirect here", the
 * failure is not remembered, and the page falls through to exactly the behaviour it had before this
 * stage was ever run.
 */
export function readRedirect(slug: string): string | null {
  const live = open();
  if (!live?.redirect) return null;
  try {
    const row = live.redirect.get(slug) as { to_slug?: unknown } | undefined;
    const to = row?.to_slug;
    return typeof to === 'string' && to.length > 0 && to !== slug ? to : null;
  } catch (err) {
    // A row that is not what it claims, or a file removed under the open handle. Drop the handle so
    // the next request opens whatever is there now, and serve this one as "no redirect".
    drop();
    warnOnce(storePath() ?? 'route-store', '', err, 'route-store');
    return null;
  }
}

/** The fields a directory card needs from one route — everything but the block stream. */
export type RouteSummary = {
  slug: string;
  url: string;
  title: string | null;
  phone: string | null;
  jobLocation: string | null;
  heroImage: { src: string; alt: string; width: number | null; height: number | null } | null;
};

/** Built at most once per version of the store file, like the handle itself. */
let summaries: { stamp: string; rows: RouteSummary[] } | null = null;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Every route the store holds, reduced to what the location hubs and the footer list. This reads
 * the whole table, so it is cached against the file's stamp: one scan per deployed store, not one
 * per request. The same failure policy as the rest of this module — no store means no rows.
 */
export function listRouteSummaries(): RouteSummary[] {
  try {
    const live = open();
    if (!live) return [];
    if (summaries?.stamp === live.stamp) return summaries.rows;
    const raw = live.db.prepare('SELECT slug, payload FROM routes ORDER BY slug').all() as Array<{ slug: string; payload: unknown }>;
    const rows = raw.flatMap((r): RouteSummary[] => {
      if (!(r.payload instanceof Uint8Array)) return [];
      try {
        const p = JSON.parse(inflateSync(r.payload).toString('utf8')) as Record<string, unknown>;
        const hero = p.heroImage && typeof p.heroImage === 'object' ? (p.heroImage as Record<string, unknown>) : null;
        const heroSrc = str(hero?.src);
        return [{
          slug: r.slug,
          url: str(p.url) ?? `/location/${r.slug}/`,
          title: str(p.title),
          phone: str(p.phone),
          jobLocation: str(p.jobLocation),
          heroImage: heroSrc ? { src: heroSrc, alt: str(hero?.alt) ?? '', width: num(hero?.width), height: num(hero?.height) } : null,
        }];
      } catch {
        return []; // one corrupt row costs that row, not the list
      }
    });
    summaries = { stamp: live.stamp, rows };
    return rows;
  } catch (err) {
    warnOnce(storePath() ?? 'route-store', '', err, 'route-store');
    return [];
  }
}

/**
 * Every slug the store holds, for prerendering at build time.
 *
 * Reading them once during the build costs one query; rendering each page on first request instead
 * would cost a cold serverless invocation per page, paid by whoever happens to arrive first.
 */
export function listRouteSlugs(): string[] {
  try {
    const handle = open();
    if (!handle) return [];
    const rows = handle.db.prepare('SELECT slug FROM routes').all() as Array<{ slug: string }>;
    return rows.map((r) => r.slug);
  } catch (err) {
    warnOnce(storePath() ?? 'route-store', '', err, 'route-store');
    return []; // no prerender list: pages still render on demand
  }
}
