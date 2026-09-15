'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/chrome/Icon';
import { BookingForm } from './BookingForm';
import type { BookingContext, ServiceKey } from '@/lib/booking/types';
import type { BookingOption } from '@/lib/content/assemble';

/**
 * The slide-in booking sheet. Any element with `data-book` opens it — unless the page has the
 * inline hero form (#booking inside .book-slot), in which case the click scrolls to that form
 * (mock behaviour). `data-book-sheet` (the sticky mobile bar) always opens the sheet.
 * Optional `data-book-service="sweep|inspect|gas|quote"` preselects a service.
 */
export function BookingSheet({ options, context }: { options: BookingOption[]; context: BookingContext }) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<ServiceKey | null>(null);
  const [session, setSession] = useState(0);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-book],[data-book-sheet]');
      if (!el) return;
      e.preventDefault();
      const svc = (el.getAttribute('data-book-service') as ServiceKey | null) ?? null;
      const inline = document.getElementById('booking');
      if (!el.hasAttribute('data-book-sheet') && inline && inline.closest('.book-slot')) {
        inline.dispatchEvent(new CustomEvent('chimcare:book', { detail: { service: svc } }));
        inline.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      setService(svc);
      setSession((n) => n + 1);
      setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.querySelector<HTMLElement>('#bsheet .bsheet-panel')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <div className={open ? 'bsheet is-open' : 'bsheet'} id="bsheet" aria-hidden={!open}>
      <div className="bsheet-bg" onClick={close}></div>
      <div className="bsheet-panel" role="dialog" aria-modal="true" aria-label="Schedule service" tabIndex={-1}>
        <div className="bsheet-top">
          <p className="eyebrow">{context.label}</p>
          <button className="drawer-close" type="button" aria-label="Close" onClick={close}><Icon name="x" /></button>
        </div>
        <div id="book-mount-sheet">{open && <BookingForm key={session} options={options} context={context} initialService={service} onClose={close} />}</div>
      </div>
    </div>
  );
}
