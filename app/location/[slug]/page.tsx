import path from 'node:path';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
// The client reference's own stylesheet, lifted verbatim by the migration pipeline, plus the few
// scoped corrections the missing reference elements need. Every `/location/` page now renders in
// this markup, whichever source supplied its content, so these two files are the page's whole look.
import '../template.css';
import '../reference.css';
import { Icon } from '@/components/chrome/Icon';
import { LocationQuickActions } from '@/components/chrome/LocationQuickActions';
import { BookingForm } from '@/components/islands/BookingForm';
import { BookingSheet } from '@/components/islands/BookingSheet';
import { Accordion } from '@/components/islands/Accordion';
import { AreaRailControls } from '@/components/islands/AreaRailControls';
import type { BookingContext } from '@/lib/booking/types';
import { bookingOptions, catalogueGrid, type BookingOption, type CategoryTile, type ServiceCard } from '@/lib/content/assemble';
import { buildContext, fill, money } from '@/lib/content/slots';
import { parseBody } from '@/lib/content/wp-blocks';
import { getCityBundle } from '@/lib/data/cities';
import { getPrices } from '@/lib/data/pricing';
import { resolvePage, getPublishedServiceSlugs } from '@/lib/data/pages';
import { getPageSource } from '@/lib/data/page-source';
import { getCatalog } from '@/lib/data/services';
import { getMasters } from '@/lib/data/masters';
import { ServiceDirectory } from '@/components/islands/ServiceDirectory';
// Every JSON file below is read on a render path, so each read
// goes through the mtime+size-keyed cache rather than re-parsing the file for every request. See
// `lib/json-cache.ts` for why a plain module-level constant would be wrong here.
import { readJsonCached } from '@/lib/json-cache';
// The migrated pages themselves do NOT come from a JSON file any more: they are one row each in the
// pipeline's SQLite store, read by slug. See `lib/route-store.ts` for why.
import { readRoute, readRedirect, listRouteSlugs } from '@/lib/route-store';

/**
 * The dispatcher. One route for every legacy `/location/{slug}/` URL, and ONE template behind it.
 *
 * Every URL on this site is a service in a city — there is no city-only page — so the `site.pages`
 * row decides only whether the URL is served, redirected or gone, never which template renders it.
 *
 * Until 2026-09 that last clause was a lie. A slug the database had a row for rendered the old
 * `LocationPage`; a slug only the migration manifest knew rendered the client's reference design.
 * Same URL shape, same content, two different pages — which is exactly the inconsistency the
 * migration was meant to remove. So the shape is now:
 *
 *     resolvePage(slug) → fate 'redirect'  → permanentRedirect
 *     stage 7 `redirects` row               → permanentRedirect to the rewritten slug
 *                       → otherwise, a PageView from whichever source has content:
 *                             the manifest route when the slug is in the manifest,
 *                             else the database's own page source
 *                       → ReferencePage, the single template
 *     neither source    → notFound()
 *
 * The manifest wins when a slug is in both. It is the migration's own extraction of the same
 * WordPress body, and seeing it rendered is the point of the exercise.
 *
 * The two sources are ADAPTERS, not templates: each one's job is to fill the same `PageView`. What
 * still differs between them is data, not markup — the database resolves a region and therefore has
 * real prices, a seeded hero photo and the serving branch's phone and address. A manifest route has
 * none of those, so those parts of the page are simply omitted rather than invented.
 */
/**
 * These pages change only when the migration pipeline runs and the site is redeployed, so rebuilding
 * one on every request was pure waste: Vercel reported `cache-control: no-store` and `age: 0`, the CDN
 * cached nothing, and every visit cost a serverless invocation and a ~400ms time-to-first-byte.
 *
 * `revalidate` lets the CDN serve a cached copy and refresh it in the background at most once an hour.
 * A redeploy invalidates everything, which is the only moment the content actually changes. The
 * booking card is a client island, so caching the document does not freeze anything interactive.
 */
export const revalidate = 3600;

/**
 * Prerender every migrated page at build time.
 *
 * Without this the first visitor to each URL pays for a cold render. With 1,000 pages that is 1,000
 * people getting the slow version. `dynamicParams` stays true so a slug added to the store after the
 * build still renders on demand rather than 404ing.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  return listRouteSlugs().map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

/* =====================================================================
   THE MIGRATION SOURCE
   The migration pipeline's stage 4 writes one row per carried-over WordPress
   page into `chimcare-migration/out/migration.sqlite`, and this page reads ONE
   of them per request: `SELECT payload FROM routes WHERE slug = ? LIMIT 1`.

   It used to read a JSON manifest — 15.1 MB for 1,000 routes, ~3.0 GB at the
   full 200,000 — parsed and held in memory to find a single slug. Caching that
   parse made it once-per-version instead of once-per-request, but the process
   still held the whole run; an indexed row read does not grow with the run at
   all. The store is opened read-only and never written to from here.
   `source: 'manifest'` is kept as the name of this branch, because that is what
   the migration's own extraction is called everywhere else in the project.
   ===================================================================== */

/**
 * An image the pipeline carried over. `alt` is WordPress's own and may legitimately be empty — an
 * empty alt is rendered as empty rather than substituted, which is what a decorative image wants.
 * `width`/`height` may be null; the page then falls back to an aspect-ratio box so the layout still
 * does not shift while the file loads.
 */
type ImageRef = { src: string; alt: string; width: number | null; height: number | null };

type HeadingBlock = { type: 'heading'; level?: number; text: string };

/**
 * The block stream, in true reading order. `image` blocks were added to the manifest after the first
 * cut of this page, so every field they bring is read defensively: a manifest written by an older
 * pipeline run carries no image blocks and no `heroImage`, and this page renders correctly either way.
 */
type Block =
  | HeadingBlock
  | { type: 'paragraph'; text: string }
  | { type: 'listItem'; text: string }
  | { type: 'image'; src: string; alt?: string | null; width?: number | null; height?: number | null };

type Route = {
  slug: string;
  url: string;
  title: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  phone: string | null;
  jobLocation: string | null;
  heroImage?: ImageRef | null;
  imageCount?: number;
  blocks: Block[];
  /**
   * The sibling service pages this city really has, in catalogue order, written by the pipeline.
   * Optional on purpose: a manifest from a run that predates the field carries none, and the page
   * then simply renders no service directory rather than guessing at one. Every field inside is
   * re-checked at use, because this is JSON on disk and not a compiled shape.
   */
  services?: unknown;
  serviceCount?: number;
};

/**
 * The reference design's OWN imagery, extracted from the client reference by the migration pipeline.
 * These are the design's fixed plates — the intro plate, the dark panel's art, the services plate —
 * not any page's content. The file is written by a separate stage and may legitimately not exist
 * yet, so every read here is defensive: no file, bad JSON or an unexpected shape all mean "no
 * plates", and every section that can take one renders correctly without it.
 */
const ASSETS = path.join(process.cwd(), 'app/location/template-assets.json');

type RefAsset = {
  file: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  nearestSection?: string | null;
  nearestClass?: string | null;
};

function referenceAssets(): RefAsset[] {
  try {
    const raw: unknown = readJsonCached(ASSETS);
    if (raw === null) return [];
    const list: unknown = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>).images ?? (raw as Record<string, unknown>).assets
        : null;
    if (!Array.isArray(list)) return [];
    return (list as RefAsset[]).filter((a) => a && typeof a.file === 'string' && a.file.startsWith('/'));
  } catch {
    return []; // a half-written or absent file is simply no imagery
  }
}

/** The plate the reference used in one section, or null when that section has none. */
function plateFor(assets: RefAsset[], section: string): RefAsset | null {
  return assets.find((a) => a.nearestSection === section) ?? null;
}

/* =====================================================================
   THE EIGHT STANDARD SERVICES
   The client reference's service accordion is eight hand-written entries, in a
   deliberate order. `chimcare-migration/scripts/extract_reference_services.py`
   lifts them out of the reference into `standard-services.json`; this page only
   renders them. They are brand copy, identical on every page, except where the
   extractor left a `{{city.name}}` / `{{state.code}}` slot for this page's own
   city — and except for the two Spokane climate sentences the extractor dropped,
   which cannot be true of an Arizona or Georgia city and so are on no page.

   The page's OWN migrated headings and prose are not here: they render in full
   in the full-service section's body flow below.
   ===================================================================== */
const STANDARD_SERVICES = path.join(process.cwd(), 'app/location/standard-services.json');

type StandardService = {
  key: string;
  n: string;
  icon: string;
  name: string;
  summary: string;
  paragraphs: string[];
  included: string[];
  cta: string;
};

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

function isStandardService(v: unknown): v is StandardService {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  // `image` is deliberately NOT part of the shape. The extractor still writes it and the JSON still
  // carries it — the data is not thrown away — but the accordion no longer draws a photograph inside
  // a service panel, so the field is neither typed nor validated here.
  return (
    ['key', 'n', 'icon', 'name', 'summary', 'cta'].every((k) => typeof s[k] === 'string' && (s[k] as string).length > 0) &&
    isStringArray(s.paragraphs) &&
    isStringArray(s.included)
  );
}

/**
 * The eight entries, or none at all. A missing, half-written or unexpected file yields an empty
 * list and the section simply does not render — a service accordion with the wrong rows in it
 * would be worse than no accordion.
 */
function standardServices(): StandardService[] {
  try {
    const raw: unknown = readJsonCached(STANDARD_SERVICES);
    if (raw === null) return [];
    const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).services : null;
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.every(isStandardService) ? (list as StandardService[]) : [];
  } catch {
    return [];
  }
}

/**
 * Brand copy with this page's city in it, or null when the page resolved no place and the sentence
 * therefore cannot be completed. Null is dropped by the caller rather than rendered half-filled:
 * `fill` throws on an unknown slot, and that guarantee is worth keeping.
 */
function localise(text: string, place: Place | null): string | null {
  if (!text.includes('{{')) return text;
  if (!place) return null;
  try {
    return fill(text, { 'city.name': place.city, 'state.code': place.code });
  } catch {
    return null; // a slot this page cannot fill: leave the sentence out, never leak "{{"
  }
}

/* =====================================================================
   THE REFERENCE'S SERVICE-AREA COPY
   The client reference carries a "Service area" band between the service
   directory and the process steps. Everything in it except the area chips is
   brand boilerplate — it says what Chimcare serves, not what the city is like —
   so `chimcare-migration/scripts/extract_reference_areas.py` lifts it into
   `standard-areas.json` with the place replaced by slots, and this page fills
   them from its own city.

   The CHIPS are not in that file and never will be. The reference's own chips
   are neighbourhoods of the reference city, and no substitution turns them into
   another city's neighbourhoods — generating them would be inventing place
   names. The chips this page renders come from the page's OWN migrated
   "areas we serve" list (`isAreas` above), which is real WordPress copy about
   this real city. A page whose body has no such list renders the band with no
   chips at all: eyebrow, heading, copy, photograph, the "we proudly serve" line
   and the button still make a finished section.

   One sentence of the reference's copy was dropped by the extractor, with its
   reason recorded in the JSON: it claimed what the city's houses are like and
   that it has a season-after-season heating cycle, which is not a fact for the
   Arizona and Georgia pages in this run.
   ===================================================================== */
const STANDARD_AREAS = path.join(process.cwd(), 'app/location/standard-areas.json');

/** The id the server gives the rail, and the only thing the arrows island needs to know about it. */
const AREA_RAIL_ID = 'areas-rail';

/**
 * Below this many areas the rail is a single row: two rows of three chips reads as a broken grid
 * rather than as a deliberate layout.
 */
const AREA_RAIL_TWO_ROWS_FROM = 6;

/**
 * Below this many areas the arrows are not rendered at all, because two rows of six fit without
 * scrolling at every width this page is built for. The island also hides itself when the rail turns
 * out not to overflow, which covers the wide screens where even more chips fit — this constant only
 * avoids rendering controls that would be removed a moment later.
 */
const AREA_RAIL_ARROWS_FROM = 12;
/**
 * A chip shows at most two words, with an ellipsis when the name runs longer.
 *
 * The rail is two rows of fixed height, so one long area name ("Surrounding Areas in Wright County")
 * would otherwise set the column width for everything beside it. Truncation is by WORD rather than by
 * CSS width so every chip clips at the same place regardless of the characters in it.
 *
 * The full name still reaches a screen reader and a crawler: the short form is `aria-hidden` and the
 * complete name follows in an `.sr-only` span. A visible ellipsis with the real text thrown away
 * would be losing content to make a layout fit.
 */
function shortenArea(name: string): { short: string; truncated: boolean } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { short: name.trim(), truncated: false };
  return { short: words.slice(0, 2).join(' ') + '…', truncated: true };
}


type StandardAreas = {
  eyebrow: string;
  heading: string;
  lede: string;
  subHeading: string;
  subLede: string;
  cta: string;
};

const AREAS_FIELDS = ['eyebrow', 'heading', 'lede', 'subHeading', 'subLede', 'cta'] as const;

/**
 * The band's copy, or none. A missing, half-written or unexpected file means the section does not
 * render — the same rule the accordion and the FAQ follow, for the same reason.
 */
function standardAreas(): StandardAreas | null {
  try {
    const raw: unknown = readJsonCached(STANDARD_AREAS);
    if (raw === null) return null;
    const copy = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).areas : null;
    if (!copy || typeof copy !== 'object') return null;
    const c = copy as Record<string, unknown>;
    return AREAS_FIELDS.every((k) => typeof c[k] === 'string' && (c[k] as string).length > 0)
      ? (copy as StandardAreas)
      : null;
  } catch {
    return null;
  }
}

/* =====================================================================
   THE SEVEN STANDARD FAQ ENTRIES
   The client reference's FAQ is seven hand-written questions in a deliberate
   order. `chimcare-migration/scripts/extract_reference_faqs.py` lifts them out
   of the reference into `standard-faqs.json`; this page only renders them.

   This is the page's ONLY FAQ section. The seeded `view.faqs` rows — the three
   short WordPress answers that exist for 137 Minnesota cities and for no other
   page — are no longer rendered: their three topics (areas served, annual
   cleaning, gas fireplaces) are the reference's own items 5, 6 and 7, so
   rendering both would ask the same question twice on those pages, once in the
   client's approved wording and once in WordPress's. The reference set wins
   because it is the design, it is the wording the client signed off, and it is
   the same seven questions on every page rather than on 137 of them.

   Two entries carry a guard, and both are the extractor's decision, recorded in
   the JSON with its reason:
     - `needsPrices` marks the entry that quotes real money. Its figures are
       `{{price.*}}` slots, and it renders ONLY where a real region resolved —
       the same `view.prices` test the booking tiles and the cost panel use. No
       region, no entry; the numbers are never hardcoded and never reworded away.
     - The annual-cleaning entry lost its only sentence to the climate drop (it
       timed the cycle to "before heating season", which Arizona and Georgia do
       not have) and carries an empty answer. An entry with no answer renders
       nowhere.
   ===================================================================== */
const STANDARD_FAQS = path.join(process.cwd(), 'app/location/standard-faqs.json');

type StandardFaq = { key: string; question: string; answer: string; needsPrices: boolean };

function isStandardFaq(v: unknown): v is StandardFaq {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.key === 'string' &&
    typeof f.question === 'string' &&
    f.question.length > 0 &&
    typeof f.answer === 'string' &&
    typeof f.needsPrices === 'boolean'
  );
}

/**
 * The seven entries, or none at all. A missing, half-written or unexpected file yields an empty
 * list and the section simply does not render — a FAQ with the wrong questions in it would be
 * worse than no FAQ.
 */
function standardFaqs(): StandardFaq[] {
  try {
    const raw: unknown = readJsonCached(STANDARD_FAQS);
    if (raw === null) return [];
    const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).faqs : null;
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.every(isStandardFaq) ? (list as StandardFaq[]) : [];
  } catch {
    return [];
  }
}

/**
 * The questions THIS page actually asks. One function, used by both the section and the JSON-LD,
 * so the structured data can never advertise a question the page does not show.
 *
 * An entry is dropped when it has no answer left, when it needs prices this page has none for, or
 * when a slot cannot be filled — `fill` throws on an unknown slot, and a literal `{{city.name}}`
 * must never reach the page.
 */
function renderedFaqs(view: PageView): FaqItem[] {
  const place = view.place;
  const ctx: Record<string, string> = {
    ...(place ? { 'city.name': place.city, 'state.code': place.code } : {}),
    ...(view.prices
      ? {
          'price.sweep_inspection': money(view.prices.sweep_inspection),
          'price.inspection': money(view.prices.inspection),
          'price.gas_diagnostic': money(view.prices.gas_diagnostic),
        }
      : {}),
  };
  return standardFaqs().flatMap((f) => {
    if (!f.answer) return []; // the climate drop emptied it; it answers nothing
    if (f.needsPrices && !view.prices) return []; // no region belongs to this page, so no figure does
    try {
      return [{ question: fill(f.question, ctx), answer: fill(f.answer, ctx) }];
    } catch {
      return []; // a slot this page cannot fill: leave the question out, never leak "{{"
    }
  });
}

/* =====================================================================
   THE FOUR TRUST TILES
   The reference draws the "Why {City} Homeowners Trust Chimcare" band's right-hand
   column as one flat image of a 2x2 grid of tiles — a picture of text, so the four
   labels are readable only inside that image's own alt string. `standard-trust.json`
   is this page's extraction of that same image's labels and icons, in the image's
   own order; this page only renders them, the same way it renders the standard
   services, areas and FAQs.
   ===================================================================== */
const STANDARD_TRUST = path.join(process.cwd(), 'app/location/standard-trust.json');

type TrustTile = { key: string; label: string; icon: string };

function isTrustTile(v: unknown): v is TrustTile {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.key === 'string' && t.key.length > 0 &&
    typeof t.label === 'string' && t.label.length > 0 &&
    typeof t.icon === 'string' && t.icon.length > 0
  );
}

/**
 * The four tiles, or none at all. A missing, half-written or unexpected file yields an empty
 * list, and the caller falls back to the reference's own image rather than leaving the band's
 * right-hand column empty — the same "wrong content is worse than no content" rule the accordion
 * and FAQ follow, except here the fallback is the flat plate this markup exists to replace.
 */
function standardTrust(): TrustTile[] {
  try {
    const raw: unknown = readJsonCached(STANDARD_TRUST);
    if (raw === null) return [];
    const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).tiles : null;
    if (!Array.isArray(list) || list.length !== 4) return [];
    return list.every(isTrustTile) ? (list as TrustTile[]) : [];
  } catch {
    return [];
  }
}

/* =====================================================================
   THE HERO'S LEDE
   The reference's hero carries one line under its h1 saying what Chimcare does
   in this city. It is brand copy — it claims only what Chimcare does — so
   `chimcare-migration/scripts/extract_reference_lede.py` lifts it into
   `standard-lede.json` with the place replaced by slots, and this page fills
   them from its own city.

   Until now the hero borrowed the page's OWN first body paragraph for that slot,
   which pushed the introduction section down onto the page's second paragraph.
   The hero now shows the reference's line and the introduction shows the page's
   first paragraph, which is the order the reference itself reads in.
   ===================================================================== */
const STANDARD_LEDE = path.join(process.cwd(), 'app/location/standard-lede.json');

/**
 * The reference's lede, still slotted, or null. A missing, half-written or unexpected file yields
 * null and the caller falls back to the page's own first paragraph — the hero is never empty, and
 * the sentence is never typed into this component.
 */
function standardLede(): string | null {
  try {
    const raw: unknown = readJsonCached(STANDARD_LEDE);
    if (raw === null) return null;
    const lede = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).lede : null;
    return typeof lede === 'string' && lede.trim().length > 0 ? lede : null;
  } catch {
    return null;
  }
}

/* =====================================================================
   THE GOOGLE RATING BADGE
   The reference's hero shows "Rated 4.7 on Google" beside three award badges.
   The figure is not per-location content — WordPress carries it as one
   company-wide `wp_postmeta` fact (`local-business-*-rating` /
   `local-business-*-review-count`), identical on all 125 posts that carry it.
   `chimcare-migration/scripts/extract_wp_rating.py` resolves that single
   value and writes `standard-rating.json`; this page only renders it, on
   every page, because the value is the same everywhere it would appear.

   No AggregateRating/Review structured data is emitted for this figure —
   never was, and this feature does not add any. See the comment on
   `RatingBadge` below for why, beyond the project's blanket rule against it.
   ===================================================================== */
const STANDARD_RATING = path.join(process.cwd(), 'app/location/standard-rating.json');

type StandardRating = { ratingValue: number; reviewCount: number };

function isStandardRating(v: unknown): v is StandardRating {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.ratingValue === 'number' && Number.isFinite(r.ratingValue) && r.ratingValue > 0 &&
    typeof r.reviewCount === 'number' && Number.isFinite(r.reviewCount) && r.reviewCount >= 0
  );
}

/**
 * The rating figure, or null. A missing or malformed file renders no badge at all — a badge with
 * the wrong number, or none, would be worse than no badge, the same rule every other standard-*
 * source in this file follows.
 */
function standardRating(): StandardRating | null {
  try {
    const raw: unknown = readJsonCached(STANDARD_RATING);
    if (raw === null) return null;
    return isStandardRating(raw) ? (raw as StandardRating) : null;
  } catch {
    return null;
  }
}

/** One award badge image the hero shows next to the rating, matched out of the reference's own
 *  asset manifest by alt text so no path is hand-typed here. */
const HERO_AWARD_ALTS = [
  'National Chimney Sweep Guild member',
  'Angie’s List Super Service Award 2020',
  'Angi Super Service Award 2021',
];

function heroAwards(assets: RefAsset[]): RefAsset[] {
  return HERO_AWARD_ALTS
    .map((alt) => assets.find((a) => a.alt === alt && a.nearestSection === 'o1-hero') ?? null)
    .filter((a): a is RefAsset => a !== null);
}

const PRODUCTION_ORIGIN = 'https://www.chimcare.com';
const SITE_NAME = 'Chimcare';

/**
 * One route's payload, checked before it is trusted. This is a blob written by another program, so
 * the two fields the template cannot render without — the slug and the block stream — are verified
 * here; everything else is already read defensively at its use, exactly as it was when this came
 * out of a JSON file.
 */
function isRoute(v: unknown): v is Route {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.slug === 'string' && r.slug.length > 0 && Array.isArray(r.blocks);
}

/**
 * The route for one slug, or null — including when the pipeline has never been run here, when its
 * store is unreadable, and when the row is not one this page can render.
 *
 * `readRoute` does an indexed single-row read against the pipeline's SQLite store: the cost of
 * serving a page no longer depends on how many pages the run produced. A missing or corrupt store
 * returns null there and is logged once, so this branch simply has nothing to offer and the caller
 * falls through to the database exactly as it did when the manifest was absent.
 */
function findRoute(slug: string): Route | null {
  const payload = readRoute(slug);
  return isRoute(payload) ? payload : null;
}

/* =====================================================================
   THE ONE SET OF PROPS
   Everything the single template needs, and nothing about where it came from
   except `source` — which is on the page only so tooling can tell the two
   apart (see `data-source` on the section wrapper below).
   ===================================================================== */

type Place = { city: string; code: string; state: string };

type PriceSet = Awaited<ReturnType<typeof getPrices>>;

type FaqItem = { question: string; answer: string };

type PageView = {
  source: 'manifest' | 'database';
  slug: string;
  url: string;
  /** The page's own heading — the hero's h1. */
  title: string;
  /** Yoast's title, where the source has one; the metadata falls back to `title`. */
  seoTitle: string | null;
  metaDescription: string | null;
  canonical: string;
  phone: string | null;
  jobLocation: string | null;
  heroImage: ImageRef | null;
  place: Place | null;
  blocks: Block[];
  /** The four booking services. Priced only where a real region resolved — never otherwise. */
  booking: BookingOption[];
  bookingContext: BookingContext;
  /**
   * This page's OWN prices, or null. Null means no region belongs to this URL, and the pricing panel
   * then prints prose and no figure at all — the national fallback is never printed as a local price.
   */
  prices: PriceSet | null;
  /** The seeded FAQ rows for this city, slots already filled. Empty where the source has none. */
  faqs: FaqItem[];
  /** The serving branch's short street, e.g. "N Washington St" — the trust strip's third tile. */
  branchStreet: string | null;
  /** The serving branch's licence numbers, exactly as the branch row holds them. */
  licenses: string[];
  /**
   * The service directory — the reference's filterable card grid — or null when this city has no
   * published service page at all. Every card in it links to a page that exists; see `buildDirectory`.
   */
  directory: Directory | null;
};

/* =====================================================================
   THE SERVICE DIRECTORY
   The reference's `o1-solutions` section is a filterable grid of service
   cards. The reference shipped all 92 catalogue services; this page shows
   only the services that actually have a published page for THIS city, so
   every card links and no card links nowhere. The card wording still comes
   from the catalogue, so it is the reference's wording, city by city.
   ===================================================================== */

type Directory = {
  eyebrow: string;
  heading: string | null;
  lede: string | null;
  tiles: CategoryTile[];
  cards: ServiceCard[];
  /** The number of services THIS city has — never the catalogue's 92. */
  count: number;
};

/**
 * The only slots a catalogue card may contain. `fill()` throws on an unknown slot, and a card is
 * built from nothing but the place, so a template reaching for a price or a neighbourhood is data
 * this page cannot honour: that service is dropped rather than rendered with a literal `{{slot}}`.
 */
const CARD_SLOTS = new Set(['service.name', 'category.name', 'city.name', 'state.code']);
const CARD_SLOT_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/g;

function cardFillable(template: string): boolean {
  for (const m of template.matchAll(CARD_SLOT_RE)) if (!CARD_SLOTS.has(m[1])) return false;
  return true;
}

/**
 * The manifest's own `services` array, read defensively. Entries without a usable key and slug are
 * skipped; an absent, malformed or empty array yields an empty map, which means "no directory".
 */
function manifestServiceSlugs(route: Route): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(route.services)) return out;
  for (const raw of route.services as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as { key?: unknown; slug?: unknown; url?: unknown };
    if (typeof e.key !== 'string' || e.key === '') continue;
    const slug =
      typeof e.slug === 'string' && e.slug !== ''
        ? e.slug
        : typeof e.url === 'string'
          ? e.url.match(/\/location\/([^/?#]+)\/?/)?.[1] ?? ''
          : '';
    if (slug === '') continue;
    out.set(e.key, slug);
  }
  return out;
}

/**
 * The directory for one page, or null.
 *
 * Both sources hand in the same thing — the sibling service pages that exist — keyed by service id
 * (the database knows ids) or by service key (the manifest knows keys). Those are joined to the seed
 * catalogue, which supplies each card's name, copy and category, and the catalogue is then CUT DOWN
 * to exactly that set before `catalogueGrid()` builds the cards and tiles. Cutting the catalogue
 * first is what makes the chip counts and the "All N services" button report this city's real
 * number: they are counted from the cards, so they can only ever say what the page can show.
 *
 * Null — no section at all — when the page has no place to name, when nothing is published, or when
 * the catalogue cannot be read.
 */
async function buildDirectory(
  place: Place | null,
  links: { byId?: Map<number, string>; byKey?: Map<string, string> },
): Promise<Directory | null> {
  if (!place) return null;
  if (!links.byId?.size && !links.byKey?.size) return null;
  try {
    const catalog = await getCatalog();
    const slugFor = (id: number, key: string) => links.byId?.get(id) ?? links.byKey?.get(key);
    const services = catalog.services.filter(
      (s) => !!slugFor(s.id, s.key) && cardFillable(s.nameTemplate) && cardFillable(s.cardCopyTemplate),
    );
    if (services.length === 0) return null;
    const kept = new Set(services.map((s) => s.categoryId));
    const categories = catalog.categories.filter((c) => kept.has(c.id));
    const slugs = new Map(services.map((s) => [s.id, slugFor(s.id, s.key)!]));
    const ctx = { 'city.name': place.city, 'state.code': place.code };
    const { cards, tiles } = catalogueGrid({ categories, services }, ctx, slugs);
    // The reference's cards are plain text, not links, and this follows it. The published sibling
    // page is still what decides whether a card exists at all — that check happened above, when the
    // catalogue was cut down to services this city actually has — but the card itself does not
    // navigate. Defence in depth stays: a card the join left without a resolved page is dropped.
    const resolved = cards.filter((c) => !!c.href).map(({ href: _href, ...card }) => card);
    if (resolved.length === 0) return null;
    const head = await directoryHead({ ...ctx, 'services.count': String(resolved.length) });
    return { ...head, cards: resolved, tiles, count: resolved.length };
  } catch {
    return null; // no catalogue (no database, a failed query) means no directory, never a guess
  }
}

/**
 * The section's own words. They are the master copy the city template already uses, so the heading
 * and lede read exactly as the reference's do — and `{{services.count}}` is filled with THIS page's
 * count. A missing or unfillable master costs the heading and lede, not the directory.
 */
async function directoryHead(ctx: Record<string, string>): Promise<{ eyebrow: string; heading: string | null; lede: string | null }> {
  try {
    const master = (await getMasters()).solutions as { eyebrow?: string; heading?: string; lede?: string } | undefined;
    if (!master) return { eyebrow: 'Full-service', heading: null, lede: null };
    const safe = (t?: string) => {
      if (!t) return null;
      try {
        return fill(t, ctx);
      } catch {
        return null; // a slot this page has no value for; the line is dropped, never published raw
      }
    };
    return { eyebrow: safe(master.eyebrow) ?? 'Full-service', heading: safe(master.heading), lede: safe(master.lede) };
  } catch {
    return { eyebrow: 'Full-service', heading: null, lede: null };
  }
}

/**
 * The manifest adapter. The pipeline has already parsed the body, so there is nothing to do here
 * but name the fields: the blocks in `04-routes.json` ARE the block stream this template renders.
 */
async function viewFromManifest(route: Route): Promise<PageView> {
  const place = parsePlace(route.slug);
  return {
    source: 'manifest',
    slug: route.slug,
    url: route.url,
    title: route.title ?? route.slug,
    seoTitle: route.seoTitle,
    metaDescription: route.metaDescription,
    canonical: `${PRODUCTION_ORIGIN}${route.url}`,
    phone: route.phone,
    jobLocation: route.jobLocation,
    heroImage: route.heroImage ?? null,
    place,
    blocks: route.blocks,
    booking: await manifestBookingOptions(),
    bookingContext: bookingContextFor(route.url, place, null),
    // A manifest route has no city row, so no region, no branch and no seeded FAQ. Each of those is
    // absent rather than substituted, and the sections that need them omit exactly those elements.
    prices: null,
    faqs: [],
    branchStreet: null,
    licenses: [],
    // The pipeline lists this city's real sibling service pages on the route. Where it has not (an
    // older manifest), the map is empty and the page renders without a directory.
    directory: await buildDirectory(place, { byKey: manifestServiceSlugs(route) }),
  };
}

/**
 * The database adapter. `getPageSource(slug)` hands back the raw WordPress `post_content` — the same
 * WPBakery markup the pipeline reads — so `parseBody()` (a port of the pipeline's own `parse_body`)
 * turns it into the identical block stream, in true source order. That is the whole trick: one
 * parser shape, therefore one template.
 *
 * Returns null when this URL is not served from the database, so the caller can 404 it.
 */
async function viewFromDatabase(slug: string, page: Awaited<ReturnType<typeof resolvePage>>): Promise<PageView | null> {
  if (!page || page.status !== 'published') return null;
  const src = await getPageSource(slug);
  if (!src) return null;

  const url = `/location/${slug}/`;
  const bundle = page.cityId ? await getCityBundle(page.cityId) : null;
  // The city's own published service pages — the only services this page may advertise.
  const serviceSlugs = page.cityId ? await getPublishedServiceSlugs(page.cityId) : new Map<number, string>();
  const branch = bundle?.branch ?? null;
  const state = bundle?.state?.code ?? slug.slice(-2).toUpperCase();

  // The real difference between the two sources, and it is data: a database page has a city row, so
  // it has a region, so its booking tiles carry this region's actual amounts. Nothing is hardcoded —
  // when no region resolves, the tiles lose their prices exactly as a manifest page's do.
  const prices = await getPrices(bundle?.city?.regionId ?? branch?.regionId ?? null);
  const booking = pricedOptions(prices);
  // The same test the booking tiles use, reused for the pricing panel: a region that actually
  // belongs to this page, with every amount present, or no figure anywhere on the page.
  const realPrices =
    prices.isDefault || !prices.sweep_inspection || !prices.inspection || !prices.gas_diagnostic
      ? null
      : prices;

  // The seeded FAQ for this city. The rows are master copy with `{{slots}}`, and `fill()` throws on
  // a slot this page has no value for — so a row that cannot be filled is dropped rather than
  // published with a literal placeholder in it (and a price slot is unfillable exactly when no real
  // price resolved, which keeps the fallback amount off the page here too).
  let faqItems: FaqItem[] = [];
  if (bundle?.state) {
    try {
      const ctx = buildContext({
        state: bundle.state,
        ...(bundle.city ? { city: bundle.city } : {}),
        ...(branch ? { branch } : {}),
        ...(realPrices ? { prices: realPrices } : {}),
      });
      faqItems = (bundle.faqs ?? []).flatMap((f) => {
        try {
          return [{ question: fill(f.question, ctx), answer: fill(f.answer, ctx) }];
        } catch {
          return [];
        }
      });
    } catch {
      faqItems = [];
    }
  }

  // The serving branch supplies the phone and the address; WordPress's own listing meta is the
  // fallback, and neither is composed from anything else.
  const place = bundle?.city && bundle.state
    ? { city: bundle.city.name, code: bundle.state.code, state: bundle.state.name }
    : parsePlace(slug);

  return {
    source: 'database',
    slug,
    url,
    title: src.postTitle || slug,
    seoTitle: src.yoastTitle,
    metaDescription: src.yoastMetadesc,
    // Yoast's own canonical where WordPress set one; otherwise this URL on production, which is
    // what a self-canonical means here.
    canonical: src.yoastCanonical ?? `${PRODUCTION_ORIGIN}${url}`,
    phone: branch?.phone ?? src.phone,
    jobLocation: branch ? `${branch.street}, ${branch.city}, ${state} ${branch.zip}` : src.jobLocation,
    // The seeded city photo. The manifest carries WordPress's own hero instead; both land here.
    heroImage: bundle?.city?.heroImageKey
      ? {
          src: '/' + bundle.city.heroImageKey,
          alt: bundle.city.heroImageAlt ?? bundle.city.name,
          width: 1500,
          height: 1000,
        }
      : null,
    place,
    blocks: parseBody(src.postContent).blocks,
    booking,
    bookingContext: bookingContextFor(url, place, bundle),
    prices: realPrices,
    faqs: faqItems,
    branchStreet: branch?.streetShort ?? null,
    licenses: branch?.licenses ?? [],
    // The published sibling service pages for this city, straight from `site.pages`.
    directory: await buildDirectory(place, { byId: serviceSlugs }),
  };
}

/**
 * The names of the states, so a breadcrumb reads "Massachusetts" rather than "MA". This is a fixed
 * map of the United States, not a fact about any page: the only per-page input is the two-letter
 * code at the end of the slug, and a code with no entry falls back to the code itself.
 */
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** The slug's shape is `{service}-in-{city}-{st}`. Anything that does not parse yields null. */
function parsePlace(slug: string): { city: string; code: string; state: string } | null {
  const match = /-in-(.+)-([a-zA-Z]{2})$/.exec(slug);
  if (!match) return null;
  const city = match[1]
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  if (!city) return null;
  const code = match[2].toUpperCase();
  return { city, code, state: STATE_NAMES[code] ?? code };
}

/**
 * The address the site's own footer publishes (`components/chrome/Footer.tsx`, Contact column). It
 * is brand data, not page data — there is no branch-level address on a `PageView` — so it is named
 * here and passed in, the way `app/layout.tsx` names `NATIONAL_PHONE` for the header. No component
 * downstream carries an address of its own.
 */
const BRAND_EMAIL = 'harold@chimcare.com';

/** `tel:` needs the digits, and nothing else in the string is ours to reformat. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * One heading with the copy that follows it, in document order. The migrated bodies carry only
 * headings, paragraphs and list items — no section markers survive WPBakery — so a heading and the
 * blocks beneath it is the only grouping the source actually supports.
 */
type Node =
  | { kind: 'p'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'img'; image: ImageRef };

type Group = { heading: HeadingBlock | null; nodes: Node[] };

function group(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const block of blocks) {
    if (block.type === 'heading') {
      current = { heading: block, nodes: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { heading: null, nodes: [] };
      groups.push(current);
    }
    if (block.type === 'paragraph') current.nodes.push({ kind: 'p', text: block.text });
    else if (block.type === 'listItem') current.nodes.push({ kind: 'li', text: block.text });
    else if (block.src) current.nodes.push({ kind: 'img', image: toImage(block) });
  }
  return groups;
}

/** A manifest image, normalised. Anything the pipeline left out becomes null, never a stand-in. */
function toImage(block: { src: string; alt?: string | null; width?: number | null; height?: number | null }): ImageRef {
  return { src: block.src, alt: block.alt ?? '', width: block.width ?? null, height: block.height ?? null };
}

/**
 * The introduction, as the page actually shows it: the opening group's heading and everything up to
 * and including the FIRST paragraph under it. The page's later copy is not rendered — the accordion
 * and the directory below already cover what it says — so the cut is made here rather than left to
 * each section to remember.
 *
 * A group with no paragraph at all (a heading over a list, say) renders its heading and nothing
 * else. `rendered_cut()` in `chimcare-migration/scripts/stage4_build_routes.py` counts exactly the
 * blocks this function keeps, and stage 5 scores coverage against that count.
 */
function openingGroup(g: Group | null): Group | null {
  if (!g) return null;
  const at = g.nodes.findIndex((n) => n.kind === 'p');
  return { ...g, nodes: at < 0 ? [] : g.nodes.slice(0, at + 1) };
}

const paragraphsOf = (g: Group) => g.nodes.flatMap((n) => (n.kind === 'p' ? [n.text] : []));
const itemsOf = (g: Group) => g.nodes.flatMap((n) => (n.kind === 'li' ? [n.text] : []));

/** A heading that introduces the towns around the city, e.g. "Serving All of Boston, MA". */
function isAreas(g: Group): boolean {
  return (
    itemsOf(g).length > 0 &&
    !!g.heading &&
    /^(serving\b|we serve\b|areas? (we |of )?serv|service areas?\b|nearby areas?\b)/i.test(g.heading.text)
  );
}

/** A source heading never becomes an h1 — the hero's is the page's only one. */
function headingLevel(block: HeadingBlock): 2 | 3 | 4 | 5 | 6 {
  const level = Math.min(Math.max(block.level ?? 2, 2), 6);
  return level as 2 | 3 | 4 | 5 | 6;
}

/** The introduction's own heading, at its own level — never level 1, which the hero holds. */
function IntroHeading({ block }: { block: HeadingBlock }) {
  const Tag = `h${headingLevel(block)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return <Tag>{block.text}</Tag>;
}

/**
 * One carried-over image, in the reference's own figure markup. These are remote WordPress assets on
 * `www.chimcare.com`, and `next.config.ts` declares no `images.remotePatterns`, so `next/image` cannot
 * serve them — a plain `<img>` is used instead. Dimensions are emitted when the manifest has them;
 * when it does not, `.no-dims` gives the figure an aspect-ratio box, so either way the page reserves
 * the space before the file arrives and nothing shifts.
 */
function Figure({ image, className = 'ph-img' }: { image: ImageRef; className?: string }) {
  const sized = image.width != null && image.height != null;
  return (
    <figure className={sized ? className : `${className} no-dims`}>
      <img
        src={image.src}
        alt={image.alt}
        title={image.alt || undefined}
        {...(sized ? { width: image.width as number, height: image.height as number } : {})}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}

/**
 * A group's body in the order the source wrote it: paragraphs, images where they actually sit, and
 * runs of consecutive list items collapsed into one list. `firstFigureClass` lets the introduction
 * open with the reference's `.team-photo` plate while every later image is a plain `.ph-img`.
 */
function Body({ g, listClass = 'svc-list', firstFigureClass }: { g: Group; listClass?: string; firstFigureClass?: string }) {
  const out: React.ReactNode[] = [];
  let run: string[] = [];
  let figures = 0;
  const flushList = () => {
    if (!run.length) return;
    const list = run;
    run = [];
    out.push(
      <ul className={listClass} key={`ul-${out.length}`}>
        {list.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>,
    );
  };
  for (const n of g.nodes) {
    if (n.kind === 'li') {
      run.push(n.text);
      continue;
    }
    flushList();
    if (n.kind === 'p') {
      out.push(<p key={`p-${out.length}`}>{n.text}</p>);
    } else {
      const cls = figures === 0 && firstFigureClass ? firstFigureClass : 'ph-img';
      figures += 1;
      out.push(<Figure image={n.image} className={cls} key={`f-${out.length}`} />);
    }
  }
  flushList();
  return <>{out}</>;
}

/**
 * The four services the booking widget offers, with no money in the labels.
 *
 * The application's own `bookingOptions()` prints a headline price into each label, and those prices
 * are region-scoped. A manifest route is precisely a URL the database has no row for: no city, no
 * branch, therefore no region, therefore no price that belongs to this page. `getPrices(null)` can
 * only answer with the national fallback, which it flags `isDefault` — a figure that may be wrong for
 * this city. Rather than print it, the card is rendered with the same four services and the price
 * dropped from the label. No price is ever hardcoded here.
 */
const UNPRICED_OPTIONS: BookingOption[] = [
  { key: 'sweep', label: 'Chimney Sweep + Inspection' },
  { key: 'inspect', label: 'Chimney Inspection' },
  { key: 'gas', label: 'Gas Fireplace Diagnostic' },
  { key: 'quote', label: 'Repair Quote' },
];

/**
 * Real prices, or none. One rule for both sources: a region that actually belongs to this page
 * prints its amounts, and anything else prints no amount at all. The database pages reach this with
 * a resolved region and get the real tiles; a manifest page cannot, and keeps the plain labels.
 */
function pricedOptions(prices: Awaited<ReturnType<typeof getPrices>>): BookingOption[] {
  if (prices.isDefault) return UNPRICED_OPTIONS; // the national fallback is not this page's price
  if (!prices.sweep_inspection || !prices.inspection || !prices.gas_diagnostic) return UNPRICED_OPTIONS;
  return bookingOptions(prices);
}

/** The manifest's own tiles. The guard is live: if a region ever resolves, the real prices appear. */
async function manifestBookingOptions(): Promise<BookingOption[]> {
  try {
    return pricedOptions(await getPrices(null)); // no city row and no branch row → no region to scope to
  } catch {
    return UNPRICED_OPTIONS; // no pricing configured, or the database is unreachable
  }
}

/**
 * Which page the lead came from. The slug always yields the place; a database page additionally has
 * the real city and branch rows, so the lead can be attributed to them. Nothing is guessed.
 */
function bookingContextFor(
  url: string,
  place: Place | null,
  bundle: Awaited<ReturnType<typeof getCityBundle>> | null,
): BookingContext {
  return {
    pageSlug: url,
    pageKind: 'city',
    label: place ? `Chimcare · ${place.city}, ${place.code}` : 'Chimcare',
    ...(place ? { stateCode: place.code, stateName: place.state, cityName: place.city } : {}),
    ...(bundle?.city ? { cityId: bundle.city.id } : {}),
    ...(bundle?.branch ? { branchId: bundle.branch.id, branchName: bundle.branch.name } : {}),
  };
}

/* =====================================================================
   THE REFERENCE DESIGN'S OWN FIXED COPY
   None of this is a claim about a particular city. It is the brand's
   boilerplate, exactly as the client reference writes it, with the city,
   state, phone and address substituted from the page's own data. What the
   reference states per-city and this page cannot — its star rating, its
   review count, its price figures, its technician names and hours — is NOT
   here and is not invented anywhere else in this file.
   ===================================================================== */

const REASONS = [
  {
    n: '01',
    title: 'Fire safety',
    text: "Creosote builds with every fire. Removed on schedule it is a non-event; left alone it is the fuel for a chimney fire.",
  },
  {
    n: '02',
    title: 'The air you breathe',
    text: 'A clear, sound flue keeps smoke and carbon monoxide going up and out.',
  },
  {
    n: '03',
    title: 'The structure itself',
    text: 'Maintenance is far cheaper than a rebuild — and keeps the chimney standing straight.',
  },
];

const STEPS = [
  { n: '01', title: 'Inspect', text: 'A certified technician examines the firebox, damper, smoke chamber and flue.' },
  { n: '02', title: 'Diagnose', text: 'We pinpoint the cause of any leak, crack or draft problem and show you what we found.' },
  { n: '03', title: 'Clean or repair', text: 'Dust-free sweeping, or masonry, crown, flashing and liner repairs — quoted before we start.' },
  { n: '04', title: 'Protect', text: 'Caps, waterproofing and a maintenance schedule keep the repair, and the chimney, lasting.' },
];

const COST_FACTORS = ['Condition & creosote stage', 'Roof access', 'Type of service', 'Repairs needed'];

const TRUST_COPY =
  'For decades Chimcare has been the trusted choice for chimney, fireplace and vent care. Our ' +
  'technicians are certified, licensed and insured, they work with dust-free equipment, and they ' +
  'explain what they found and what it will cost before any work begins.';

/**
 * One of the reference design's own plates, in the reference's own figure markup. These are local
 * files under `/reference/`, written by the asset stage; dimensions are emitted when the manifest of
 * assets carries them, and the figure otherwise falls back to the aspect-ratio box `.no-dims` gives
 * it, so the space is reserved either way.
 */
function Plate({ asset, className }: { asset: RefAsset; className: string }) {
  const sized = asset.width != null && asset.height != null;
  return (
    <figure className={sized ? className : `${className} no-dims`}>
      <img
        src={asset.file}
        alt={asset.alt ?? ''}
        title={asset.alt || undefined}
        {...(sized ? { width: asset.width as number, height: asset.height as number } : {})}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}

/**
 * The trust band's right-hand column, built from `standardTrust()`'s four tiles rather than the
 * reference's flat image: real text, so a label can be selected, translated and read by a screen
 * reader, and a sprite icon, so it stays crisp on a high-density display. `icon` in the JSON is the
 * sprite's own id (`i-handshake`, ...); `Icon` adds the `i-` prefix itself, so it is stripped here.
 */
function TrustGrid({ tiles }: { tiles: TrustTile[] }) {
  return (
    <div className="trust-art reveal trust-grid" role="list">
      {tiles.map((t) => (
        <div className="trust-tile" role="listitem" key={t.key}>
          <Icon name={t.icon.replace(/^i-/, '')} className="ico" />
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

/* =====================================================================
   THE ALTERNATING GROUND
   The reference alternates grey and white all the way down its middle run —
   services, solutions, areas, process, cost, FAQ — and each of those sections
   carries its ground as a literal in `template.css`. That only works while the
   run is fixed, and this page's is not: the solutions band is omitted on a city
   with no published service pages, the areas band needs areas copy, and the FAQ
   needs questions that resolve. Two greys then end up adjacent and read as one
   very tall band.

   CSS cannot alternate a sequence whose members appear and disappear — `:nth-of-
   type` counts every sibling, and a `+` rule only ever fixes one pair while
   breaking the next. The renderer, on the other hand, knows exactly which
   sections it is about to emit, so the ground is decided here: each participating
   section asks for the next one as it is laid out, and the sections with a fixed
   treatment — the hero, the trust strip, the introduction, the dark band and the
   closing red panel — never ask and never shift the sequence.

   The run starts on grey, so `o1-svc` keeps the ground the reference gives it.
   ===================================================================== */
const GROUNDS = ['alt-grey', 'alt-white'] as const;

/**
 * A generator of grounds, in order. Call it once per section that actually renders; a section that
 * is omitted simply never calls it, which is the whole point — the alternation follows the emitted
 * markup rather than a list written down in advance.
 */
function alternatingGround(): () => string {
  let n = 0;
  return () => GROUNDS[n++ % GROUNDS.length];
}

/**
 * The reference page — THE template. Every `/location/{slug}/` URL renders through this function,
 * whether its `PageView` was built from the migration manifest or from the database.
 *
 * The section set is now the reference's own, in the reference's own order: hero, trust strip,
 * introduction, the dark "why Chimcare" band, the service directory, the full-service list, areas
 * served, the process steps, pricing, FAQ, contact and the closing panel.
 *
 * Two of the reference's sections are deliberately NOT reproduced: `header.hdr` and `footer.ftr`,
 * because the root layout already renders the site's header and footer. Everything else is here, and
 * every element inside it is either the page's own data or the brand boilerplate above. Elements
 * whose only possible content would be invented — the hero's star rating and award row, and any
 * price figure on a page that resolves no region — are omitted, and the section is laid out so it
 * still reads as deliberate without them.
 */
function ReferencePage({ view }: { view: PageView }) {
  const place = view.place;
  const groups = group(view.blocks);

  // The hero's lede is the REFERENCE's own line with this page's city slotted into it, so the
  // page's own first paragraph is free to be what the reference's introduction is: the first thing
  // the reader is told about this city. Only when that file is missing, malformed or unfillable —
  // a page that resolved no place cannot complete the sentence — does the hero fall back to the
  // page's first paragraph, and in that case the paragraph is lifted out of the body so it is not
  // repeated. Either way the hero has a lede; the sentence itself is never typed in here.
  const referenceLede = standardLede();
  const heroLede = referenceLede ? localise(referenceLede, place) : null;
  const ledeGroup = heroLede ? null : groups.find((g) => g.nodes.some((n) => n.kind === 'p')) ?? null;
  const lede = heroLede ?? (ledeGroup ? paragraphsOf(ledeGroup)[0] ?? null : null);
  const body = groups.map((g) => {
    if (g !== ledeGroup) return g;
    const at = g.nodes.findIndex((n) => n.kind === 'p');
    return { ...g, nodes: g.nodes.filter((_, i) => i !== at) };
  });

  const areas = body.find(isAreas) ?? null;
  const rest = body.filter((g) => g !== areas && (g.heading || g.nodes.length > 0));
  // The opening group, cut to its heading and its first paragraph — see `openingGroup`.
  const intro = openingGroup(rest[0] ?? null);
  const solutions = rest.slice(1);

  // The booking card is the application's own widget; the adapter decided whether it carries prices.
  const { booking, bookingContext, directory } = view;

  // The reference's own plates, keyed by the section they were lifted from. Absent file, absent
  // plate — every section below draws without one.
  const assets = referenceAssets();
  const introPlate = plateFor(assets, 'o1-intro');
  const trustArt = plateFor(assets, 'o1-trust-copy');
  const trustTiles = standardTrust();
  const rating = standardRating();
  const awards = heroAwards(assets);
  const svcArt = plateFor(assets, 'o1-svc');
  // The reference's service-area photograph. `template-assets.json` labels it `section` rather than
  // `areas`: its container's class is `section areas` and the asset stage takes the first token it
  // recognises. Both labels are tried, so the plate is still chosen from the file — never a path
  // typed in here — whichever label a future asset run writes.
  const areasArt =
    plateFor(assets, 'areas') ??
    assets.find((a) => a.nearestSection === 'section' && a.nearestClass === 'ph-img') ??
    null;
  const introHasFigure = !!intro && intro.nodes.some((n) => n.kind === 'img');

  // The body flow is NOT rendered. The accordion carries the reference's own eight services and the
  // directory below it carries every service this city actually has a page for, so the source's own
  // "why choose us" section and its long service list duplicated both. Removing them was an explicit
  // editorial decision, taken with the measurement in hand: it drops a median 95% of each migrated
  // body, 210,246 words across the first hundred pages.
  //
  // The words are not lost — they stay in the pipeline's own output, which is the archive. What is
  // dropped is only what this page chooses to show, and `stage5_test_render.py` scores coverage
  // against the rendered portion for exactly that reason.
  const standard = standardServices();
  // The page's one FAQ, decided once here and again in the JSON-LD from the same function.
  const faqs = renderedFaqs(view);
  const flowGroups: typeof solutions = [];

  const flow: React.ReactNode[] = [];
  for (const g of flowGroups) {
    if (g.heading) {
      const Tag = `h${headingLevel(g.heading)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      // A plain heading, not a `.sec-head`. The reference has four section heads on the whole page
      // and never uses the `left` variant at all — it only styles it. A migrated body brings 26
      // headings, and dressing each one as a section head turned the article into 49 title blocks.
      flow.push(<Tag className="flow-head" key={`head-${flow.length}`}>{g.heading.text}</Tag>);
    }
    flow.push(<Body g={g} key={`body-${flow.length}`} />);
  }

  /* SERVICE AREA. The left column is the reference's brand copy with this page's city in it. The
     right column is the page's OWN migrated list: its chips are the towns the WordPress body names,
     its lines are that section's own paragraphs, and its heading is the body's own ("Serving Nearby
     Areas", "Serving All of Boston, MA" — whatever this page actually wrote). Nothing here is
     generated: a page whose body carries no such list gets the band with no chips. */
  const areasCopy = standardAreas();
  const areaItems = areas ? itemsOf(areas) : [];
  const areasImages = areas ? areas.nodes.flatMap((n) => (n.kind === 'img' ? [n.image] : [])) : [];
  // The boilerplate heading needs a city. Where the slug yields none, the body's own heading stands
  // in rather than a half-filled sentence, and where there is neither the band does not render.
  const areasHeading = areasCopy ? localise(areasCopy.heading, place) ?? areas?.heading?.text ?? null : null;
  const areasLede = areasCopy ? localise(areasCopy.lede, place) : null;
  const areasSub =
    areas?.heading && areas.heading.text !== areasHeading ? areas.heading.text : areasCopy?.subHeading ?? null;
  // The source's own lines where it has them; the reference's line, localised, where it does not.
  const sourceLines = areas ? paragraphsOf(areas) : [];
  const areasLines = sourceLines.length > 0
    ? sourceLines
    : areasCopy
      ? [localise(areasCopy.subLede, place)].filter((t): t is string => t !== null)
      : [];

  /* WHICH SECTIONS THIS PAGE ACTUALLY EMITS, and therefore which grounds it uses. Each flag is the
     section's own render condition, named once here and used both to decide the ground and to gate
     the markup below, so the two can never disagree. The process band and the pricing panel are
     unconditional — the panel's FIGURES are conditional, the section is not. */
  const showSvc = standard.length > 0;
  const showSolutions = flow.length > 0 || !!directory;
  const showAreas = !!areasCopy && (!!areasHeading || areaItems.length > 0);
  const showFaq = faqs.length > 0;

  // Read in the order the sections appear below; an omitted one takes no turn.
  const nextGround = alternatingGround();
  const svcGround = showSvc ? nextGround() : '';
  const solutionsGround = showSolutions ? nextGround() : '';
  const areasGround = showAreas ? nextGround() : '';
  const processGround = nextGround();
  const costGround = nextGround();
  const faqGround = showFaq ? nextGround() : '';

  return (
    <>
      <main id="main">
        {/* `o1-migrated` stays because `reference.css` is scoped to it. `data-source` is the new
            signal: now that both sources render this same markup, the class can no longer tell the
            migration's stage 5 which branch produced a page, and this attribute can. */}
        <section className="option o1 o1-migrated" data-source={view.source}>
          {/* HERO — the page's only h1. With a photograph the reference promotes the figure to a
              full-bleed background plate; without one the section keeps its dark treatment, which
              `.no-photo` warms so an image-less hero still reads as a designed band, not a gap. */}
          {/* `id` is what the sticky mobile bar watches: it stays hidden until this element's bottom
              passes the top of the viewport, so it can never cover the hero's own Call and Book
              buttons. See components/chrome/StickyBar.tsx. */}
          <div id="o1-hero" className={view.heroImage ? 'hero o1-hero' : 'hero o1-hero no-photo'}>
            <div className="wrap">
              <div className="enter">
                <nav className="crumbs" aria-label="Breadcrumb">
                  <a href="/">Home</a>
                  <span>/</span>
                  <a href="/locations/">Locations</a>
                  {place && (
                    <>
                      <span>/</span>
                      <a href={`/locations/${place.code.toLowerCase()}/`}>{place.state}</a>
                      <span>/</span>
                      <span>{place.city}</span>
                    </>
                  )}
                </nav>
                <ul className="hero-trust" aria-label="Trust">
                  <li><Icon name="shield" />CSIA Certified</li>
                  <li><Icon name="cal" />Since 1989</li>
                  <li><Icon name="pin" />Local</li>
                </ul>
                {place && (
                  <p className="eyebrow">
                    {place.city}, {place.state}
                  </p>
                )}
                <h1>{view.title}</h1>
                {lede && <p className="lede">{lede}</p>}
                <div className="ctas">
                  <a className="btn btn-primary" href="#booking" data-book>
                    <em className="fast">Fast</em> Online Booking
                  </a>
                  {view.phone && (
                    <a className="btn btn-outline" href={telHref(view.phone)}>
                      <Icon name="phone" />Call {view.phone}
                    </a>
                  )}
                </div>
                {rating && (
                  <div className="hero-proof">
                    <p className="rating">
                      <svg className="glogo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
                        <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z" />
                        <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                      </svg>
                      <span className="stars" aria-hidden="true">★★★★★</span>
                      Rated <b>{rating.ratingValue}</b> on Google
                    </p>
                    {awards.length > 0 && (
                      <ul className="hero-awards">
                        {awards.map((a) => (
                          <li key={a.file}>
                            <img
                              src={a.file}
                              alt={a.alt ?? ''}
                              title={a.alt || undefined}
                              {...(a.width != null && a.height != null ? { width: a.width, height: a.height } : {})}
                              loading="lazy"
                              decoding="async"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {view.jobLocation && (
                  <p className="addr">
                    <Icon name="pin" />
                    {view.jobLocation}
                  </p>
                )}
                {view.heroImage?.src && (
                  <figure className="hero-figure">
                    <img
                      src={view.heroImage.src}
                      alt={view.heroImage.alt ?? ''}
                      title={view.heroImage.alt || undefined}
                      {...(view.heroImage.width != null && view.heroImage.height != null
                        ? { width: view.heroImage.width, height: view.heroImage.height }
                        : {})}
                      fetchPriority="high"
                      decoding="async"
                    />
                  </figure>
                )}
              </div>
              {/* The reference's hero is two columns: the page's own words on the left, the real
                  booking widget on the right. It is the same form on every page — chrome, not
                  content — and it is the app's own component, not a copy. */}
              <div className="book-slot">
                <BookingForm embedded options={booking} context={bookingContext} />
              </div>
            </div>
          </div>

          {/* TRUST STRIP — the reference's three tiles. The first two are brand boilerplate; the
              third names this city, and carries the branch street only where a branch resolved. */}
          <div className="o1-trust">
            <div className="wrap">
              <div className="t">
                <Icon name="cal" />
                <div>
                  <b>Since 1989</b>
                  <small>Family-owned, 30+ years in business</small>
                </div>
              </div>
              <div className="t">
                <Icon name="shield" />
                <div>
                  <b>Certified</b>
                  <small>Licensed &amp; insured technicians</small>
                </div>
              </div>
              <div className="t">
                <Icon name="pin" />
                <div>
                  <b>{place ? `Local ${place.city} Team` : 'Local team'}</b>
                  {view.branchStreet && <small>Based on {view.branchStreet}</small>}
                </div>
              </div>
            </div>
          </div>

          {/* INTRODUCTION — the reference's two columns: the page's own opening heading with the
              three reasons on the left, the body's own copy and imagery on the right. */}
          <div className="section o1-intro">
            <div className="wrap">
              <div className="reveal">
                {place && <p className="eyebrow">Chimcare in {place.city}</p>}
                {intro?.heading ? (
                  <IntroHeading block={intro.heading} />
                ) : (
                  <h2>Chimney, fireplace and vent care{place ? ` in ${place.city}, ${place.code}` : ''}</h2>
                )}
                <ol className="o1-reasons">
                  {REASONS.map((r) => (
                    <li key={r.n}>
                      <span className="n">{r.n}</span>
                      <div>
                        <b>{r.title}</b>
                        <span>{r.text}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="copy reveal">
                {/* The page's own photograph always wins this slot; the reference's plate is used
                    only when the body brought none of its own. */}
                {!introHasFigure && introPlate && <Plate asset={introPlate} className="team-photo" />}
                {intro && <Body g={intro} firstFigureClass="team-photo" />}
                <div className="ctas">
                  <a className="btn btn-primary" href="#booking" data-book>
                    Get a Quote
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* WHY CHIMCARE — the reference's dark band. Brand copy, this page's city in the heading. */}
          <div className="o1-trust-copy on-dark">
            <div className="wrap">
              <div className="reveal">
                <p className="eyebrow">Why Chimcare</p>
                <h2>
                  {place ? `Why ${place.city}, ${place.code} Homeowners Trust Chimcare` : 'Why Homeowners Trust Chimcare'}
                </h2>
                <p>{TRUST_COPY}</p>
              </div>
              {trustTiles.length === 4 ? (
                <TrustGrid tiles={trustTiles} />
              ) : (
                trustArt && <Plate asset={trustArt} className="trust-art reveal" />
              )}
            </div>
          </div>

          {/* SERVICE DIRECTORY — the reference's eight curated services, in the reference's own
              order and markup. This is brand copy, the same on every page, with this page's city
              filled into the two places the reference named its own. It is NOT this page's body:
              everything the migration carried over renders in the full-service section below. */}
          {showSvc && (
            <div className={`section o1-svc ${svcGround}`}>
              <div className="wrap">
                <div className={svcArt ? 'sec-head reveal' : 'sec-head one-col reveal'}>
                  <div>
                    <p className="eyebrow">Services</p>
                    <h2>
                      {place
                        ? `Chimney Sweep & Fireplace Services in ${place.city}, ${place.code}`
                        : 'Chimney Sweep & Fireplace Services'}
                    </h2>
                    <p>Each service folded into a single line. Open the one you need.</p>
                  </div>
                  {svcArt && <Plate asset={svcArt} className="ph-img" />}
                </div>
                <Accordion mode="single" className="o1-list reveal">
                  {standard.map((s, i) => {
                    // A sentence that needs a city it does not have is left out, never half-filled.
                    const summary = localise(s.summary, place);
                    const paragraphs = s.paragraphs
                      .map((p) => localise(p, place))
                      .filter((p): p is string => p !== null);
                    return (
                      <article className={i === 0 ? 'o1-row is-open' : 'o1-row'} key={s.key} data-acc-item>
                        <button className="o1-row-btn" type="button" aria-expanded={i === 0} data-acc-trigger>
                          <span className="num">{s.n}</span>
                          <span className="ic">
                            <Icon name={s.icon} />
                          </span>
                          <span>
                            <h3 className="svc-name">{s.name}</h3>
                            {summary && <p className="short svc-short">{summary}</p>}
                          </span>
                          <span className="plus">
                            <Icon name="plus" />
                          </span>
                        </button>
                        <div className="acc-panel">
                          <div>
                            {/* No photograph in here. The rows carry copy only; the section's own
                                plate above the list is the reference's imagery for this band. */}
                            <div className={paragraphs.length > 0 ? 'body' : 'body one-col'}>
                              {paragraphs.length > 0 && (
                                <div className="svc-body svc-main">
                                  {paragraphs.map((p, k) => (
                                    <p key={k}>{p}</p>
                                  ))}
                                </div>
                              )}
                              <div className="side svc-body svc-side">
                                {s.included.length > 0 && (
                                  <>
                                    <h4>What&rsquo;s included</h4>
                                    <ul className="svc-list">
                                      {s.included.map((t, k) => (
                                        <li key={k}>
                                          <Icon name="check" />
                                          {t}
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                <div className="ctas">
                                  <a className="btn btn-primary" href="#booking" data-book>
                                    {s.cta}
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </Accordion>
              </div>
            </div>
          )}

          {/* FULL-SERVICE — the reference's service directory, then every remaining heading with
              its own copy and imagery, in body order. The directory lists ONLY the services this
              city actually has a page for, so a city with none renders no directory (and, with no
              body flow either, no section at all) rather than an empty grid. */}
          {showSolutions && (
            <div className={`section o1-solutions ${solutionsGround}`} id="o1-solutions">
              <div className="wrap">
                {directory ? (
                  <div className={directory.lede ? 'sec-head reveal' : 'sec-head one-col reveal'}>
                    <div>
                      <p className="eyebrow">{directory.eyebrow}</p>
                      {directory.heading && <h2>{directory.heading}</h2>}
                    </div>
                    {directory.lede && <p>{directory.lede}</p>}
                  </div>
                ) : (
                  <div className="sec-head one-col reveal">
                    <div>
                      <p className="eyebrow">Full-service</p>
                    </div>
                  </div>
                )}
                {directory && (
                  <ServiceDirectory tiles={directory.tiles} cards={directory.cards} count={directory.count} />
                )}
                {flow}
              </div>
            </div>
          )}

          {/* SERVICE AREA — the reference's own band. It renders on every page that has a city to
              name or a list of its own; the chips are the page's own towns, or there are none. */}
          {showAreas && areasCopy && (
            <div className={`section areas ${areasGround}`}>
              <div className="wrap">
                {/* Copy left, the band's photograph right; one column on a narrow screen. */}
                <div className="e-top">
                  <div className="reveal">
                    <p className="eyebrow">{areasCopy.eyebrow}</p>
                    {areasHeading && <h2>{areasHeading}</h2>}
                    {areasLede && <p className="lede">{areasLede}</p>}
                  </div>
                  <div className="reveal">
                    {areasImages.length > 0
                      ? areasImages.map((image, i) => <Figure image={image} key={`areas-img-${i}`} />)
                      : areasArt && <Plate asset={areasArt} className="ph-img" />}
                  </div>
                </div>
                {/* The rail's own head: the band's sub-heading and line on the left, and — only when
                    there is a rail to drive — the island's two arrows on the right. */}
                <div className="rail-head reveal">
                  <div className="rail-head-copy">
                    {areasSub && <h3 className="areas-sub">{areasSub}</h3>}
                    {areasLines.map((text, i) => (
                      <p className="areas-line sub" key={`areas-line-${i}`}>
                        {text}
                      </p>
                    ))}
                  </div>
                  {areaItems.length >= AREA_RAIL_ARROWS_FROM && <AreaRailControls railId={AREA_RAIL_ID} />}
                </div>
                {areaItems.length > 0 ? (
                  /* Every chip is server HTML: the arrows are an enhancement, and with no JavaScript
                     at all the rail still lists every area and still scrolls by swipe. */
                  <ul className={`rail reveal${areaItems.length < AREA_RAIL_TWO_ROWS_FROM ? ' one-row' : ''}`} id={AREA_RAIL_ID} tabIndex={0} aria-label={areasSub ?? areasCopy.subHeading}>
                    {areaItems.map((text, i) => (
                      <li key={`area-${i}`} title={shortenArea(text).truncated ? text : undefined}>
                        <Icon name="pin" />
                        {shortenArea(text).truncated ? (
                          <>
                            <span aria-hidden="true">{shortenArea(text).short}</span>
                            <span className="sr-only">{text}</span>
                          </>
                        ) : (
                          text
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  /* No migrated list: brand boilerplate with this page's own place in it. A
                     neighbourhood is never invented to fill the rail. */
                  <div className="areas-empty reveal">
                    <p className="areas-empty-head">Coverage coming soon to this area.</p>
                    {place && (
                      <p className="areas-empty-line">
                        We&rsquo;re expanding across {place.city}, {place.code}.
                      </p>
                    )}
                    {/* No quote link inside the panel: the section's own Get a Quote button sits
                        directly beneath it, and two identical calls to action a few pixels apart read
                        as a mistake rather than as emphasis. */}
                  </div>
                )}
                <div className="ctas areas-ctas">
                  <a className="btn btn-primary" href="#booking" data-book>
                    {areasCopy.cta}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* PROCESS — the reference's four steps. Brand boilerplate, identical on every page. */}
          <div className={`section ${processGround}`}>
            <div className="wrap">
              <div className="sec-head reveal">
                <div>
                  <p className="eyebrow">How it works</p>
                  <h2>From first look to lasting protection.</h2>
                </div>
                <p>One crew from inspection to repair — no hand-offs, no second contractor.</p>
              </div>
              <ol className="o1-steps reveal">
                {STEPS.map((step) => (
                  <li className="o1-step" key={step.n}>
                    <span className="dot">{step.n}</span>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* PRICING — prose and the factors that move a quote, always. Figures ONLY when a region
              that belongs to this page resolved real amounts; otherwise the paragraph says how the
              quote is reached and names no number at all. The national fallback is never printed. */}
          {/* `id` is the quick-actions rail's "Get a quote" target — the reference points that
              action at `#o1-cost`, and this section is our pricing block. It had the class and no
              id, so the anchor had nothing to land on. */}
          <div id="o1-cost" className={`section o1-cost ${costGround}`}>
            <div className="wrap">
              <div className="panel reveal">
                <div>
                  <p className="eyebrow">Pricing</p>
                  <h2>
                    {place ? `How much does chimney service cost in ${place.city}?` : 'How much does chimney service cost?'}
                  </h2>
                  {view.prices ? (
                    <p>
                      A chimney sweep with inspection is {money(view.prices.sweep_inspection)}, an inspection on its own is{' '}
                      {money(view.prices.inspection)}, and a gas fireplace diagnostic is {money(view.prices.gas_diagnostic)}.
                      Repairs are quoted once a technician has seen the chimney, and the quote always comes before the work.
                    </p>
                  ) : (
                    <p>
                      Every chimney is different, so the price follows the work rather than a list. A technician looks first,
                      explains what they found, and quotes the job before anything starts.
                    </p>
                  )}
                  <div className="factors">
                    {COST_FACTORS.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                </div>
                <div className="ctas">
                  <a className="btn btn-primary" href="#booking" data-book>
                    Request a repair quote
                  </a>
                  {view.phone && (
                    <a className="btn btn-ghost" href={telHref(view.phone)}>
                      <Icon name="phone" />
                      {view.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FAQ — the reference's own seven questions, in the reference's own position (this is
              where its contact band sat; the page's phone and address are in the hero already).
              Only the questions this page can honestly ask: see `renderedFaqs`. */}
          {showFaq && (
            <div className={`section ${faqGround}`}>
              <div className="wrap">
                <div className="sec-head one-col reveal">
                  <div>
                    <p className="eyebrow">FAQ</p>
                    <h2>Frequently Asked Questions</h2>
                  </div>
                </div>
                <Accordion mode="single" className="faq reveal">
                  {faqs.map((f, i) => (
                    <div className={i === 0 ? 'faq-item is-open' : 'faq-item'} key={f.question} data-acc-item>
                      <button className="faq-q" type="button" aria-expanded={i === 0} data-acc-trigger>
                        {f.question}
                        <Icon name="plus" />
                      </button>
                      <div className="acc-panel">
                        <div>
                          <p className="faq-a">{f.answer}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </Accordion>
              </div>
            </div>
          )}

          {/* FINAL — the reference's closing panel: brand copy, this page's city, phone and address. */}
          <div className="section o1-final">
            <div className="wrap">
              <div className="panel on-dark reveal">
                <div>
                  <p className="eyebrow">{place ? `Chimcare \u00b7 ${place.city}, ${place.code}` : 'Chimcare'}</p>
                  <h2>{place ? `Keep your ${place.city} chimney safe.` : 'Keep your chimney safe.'}</h2>
                  <p>
                    Schedule a professional inspection or service with Chimcare. Dust-free equipment, certified
                    technicians, and a quote before the work starts.
                  </p>
                </div>
                <div className="side">
                  <a className="btn btn-primary" href="#booking" data-book>
                    Schedule Service
                  </a>
                  {view.phone && (
                    <a className="phone" href={telHref(view.phone)}>
                      {view.phone}
                    </a>
                  )}
                  {view.jobLocation && <span>{view.jobLocation}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      {/* The reference's desktop quick-actions rail. It lives outside `<main>`, as a sibling of the
          sheet it opens, exactly as in the reference markup. */}
      <LocationQuickActions
        phone={view.phone ?? undefined}
        phoneHref={view.phone ? telHref(view.phone) : undefined}
        email={BRAND_EMAIL}
        quoteHref="#o1-cost"
      />
      {/* The layout's sticky mobile bar opens this sheet; without it the bar's Book button is inert. */}
      <BookingSheet options={booking} context={bookingContext} />
    </>
  );
}

/** The JSON-LD graph, built only from values the page actually holds — either source. */
function referenceJsonLd(view: PageView) {
  const url = view.canonical;
  const name = view.seoTitle ?? view.title;
  // The FAQ, from the same function the section renders, so a question a guard omitted — the priced
  // one on a page with no region, the climate one on every page — is absent here too. A FAQPage
  // node with no question is not emitted at all.
  const faqs = renderedFaqs(view);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name,
        ...(view.metaDescription ? { description: view.metaDescription } : {}),
        isPartOf: { '@id': `${PRODUCTION_ORIGIN}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name, item: url },
        ],
      },
      {
        '@type': 'Organization',
        '@id': `${PRODUCTION_ORIGIN}/#organization`,
        name: SITE_NAME,
        url: `${PRODUCTION_ORIGIN}/`,
      },
      ...(faqs.length > 0
        ? [
            {
              '@type': 'FAQPage',
              '@id': `${url}#faq`,
              isPartOf: { '@id': `${url}#webpage` },
              mainEntity: faqs.map((f) => ({
                '@type': 'Question',
                name: f.question,
                acceptedAnswer: { '@type': 'Answer', text: f.answer },
              })),
            },
          ]
        : []),
    ],
  };
}

/**
 * The fate first — the `site.pages` row still decides whether a URL is served at all, and a
 * redirect is answered before either source is consulted, exactly as before.
 *
 * Then the manifest, then the database. The manifest wins a tie deliberately: it is the migration's
 * own extraction of the same WordPress body, and rendering it is the point of the exercise. Only
 * when neither source has content is the URL a 404.
 */
async function load(slug: string) {
  const page = await resolvePage(slug);
  if (page?.fate === 'redirect' && page.redirectTo) return { kind: 'redirect' as const, to: page.redirectTo };

  // Then the pipeline's own rewrite, BEFORE the manifest. Stage 7 moves a migrated page from
  // `{service}-in-{city}-{st}` to `{service}-{city}-{st}` and deletes the old `routes` row, so the
  // `redirects` table is the only remaining record that the old URL existed: asked after the route
  // lookup this would be unreachable, and the moved URL would 404 instead of pointing at its new
  // home. No store, no table or no row all mean "not moved", and the page behaves exactly as it did
  // before stage 7 was ever run.
  const moved = readRedirect(slug);
  if (moved) return { kind: 'redirect' as const, to: `/location/${moved}/` };

  const route = findRoute(slug);
  if (route) return { kind: 'page' as const, view: await viewFromManifest(route) };

  const view = await viewFromDatabase(slug, page);
  if (view) return { kind: 'page' as const, view };
  return { kind: 'missing' as const };
}

/**
 * Metadata for a location page, from either source. This is the real `/location/` URL, so it is
 * indexable and canonical to itself. The title is WordPress's own — Yoast's where the source has
 * one — and the description is only emitted when WordPress has one. Neither is invented.
 */
function referenceMetadata(view: PageView): Metadata {
  const url = view.canonical;
  const title = view.seoTitle ?? view.title;
  const description = view.metaDescription ?? undefined;
  const place = view.place;
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title,
      url,
      siteName: SITE_NAME,
      locale: 'en_US',
      ...(description ? { description } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      ...(description ? { description } : {}),
    },
    ...(place ? { other: { 'geo.region': `US-${place.code}`, 'geo.placename': place.city } } : {}),
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  // Title and description are the source's own. Where WordPress has none, none is invented: the
  // page falls back to its own hero heading, and carries no description at all. ISSUE-025 / ISSUE-026.
  if (r.kind === 'page') return referenceMetadata(r.view);
  return { title: 'Not found', robots: { index: false } };
}

export default async function LocationRoute({ params }: { params: Params }) {
  const { slug } = await params;
  const r = await load(slug);
  if (r.kind === 'redirect') permanentRedirect(r.to); // the edge answers 301 in production; this is the fallback
  if (r.kind === 'missing') notFound();
  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- JSON-LD requires raw script content */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(referenceJsonLd(r.view)) }} />
      <ReferencePage view={r.view} />
    </>
  );
}
