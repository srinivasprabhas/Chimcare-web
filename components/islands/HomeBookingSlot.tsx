'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookingForm } from './BookingForm';
import type { BookingContext } from '@/lib/booking/types';
import type { BookingOption } from '@/lib/content/assemble';

/**
 * The homepage's hero is WordPress markup rendered from a string, so React cannot place a component inside it
 * directly. The generator leaves an empty `#home-booking-slot` where the Gravity Forms strip was; this portals the
 * app's booking form — the same one every location page embeds — into it.
 *
 * The slot carries `.book-slot`, so the page's "Request service" button (`data-book`) scrolls to this form instead
 * of opening the sheet, as on location pages.
 */
export function HomeBookingSlot({ options, context }: { options: BookingOption[]; context: BookingContext }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('home-booking-slot')), []);
  return slot ? createPortal(<BookingForm embedded options={options} context={context} />, slot) : null;
}
