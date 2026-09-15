import type { AccordionItem, EditorialBlock, State } from '@/lib/db/schema';
import type { Prices } from '@/lib/data/pricing';
import type { MigratedState } from '@/lib/data/migrated-locations';
import { buildContext, fillDeep, money, phoneHref } from './slots';
import { SITE_URL, bookingOptions, type BookingOption, type Crumb, type TrustItem } from './assemble';
import type { BookingContext } from '@/lib/booking/types';

const NATIONAL_PHONE = '1-800-362-4840';

const CREW = [
  { src: '/img/crew-sweeping.jpg', alt: 'A Chimcare technician sweeping a chimney from a rooftop', title: 'Sweeping', small: 'Dust-controlled, roof or hearth side' },
  { src: '/img/crew-inspection.jpg', alt: 'A Chimcare technician documenting a fireplace inspection', title: 'Inspection', small: 'Documented with photos before we leave' },
  { src: '/img/crew-masonry.jpg', alt: 'A Chimcare mason repairing a masonry chimney', title: 'Repair & masonry', small: 'Crowns, caps, flashing and rebuilds' },
  { src: '/img/crew-gas.jpg', alt: 'A serviced gas fireplace burning behind a screen', title: 'Gas fireplace service', small: 'Ignition, valve and safety checks' },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// ---- state hub -------------------------------------------------------------------------------

export type LocationCard = {
  id: string;
  name: string;
  kind: 'branch' | 'coverage';
  title: string;
  addressLines: string[];
  servedFrom?: string;
  phone: string;
  phoneHref: string;
  href?: string; // undefined when the city page is not published
  photo?: { src: string; alt: string };
  search: string;
  lat?: number; // map pin; absent when the location has no coordinates
  lng?: number;
};

export type StateHubProps = {
  imgState: string;
  /** Licence credit for the hero photograph, where one is required. */
  imgCredit?: string;
  crumbs: Crumb[];
  hero: { name: string; lede: string; count: number };
  trust: TrustItem[];
  directory: { eyebrow: string; heading: string; lede: string; cards: LocationCard[] };
  /** One pin per city. Absent → one pin per card. */
  mapCards?: LocationCard[];
  intro: { eyebrow: string; heading: string; paragraphs: string[]; stats: Array<{ title: string; body: string }> };
  editorial: EditorialBlock[];
  detail: { eyebrow: string; heading: string; lede: string; items: AccordionItem[] };
  crew: Array<{ src: string; alt: string; title: string; small: string }>;
  finalCta: { eyebrow: string; heading: string; paragraph: string };
  phone: string;
  phoneHref: string;
  booking: BookingOption[];
  bookingContext: BookingContext;
  meta: { title: string; description: string; canonical: string };
  jsonLd: unknown[];
};

/** The state's own copy, whichever source it came from, with every slot already filled. */
export type HubState = {
  code: string;
  slug: string;
  name: string;
  blurb: string;
  heroLede: string;
  introHeading: string;
  introParagraphs: string[];
  climateNotes: State['climateNotes'];
  editorial: EditorialBlock[];
  detailAccordion: AccordionItem[];
  photo: string;
  photoCredit?: string;
};

/** "Chimcare serves Ohio homeowners through 12 location pages across 12 cities." — counted, never typed. */
export function stateBlurb(s: MigratedState): string {
  return `Chimcare serves ${s.name} homeowners through ${plural(s.locations.length, 'location page', 'location pages')} across ${plural(s.cities.length, 'city', 'cities')}.`;
}

/** A state that has a reviewed `site.states` row (Minnesota): its own copy, slots filled with its prices. */
export function hubStateFromRow(row: State, prices: Prices, migrated: MigratedState): HubState {
  const ctx = buildContext({ state: row, prices });
  return {
    code: row.code,
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    heroLede: row.heroLede,
    introHeading: row.introHeading,
    introParagraphs: fillDeep(row.introParagraphs, ctx),
    climateNotes: row.climateNotes,
    editorial: row.editorial,
    detailAccordion: fillDeep(row.detailAccordion, ctx),
    photo: migrated.photo ?? '/' + (row.photoKey ?? 'img/css-aaaca1ea.webp'),
    ...(migrated.photoCredit ? { photoCredit: migrated.photoCredit } : {}),
  };
}

/**
 * A state with migrated URLs but no reviewed state copy yet. Brand copy only: what Chimcare does,
 * with the state's name and its own cities filled in. No climate, code or price claim is made for a
 * state nobody has written about.
 */
export function genericHubState(s: MigratedState): HubState {
  const sample = listNames(s.cities.slice(0, 3).map((c) => c.name));
  const more = s.cities.length > 3 ? ' and nearby towns' : '';
  return {
    code: s.code,
    slug: s.slug,
    name: s.name,
    blurb: stateBlurb(s),
    heroLede: `Chimney sweeping, inspection, repair and masonry from local Chimcare crews in ${sample}${more}. Pick your location below for its page, phone number and address.`,
    introHeading: `Chimney sweep, repair and fireplace service across ${s.name}.`,
    introParagraphs: [
      `Chimcare crews in ${s.name} handle the full range of chimney and fireplace work — annual sweeps and inspections, crown, flashing and masonry repair, liners, caps and gas fireplace service.`,
      'Every job starts with an inspection and a written quote, so you know what was found and what it will cost before any work begins.',
    ],
    climateNotes: [
      { title: 'Sweeping & inspection', body: 'Creosote removal, inspections and draft checks' },
      { title: 'Repair & masonry', body: 'Crowns, caps, flashing, liners and tuckpointing' },
      { title: 'Gas fireplaces', body: 'Ignition, valve and safety checks year-round' },
    ],
    editorial: [
      {
        eyebrow: 'Sweeping',
        heading: `${s.name} chimney sweep services: keeping your home safe and warm.`,
        intro: 'Regular sweeping keeps creosote from building up in the flue and keeps a fireplace or stove drafting the way it should. Our sweep service goes beyond simple cleaning:',
        bullets: [
          'Thorough removal of creosote, soot, and debris',
          'Inspection of the flue, crown and firebox',
          'Checking for and removing animal nests',
          'Ensuring proper drafting to prevent smoke backflow',
        ],
        outro: `By choosing Chimcare in ${s.name}, you're not just getting a clean chimney — you're investing in your home's safety and efficiency.`,
        imageKey: 'img/ed-sweep.jpg',
        imageAlt: `Professional chimney sweep service in ${s.name}`,
      },
      {
        eyebrow: 'Repair',
        heading: `Expert ${s.name} chimney repair: restoring function and safety.`,
        intro: 'Weather, water and time all take a toll on masonry. Our chimney repair services cover:',
        bullets: [
          'Repairing spalled brick and deteriorated mortar',
          'Fixing crown and cap damage',
          'Rebuilding flashing where water has got in',
          'Installing or replacing flue liners',
          'Tuckpointing and masonry repair',
        ],
        imageKey: 'img/ed-repair.jpg',
        imageAlt: `Chimney repair service in ${s.name} by a Chimcare expert`,
        flip: true,
      },
    ],
    detailAccordion: [
      {
        question: `Chimney inspections in ${s.name}: preventing problems before they start`,
        intro: 'A Chimcare inspection covers the whole system, not just the flue:',
        bullets: [
          'Cracking in the crown, flue tiles and firebox',
          'Flashing and water damage at the roofline',
          'Clearances and liner condition on stoves and inserts',
          'Caps, dampers and signs of animal entry',
        ],
      },
      {
        question: `Chimney and masonry services across ${s.name}`,
        intro: 'Beyond sweeping and inspection, local crews handle:',
        bullets: [
          'Chimney caps and crickets',
          'Masonry waterproofing',
          'Stainless steel liners for stoves and inserts',
          'Gas fireplace, insert and log set service',
        ],
      },
      {
        question: 'How is chimney work priced?',
        paragraphs: [
          'Sweeps, inspections and gas fireplace diagnostics are priced up front — book online or call your local crew for the price at your address.',
          "Repair and masonry work is quoted on site after an inspection, with a written quote and no obligation. You'll see the price before any work starts.",
        ],
      },
    ],
    photo: s.photo ?? '/img/css-aaaca1ea.webp',
    ...(s.photoCredit ? { photoCredit: s.photoCredit } : {}),
  };
}

/** One card per migrated URL in the state — exactly as many cards as the state has URLs. */
export function migratedLocationCards(s: MigratedState): LocationCard[] {
  return s.locations.map((l) => ({
    id: l.slug,
    name: l.cityName,
    kind: 'branch',
    title: l.title,
    addressLines: l.addressLines,
    servedFrom: l.addressLines.length ? undefined : `${l.cityName}, ${l.code}`,
    phone: l.phone ?? NATIONAL_PHONE,
    phoneHref: phoneHref(l.phone ?? NATIONAL_PHONE),
    href: l.url,
    ...(l.photo ? { photo: l.photo } : {}),
    search: [l.cityName, l.title, ...l.addressLines].join(' '),
    ...(l.lat != null && l.lng != null ? { lat: l.lat, lng: l.lng } : {}),
  }));
}

/** One pin per city, linking to the city's main page, so 136 Cambridge URLs are one Cambridge pin. */
function migratedCityPins(s: MigratedState): LocationCard[] {
  return s.cities.map((c) => ({
    id: `city-${c.slug}`,
    name: c.name,
    kind: 'branch',
    title: `Chimcare in ${c.name}, ${s.code}`,
    addressLines: c.addressLines,
    phone: c.phone ?? NATIONAL_PHONE,
    phoneHref: phoneHref(c.phone ?? NATIONAL_PHONE),
    href: c.href,
    search: c.name,
    ...(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : {}),
  }));
}

export function assembleStateHub(input: {
  state: HubState;
  migrated: MigratedState;
  prices: Prices;
  /** True only where the state's own region priced these amounts; otherwise no price is printed as local. */
  localPrices: boolean;
}): StateHubProps {
  const { state, migrated, prices, localPrices } = input;
  const canonical = `${SITE_URL}/locations/${state.slug}/`;
  const cards = migratedLocationCards(migrated);
  const cityCount = migrated.cities.length;

  const meta = {
    title: `Chimcare Locations in ${state.name} | Chimney Sweep & Repair`,
    description: `${state.blurb} Find your local ${state.name} Chimcare crew.`,
    canonical,
  };

  return {
    imgState: state.photo,
    ...(state.photoCredit ? { imgCredit: state.photoCredit } : {}),
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Locations', href: '/locations/' }, { label: state.name }],
    hero: { name: state.name, lede: state.heroLede, count: cards.length },
    trust: [
      { icon: 'cal', title: 'Since 1989', small: `30+ years serving homeowners` },
      { icon: 'shield', title: 'Certified', small: 'CSIA certified & background-checked' },
      localPrices
        ? { icon: 'snow', title: `Built for ${state.name} weather`, small: state.climateNotes[0]?.body ?? '' }
        : { icon: 'pin', title: `${plural(cityCount, 'city', 'cities')} in ${state.name}`, small: listNames(migrated.cities.slice(0, 3).map((c) => c.name)) },
      localPrices
        ? { icon: 'flame', title: `Gas fireplace diagnostic ${money(prices.gas_diagnostic)}`, small: 'Ignition, valve and safety check' }
        : { icon: 'wrench', title: 'Free repair & masonry quotes', small: 'Priced on site before work starts' },
    ],
    directory: {
      eyebrow: `${state.name} directory`,
      heading: 'Pick the crew nearest you.',
      lede: `All ${plural(cards.length, 'Chimcare location page', 'Chimcare location pages')} in ${state.name}, across ${plural(cityCount, 'city', 'cities')}.`,
      cards,
    },
    mapCards: migratedCityPins(migrated),
    intro: { eyebrow: state.name, heading: state.introHeading, paragraphs: state.introParagraphs, stats: state.climateNotes },
    editorial: state.editorial,
    detail: {
      eyebrow: 'More detail',
      heading: `Inspections, ${state.name}-specific services and what sets us apart.`,
      lede: 'The full detail is here — open only the parts that apply to your home.',
      items: state.detailAccordion,
    },
    crew: CREW,
    finalCta: {
      eyebrow: `Chimcare · ${state.name}`,
      heading: 'Schedule your service today and experience the local difference.',
      paragraph: `Keeping ${state.name}'s chimneys safe, efficient, and well-maintained since 1989.`,
    },
    phone: NATIONAL_PHONE,
    phoneHref: phoneHref(NATIONAL_PHONE),
    booking: bookingOptions(prices),
    bookingContext: { pageSlug: `/locations/${state.slug}/`, pageKind: 'state', label: `Chimcare · ${state.name}`, stateCode: state.code, stateName: state.name },
    meta,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', '@id': canonical, url: canonical, name: meta.title, description: meta.description, inLanguage: 'en' },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Locations', item: `${SITE_URL}/locations/` },
              { '@type': 'ListItem', position: 3, name: state.name },
            ],
          },
          {
            '@type': 'ItemList',
            name: `Chimcare locations in ${state.name}`,
            itemListElement: cards.filter((c) => c.href).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, url: `${SITE_URL}${c.href}` })),
          },
        ],
      },
    ],
  };
}

// ---- national hub ----------------------------------------------------------------------------

export type StateCard = {
  code: string;
  name: string;
  verified: boolean;
  blurb: string;
  photo?: string;
  photoAlt?: string;
  photoCredit?: string;
  cities: string[];
  href?: string;
};

export type NationalHubProps = {
  hero: { states: number; cities: number };
  trust: TrustItem[];
  stateCards: StateCard[];
  /**
   * The city directory: every state with the cities Chimcare lists in it, for the `#dirlist`
   * accordion the finder filters. Cities with a published page carry an href; the rest are listed
   * without one rather than linked to a 404.
   */
  directoryGroups: Array<{ name: string; coverageOnly: boolean; cities: Array<{ name: string; href?: string }> }>;
  coverageOnly: string[];
  crew: StateHubProps['crew'];
  phone: string;
  phoneHref: string;
  booking: BookingOption[];
  bookingContext: BookingContext;
  meta: { title: string; description: string; canonical: string };
  jsonLd: unknown[];
};

/** Every state with migrated URLs, each linked to its hub, each city linked to its own page. */
export function assembleNationalHub(input: { states: MigratedState[]; prices: Prices }): NationalHubProps {
  const { states, prices } = input;
  const canonical = `${SITE_URL}/locations/`;
  const stateCards: StateCard[] = states.map((s) => ({
    code: s.code,
    name: s.name,
    verified: true,
    blurb: stateBlurb(s),
    ...(s.photo ? { photo: s.photo } : {}),
    photoAlt: s.photoAlt,
    ...(s.photoCredit ? { photoCredit: s.photoCredit } : {}),
    cities: s.cities.map((c) => c.name),
    href: `/locations/${s.slug}/`,
  }));
  const cityCount = stateCards.reduce((n, s) => n + s.cities.length, 0);
  const directoryGroups = states.map((s) => ({
    name: s.name,
    coverageOnly: false,
    cities: s.cities.map((c) => ({ name: c.name, href: c.href })),
  }));
  const meta = {
    title: 'Chimcare Service Locations | Chimney Sweep, Repair & Masonry',
    description: `Find your local Chimcare chimney sweep, repair and masonry crew. Serving homeowners in ${states.length} states.`,
    canonical,
  };
  return {
    hero: { states: states.length, cities: cityCount },
    trust: [
      { icon: 'cal', title: 'Since 1989', small: 'Family-owned, 30+ years in business' },
      { icon: 'shield', title: 'Certified', small: 'CSIA-certified, licensed & insured crews' },
      { icon: 'broom', title: `Sweep + inspection ${money(prices.sweep_inspection)}`, small: `Inspection on its own ${money(prices.inspection)}` },
      { icon: 'wrench', title: 'Free repair & masonry quotes', small: 'Priced on site before work starts' },
    ],
    stateCards,
    directoryGroups,
    coverageOnly: [],
    crew: CREW,
    phone: NATIONAL_PHONE,
    phoneHref: phoneHref(NATIONAL_PHONE),
    booking: bookingOptions(prices),
    bookingContext: { pageSlug: '/locations/', pageKind: 'hub', label: 'Chimcare' },
    meta,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', '@id': canonical, url: canonical, name: meta.title, description: meta.description, inLanguage: 'en' },
          { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: 'Locations' }] },
          { '@type': 'ItemList', name: 'Chimcare states served', itemListElement: stateCards.filter((s) => s.href).map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${SITE_URL}${s.href}` })) },
        ],
      },
    ],
  };
}
