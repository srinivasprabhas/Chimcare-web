# chimcare-web — project guide for Claude Code

Read this first. Then `docs/architecture.md` before any structural change.

## What this is
Next.js 16 (App Router) rebuild of Chimcare.com's location pages — part of the WordPress → Next.js migration
(229,621 legacy `job_listing` URLs; SEO must not regress). This repo is the **Minnesota vertical slice**:
production-shaped schema, loaders, content assembly and templates, with test data for one state.
Three templates from the design mocks: national hub `/locations/`, state hub `/locations/{state}/`,
city page `/location/{legacy-slug}/`, plus a derived service page (decision Q1 still open).

## Commands
- `npm run dev` — embedded Postgres (PGlite) migrates + seeds itself; no DB setup. `PGLITE_DATA_DIR=.pglite` persists it.
- `npm run build && npm start` — production build (all location routes are dynamic on purpose in this slice).
- `npm run typecheck` — must pass before you finish.
- `npm run db:generate` — regenerate the migration after editing `lib/db/schema.ts`. Never hand-edit SQL in `lib/db/migrations`.
- `npm run seed -- --reset` — truncate and reseed (works on PGlite or on `DATABASE_URL`).
- `node scripts/build-mn-seed.mjs [--dry-run] [--no-geocode]` — regenerates `data/seed/minnesota.generated.json` from the sibling repos (see below). Needs `../Chimcare-Migration` and `../chimcare-rebuild-main` next to this folder.
- `node scripts/check-pages.mjs http://localhost:3000` — fetches every test URL, prints what rendered, posts a booking and reads it back. Run it after changes (`ADMIN_TOKEN=x` if the server runs in production mode).
- `npm run port:css -- <dir-with-the-three-mock-html-files>` — regenerates `styles/{tokens,base,hub,state,city}.css` from the design mocks (`locations_new3.html`, `washington-locations.html`, `spokane.html`). The mocks are not in the repo; ask for them.

## Non-negotiable conventions
- **Postgres is the source of truth.** Only `lib/data/*.ts` runs SQL (Drizzle). Templates receive fully-resolved props from `lib/content/assemble.ts` / `assemble-hubs.ts` and never see a DB row or a `{{slot}}`.
- **No literals for business facts.** Prices, phones, addresses, neighbourhoods, city/state names come from rows and region pricing via slots (`lib/content/slots.ts`). An unknown slot throws — keep it that way.
- **URLs are legacy WordPress slugs and never change.** `trailingSlash: true`. One dynamic route `app/location/[slug]/page.tsx`; the `site.pages` row decides city | service | redirect | 404. Don't add route-per-template.
- **Tier B pages must pass `distinctnessGate()`** or the route 404s. Don't loosen the gate to make a page appear; fix the data.
- **SEO:** never emit `AggregateRating`/`Review` markup; JSON-LD is built in assemble; canonical is self; unpublished → 404.
- **CSS:** `styles/tokens|base|hub|state|city.css` are generated — don't hand-edit; change `scripts/port-css.mjs` and regenerate. New styles go in new files (`styles/booking.css` is the pattern). Public site = ported mock CSS; Tailwind only for `/admin` (not set up yet).
- **Client JS is islands only** (`components/islands/*`, `'use client'` leaves). All content must be in the server HTML; islands add behaviour (accordion, filter, reveal, booking).
- **Booking** goes through `lib/booking/adapter.ts` (`MockAdapter` now, `WorkizAdapter` stub). Validation in `lib/booking/validate.ts` runs on client (per step) and server (whole payload).
- Scripts that write to a database must be idempotent and support `--dry-run`.
- Keep DB access through the Supabase pooler (transaction mode, `prepare: false`) — Cloud Run scales instances.

## Layout
```
app/                 routes: locations/, locations/[state]/, location/[slug]/ (dispatcher), api/bookings, api/health, admin/bookings
components/chrome    Header Footer StickyBar Sprite Icon        components/sections/shared.tsx
components/templates NationalHub StateHub CityPage ServicePage   components/islands/*
lib/db               schema.ts client.ts seed.ts migrations/     lib/data/*  typed loaders
lib/content          slots.ts assemble.ts assemble-hubs.ts        lib/booking/* lib/seo (in assemble)
data/seed            minnesota.ts (reads minnesota.generated.json + minnesota-local.ts) services.ts masters.ts    styles/  scripts/  docs/architecture.md
```

## Test matrix (all should hold after any change)
| URL | Expect |
|---|---|
| `/locations/` | 200, one state card per state with migrated URLs (7: MA AZ IL MN OH GA WI), from `data/routes.sqlite`; footer lists the same states |
| `/locations/{st}/` | 200, exactly one card per migrated URL (MA 885, AZ 22, IL 16, MN 14, OH 12, GA 10, WI 5; `-2`/`-3` duplicates not listed); every card links to a live page. Unknown state → 404 |
| `/location/chimney-sweep-fireplace-in-minneapolis-mn/` | 200 branch city: 120 South 6th St, 612-509-9564, $299/$69/$49, 92 cards (linked where the URL is live), `HomeAndConstructionBusiness` |
| `/location/chimney-sweep-repair-in-bloomington-mn/` | 200 coverage city: no street address, areas from the live page, `Service` schema |
| `/location/chimney-crown-sealing-in-minneapolis-mn/` | 200 service page, "Repair Quote" preselected |
| `/location/chimney-sweep-repair-in-minneapolis-mn/` | 308 → `chimney-sweep-fireplace-in-minneapolis-mn` (redirects.json) |
| `/location/chimney-caps-repair-in-bloomington-mn-2/` | 404 (gone.json; edge answers 410 in production) |
| `/location/chimney-sweep-repair-in-isanti-mn/` | 404 (coverage city in review: no city FAQ yet) |
| `/location/chimney-nest-removal-in-minneapolis-mn/` | 404 (live Tier A URL outside the 92-service catalogue → `kind = legacy`, no template yet) |
| `POST /api/bookings/` | 201 `{reference}`; invalid payload → 422 with field errors |

## Where the Minnesota data comes from — what is real and what is draft
- `data/seed/minnesota.generated.json` is **generated** by `node scripts/build-mn-seed.mjs` from `../Chimcare-Migration/output/job_listings.jsonl`
  and `../chimcare-rebuild-main/site/data/{branches,keep-pages,redirects,gone,pricing}.json` + `content/hubs/state-mn.md`. Never hand-edit it; rerun the script
  (`--dry-run` prints counts, `--no-geocode` skips the network). It carries the real branches (address, phone, coordinates), city pages, meta descriptions,
  prices and the fate of every legacy Minnesota URL.
- `data/seed/mn-geocode.json` caches Nominatim coordinates for cities that have none in WordPress. A coverage city's serving branch is the **nearest**
  branch (`branchAssignment: "nearest"`) — a heuristic until the business confirms territories.
- `data/seed/minnesota-local.ts` is **draft copy** (neighbourhoods, local lines, FAQs) for the 14 branch cities, written so those pages can pass the gate.
  Review before anything ships. Coverage cities get areas and climate lines from their own live pages and stay in review until they have a FAQ.
- Still placeholders: the city hero photo (state photo reused; media import is M6), branch licence numbers (empty in branches.json), Google ratings (null).
- Live MN URLs whose service is not one of the 92 catalogue services are seeded as `kind = 'legacy'` and answer 404 until `LegacyShell` / `page_sections` exist.

## Decisions (settled — don't reopen without asking)
App Router; DB-driven dispatch; trailing slashes; slugs as in DB + `pages.legacy_url` tracked; non-branch cities are `cities.kind = 'coverage'`;
booking behind an adapter (mock → Workiz); no rating markup; ported CSS (Tailwind only for admin); Next 16 / React 19 / Drizzle / Node 22.

## Open questions (don't assume an answer — flag them)
- Q1: service×city URLs as pages (Tier A/B) + redirect Tier C, or redirect all to the city page.
- Q2b: state slug `/locations/mn/` vs `/locations/minnesota/`.
- Q5: source of the visible "Rated 4.7 on Google" (`branches.rating` is null until known).
- Q6: confirm prices really differ by region; which three headline prices appear on location pages.
- Workiz slot availability → step 2 of the booking form becomes a live picker.

## Next milestones (see docs/architecture.md §19)
M3 Leaflet map island + finder search · M4 per Q1 · M5 Workiz adapter, Turnstile, BullMQ retry, confirmation email ·
M6 edge Worker + KV redirects, Valkey cache handler, R2 media + `next/image` loader, sitemaps · Tier A verbatim sections (`page_sections`) ·
seed from `mig.*` · admin (masters, branches, cities, pricing upload) with Tailwind.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
