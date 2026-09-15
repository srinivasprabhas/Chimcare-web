'use client';

import { useEffect, useRef, useState } from 'react';
import type { BookingPrefill } from '@/lib/booking/types';
import { serviceFromOption } from './HomeBehaviour';

/**
 * The homepage's "Request service" popup. On the live site the hero button fires an Elementor Pro popup that
 * cannot run here; this is the same form (the hero strip's fields and options) as a real dialog, at every
 * viewport width. The hero button is `#cc-request-service-trigger` inside the verbatim WordPress markup, so
 * the click is picked up by delegation rather than a React handler.
 *
 * Submitting hands the details to the app booking sheet (date and time window are still needed for a
 * booking), exactly as the inline hero form does.
 */

const OPTIONS = [
  '$69 Chimney Inspection',
  '$49 Gas Fireplace Diagnostic',
  '$299 Chimney Sweep + Inspection',
  'Free Repair Quote',
  'Free Masonry Quote',
];

export function RequestServiceModal() {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.<HTMLElement>('#cc-request-service-trigger');
      if (!t) return;
      e.preventDefault();
      trigger.current = t;
      restoreFocus.current = true;
      setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    card.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab' || !card.current) return;
      const items = card.current.querySelectorAll<HTMLElement>('button, input, select');
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      if (restoreFocus.current) trigger.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '').trim();
    const prefill: BookingPrefill = { name: value('name'), email: value('email'), phone: value('phone'), zip: value('zip') };
    restoreFocus.current = false; // focus belongs to the booking sheet now
    setOpen(false);
    document.dispatchEvent(
      new CustomEvent('chimcare:open-booking', { detail: { service: serviceFromOption(value('service')), prefill } }),
    );
  };

  return (
    <div className="cc-rq">
      <div className="cc-rq-backdrop" onClick={() => setOpen(false)} />
      <div className="cc-rq-card" role="dialog" aria-modal="true" aria-label="Request service" ref={card}>
        <button type="button" className="cc-rq-close" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
        <form className="cc-rq-form" onSubmit={onSubmit}>
          <input name="name" type="text" placeholder="Name*" aria-label="Name" required autoComplete="name" />
          <input name="email" type="email" placeholder="Email*" aria-label="Email" required autoComplete="email" />
          <input name="phone" type="tel" placeholder="Phone*" aria-label="Phone" required autoComplete="tel" />
          <select name="service" aria-label="Service" required defaultValue="">
            <option value="" disabled>
              Select Service
            </option>
            {OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <input
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="\d{5}"
            title="5-digit ZIP code"
            placeholder="Zip Code*"
            aria-label="Zip code"
            required
            autoComplete="postal-code"
          />
          <button type="submit" className="cc-rq-submit">
            Request Service
          </button>
          <p className="cc-rq-note">
            By submitting your contact details, you agree to receive automated SMS/MMS messages from Chimcare. Message &amp;
            data rates may apply.
          </p>
        </form>
      </div>
    </div>
  );
}
