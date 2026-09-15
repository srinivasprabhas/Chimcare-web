import path from 'node:path';
import { readJsonCached } from '@/lib/json-cache';
import { listRouteSummaries, type RouteSummary } from '@/lib/route-store';
import { stateName, stateProfile, type StateProfile } from '@/lib/content/state-profiles';

/**
 * The location hubs and the footer list exactly the URLs the migration carried over — the 1,000
 * routes in `data/routes.sqlite` — grouped by the state in their slug. Nothing else is listed: a city
 * the WordPress site covered but this deployment does not serve has no card, so every card links to a
 * page that exists and every count matches the migration report.
 *
 * Counting rule, the report's own: a `-2` / `-3` slug is a duplicate WordPress created for a URL it
 * already had. Those pages still serve, but they are not locations of their own and are not counted
 * or listed.
 */

const GEOCODE = path.join(process.cwd(), 'data/migrated-geocode.json');
const SLUG_RE = /-in-(.+)-([a-z]{2})(-\d+)?$/;
const PRIMARY_RE = /^chimney-sweep-(?:fireplace|repair)(?:-services)?-in-/;

export type MigratedLocation = {
  slug: string;
  url: string;
  title: string;
  code: string;
  citySlug: string;
  cityName: string;
  phone: string | null;
  /** Street on the first line, "Town, ST ZIP" on the second — or one line when it cannot be split. Empty when unknown. */
  addressLines: string[];
  photo: { src: string; alt: string } | null;
  lat?: number;
  lng?: number;
};

export type MigratedCity = {
  slug: string;
  name: string;
  /** The city's main page (the sweep & fireplace page where there is one). */
  href: string;
  phone: string | null;
  addressLines: string[];
  lat?: number;
  lng?: number;
};

export type MigratedState = {
  code: string;
  slug: string;
  name: string;
  photo: string | null;
  photoAlt: string;
  photoCredit?: string;
  locations: MigratedLocation[];
  cities: MigratedCity[];
};

let memo: { routes: RouteSummary[]; geo: unknown; states: MigratedState[] } | null = null;

/** Every state with migrated URLs, most URLs first — the order of the migration report's table. */
export function getMigratedStates(): MigratedState[] {
  const routes = listRouteSummaries(); // cached per store version, so identity is a valid memo key
  const geo = readJsonCached(GEOCODE);
  if (memo && memo.routes === routes && memo.geo === geo) return memo.states;
  const states = build(routes, geo);
  memo = { routes, geo, states };
  return states;
}

export function getMigratedState(slug: string): MigratedState | null {
  return getMigratedStates().find((s) => s.slug === slug.toLowerCase()) ?? null;
}

// ---- building ---------------------------------------------------------------------------------

type Parsed = { r: RouteSummary; key: string; st: string; code: string; citySlug: string; cityName: string };

function build(routes: RouteSummary[], geoRaw: unknown): MigratedState[] {
  const geo = geoRaw && typeof geoRaw === 'object' ? (geoRaw as Record<string, { lat?: unknown; lng?: unknown }>) : {};

  const parsed: Parsed[] = [];
  for (const r of routes) {
    const m = SLUG_RE.exec(r.slug);
    if (!m || m[3]) continue; // no state in the slug, or a `-2`/`-3` duplicate (see the note above)
    const code = m[2].toUpperCase();
    const t = r.title ? /\bin\s+(.+?)\s*,\s*([A-Za-z]{2})\s*$/.exec(r.title) : null;
    const cityName = t && t[2].toUpperCase() === code ? t[1].trim() : titleCase(m[1]);
    parsed.push({ r, key: `${m[2]}/${m[1]}`, st: m[2], code, citySlug: m[1], cityName });
  }

  // One spelling and one published address per city. Most service pages carry no address of their
  // own, but the same city's branch page usually does, and it is the same office.
  const nameByCity = new Map<string, string>();
  const addressByCity = new Map<string, string>();
  for (const p of parsed) {
    if (!nameByCity.has(p.key)) nameByCity.set(p.key, p.cityName);
    if (p.r.jobLocation && !addressByCity.has(p.key)) addressByCity.set(p.key, p.r.jobLocation);
  }

  const byState = new Map<string, Parsed[]>();
  for (const p of parsed) byState.set(p.st, [...(byState.get(p.st) ?? []), p]);

  const states = [...byState].map(([st, list]): MigratedState => {
    const code = st.toUpperCase();
    const profile = stateProfile(code);
    const name = profile?.name ?? stateName(code);

    const locations = list
      .map((p): MigratedLocation => {
        const cityName = nameByCity.get(p.key)!;
        const raw = p.r.jobLocation ?? addressByCity.get(p.key) ?? null;
        const pin = geo[p.key];
        return {
          slug: p.r.slug,
          url: p.r.url,
          title: tidyTitle(p.r.title ?? `Chimney services in ${cityName}, ${code}`),
          code,
          citySlug: p.citySlug,
          cityName,
          phone: p.r.phone,
          addressLines: raw ? splitAddress(raw, cityName, code) : [],
          photo: cardPhoto(p.r, cityName, code, profile),
          ...(typeof pin?.lat === 'number' && typeof pin?.lng === 'number' ? { lat: pin.lat, lng: pin.lng } : {}),
        };
      })
      .sort((a, b) => a.cityName.localeCompare(b.cityName) || a.title.localeCompare(b.title));

    const cities: MigratedCity[] = [];
    const seen = new Map<string, MigratedCity>();
    for (const l of locations) {
      let c = seen.get(l.citySlug);
      if (!c) {
        c = { slug: l.citySlug, name: l.cityName, href: l.url, phone: l.phone, addressLines: l.addressLines, lat: l.lat, lng: l.lng };
        seen.set(l.citySlug, c);
        cities.push(c);
      } else if (PRIMARY_RE.test(l.slug) && !PRIMARY_RE.test(c.href.replace(/^\/location\//, ''))) {
        c.href = l.url;
      }
      c.phone ??= l.phone;
    }

    return {
      code,
      slug: st,
      name,
      photo: profile?.photo ?? null,
      photoAlt: profile?.photoAlt ?? `Chimney service in ${name}`,
      ...(profile?.photoCredit ? { photoCredit: profile.photoCredit } : {}),
      locations,
      cities,
    };
  });

  return states.sort((a, b) => b.locations.length - a.locations.length || a.name.localeCompare(b.name));
}

function titleCase(slug: string): string {
  return slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** WordPress titles often read "…in Cambridge,MA"; the card prints "…in Cambridge, MA". */
function tidyTitle(title: string): string {
  return title.replace(/\s*,\s*([A-Za-z]{2})\s*$/, ', $1').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The route's own WordPress hero — unless its file is named for a DIFFERENT state. The migration
 * reuses a Boston photograph (`chimney-sweep-boston-MA.jpg`) on every Arizona page; a card in
 * Phoenix gets Arizona's state photograph instead. The last two-letter state token in the file name
 * decides, so `NE-Atlanta-city-GA.jpg` reads as Georgia, not Nebraska.
 */
function cardPhoto(r: RouteSummary, cityName: string, code: string, profile: StateProfile | null): MigratedLocation['photo'] {
  const src = r.heroImage?.src;
  if (src) {
    let file = src.split('/').pop() ?? '';
    try {
      file = decodeURIComponent(file);
    } catch {
      // keep the raw name
    }
    const tokens = [...file.matchAll(/(?:^|[-_ ])([A-Z]{2})(?=[-_. ]|$)/g)].map((m) => m[1]).filter((t) => stateName(t) !== t);
    const named = tokens.at(-1);
    if (!named || named === code) return { src, alt: `Chimcare chimney sweep and fireplace service in ${cityName}, ${code}` };
  }
  return profile ? { src: profile.photo, alt: profile.photoAlt } : null;
}

const DIRECTIONS = /^(?:north|south|east|west|northeast|northwest|southeast|southwest|central|ne|nw|se|sw)\s+/i;

/** The spellings a town may take inside an address: "North Minneapolis" → "Minneapolis", "St. Paul" → "Saint Paul". */
function townVariants(cityName: string): string[] {
  const base = cityName.replace(DIRECTIONS, '');
  const saint = (s: string) => s.replace(/^St\.?\s+/i, 'Saint ');
  return [...new Set([cityName, base, saint(cityName), saint(base)])];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * WordPress's `_job_location` as two printable lines. The source is hand-typed and inconsistent —
 * "6385 Old Shady Oak Rd Eden Prairie, MN 55344 United States", "1 Mifflin Place ,Suite 400,Cambridge",
 * "120 Bishops Way, Brookfield, 53005" — so it is tidied, given its state where it lacks one, and
 * split before the town. Nothing is added but the town and state the URL itself names.
 */
function splitAddress(raw: string, cityName: string, code: string): string[] {
  let a = raw
    .replace(/\s*United States\s*$/i, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/,$/, '')
    .replace(/,\s*(?:ste|suite)\.?\s+(?=[a-z])/i, ', '); // "Ave,STE Maplewood" — a suite marker with no number

  if (!new RegExp(`\\b${code}(?:\\s+\\d{5})?$`).test(a)) {
    if (/,\s*\d{5}$/.test(a)) {
      a = a.replace(/,\s*(\d{5})$/, `, ${code} $1`);
    } else {
      const last = (a.split(',').pop() ?? '').trim().toLowerCase();
      a = townVariants(cityName).some((t) => t.toLowerCase() === last) ? `${a}, ${code}` : `${a}, ${cityName}, ${code}`;
    }
  }

  const locality = '([A-Z]{2}(?:\\s+\\d{5})?)';
  let m = new RegExp(`^(.*),\\s*([^,]+),\\s*${locality}$`).exec(a);
  if (!m) {
    for (const town of townVariants(cityName)) {
      m = new RegExp(`^(.*\\S)\\s+(${escapeRe(town)}),\\s*${locality}$`, 'i').exec(a);
      if (m) break;
    }
  }
  return m ? [m[1].trim(), `${m[2].trim()}, ${m[3]}`] : [a];
}
