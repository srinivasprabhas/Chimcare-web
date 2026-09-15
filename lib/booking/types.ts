export const SERVICE_KEYS = ['sweep', 'inspect', 'gas', 'quote'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const TIME_WINDOWS = ['8–11 AM', '11 AM–2 PM', '2–5 PM'] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

/** Which page the booking was started from — carried on every request so leads attribute to a page/city/branch. */
export type BookingContext = {
  pageSlug: string;
  pageKind: 'hub' | 'state' | 'city' | 'service';
  label: string; // "Chimcare · Minneapolis, MN" — shown in the sheet header
  stateCode?: string;
  stateName?: string;
  cityId?: number;
  cityName?: string;
  branchId?: number;
  branchName?: string;
  serviceId?: number;
  serviceName?: string;
};

export type BookingSubmission = {
  service: ServiceKey;
  serviceLabel: string;
  date: string; // YYYY-MM-DD
  timeWindow: TimeWindow;
  name: string;
  phone: string;
  email: string;
  zip: string;
  address?: string;
  notes?: string;
  context: BookingContext;
  sourceUrl?: string;
};

export type BookingReceipt = { ok: true; reference: string; status: string } | { ok: false; errors: Record<string, string> };
