/**
 * What the location hubs show for a state that has no row in `site.states`: its name and a
 * photograph taken in that state. Every photograph is a local file under `public/img/states/`.
 *
 * Sources. Minnesota's is the existing state plate. The others are Chimcare's own WordPress city
 * heroes, one per state, chosen because they show a city in THAT state — the migrated routes reuse a
 * Boston photograph on every Arizona page, so a route's own hero cannot stand for its state. WordPress
 * has no Arizona photograph at all; Arizona's is from Wikimedia Commons and carries its licence credit,
 * which the state card prints.
 */

export type StateProfile = {
  code: string;
  name: string;
  photo: string;
  photoAlt: string;
  /** Required by the photograph's licence where it is not Chimcare's own. */
  photoCredit?: string;
};

const PROFILES: Record<string, StateProfile> = {
  MA: { code: 'MA', name: 'Massachusetts', photo: '/img/states/ma.jpg', photoAlt: 'Downtown Boston, Massachusetts, at dusk' },
  AZ: {
    code: 'AZ',
    name: 'Arizona',
    photo: '/img/states/az.jpg',
    photoAlt: 'Downtown Phoenix, Arizona, with the mountains behind',
    photoCredit: 'Photo: DPPed, Wikimedia Commons, CC BY-SA 3.0',
  },
  IL: { code: 'IL', name: 'Illinois', photo: '/img/states/il.jpg', photoAlt: 'Downtown Naperville, Illinois, along the DuPage River' },
  MN: { code: 'MN', name: 'Minnesota', photo: '/img/states/mn.jpg', photoAlt: 'The Minneapolis skyline over the Mississippi River, Minnesota' },
  OH: { code: 'OH', name: 'Ohio', photo: '/img/states/oh.jpg', photoAlt: 'Playhouse Square in downtown Cleveland, Ohio' },
  GA: { code: 'GA', name: 'Georgia', photo: '/img/states/ga.webp', photoAlt: 'The Midtown Atlanta skyline, Georgia' },
  WI: { code: 'WI', name: 'Wisconsin', photo: '/img/states/wi.jpg', photoAlt: 'Milwaukee, Wisconsin, on the Lake Michigan shore' },
};

/** The fixed map of U.S. state names, for a state that has a route but no profile yet. */
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

export function stateName(code: string): string {
  return STATE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** The profile for a two-letter code, or null when the code is not a state this site lists yet. */
export function stateProfile(code: string): StateProfile | null {
  return PROFILES[code.toUpperCase()] ?? null;
}
