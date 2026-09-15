'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/chrome/Icon';
import { TIME_WINDOWS, type BookingContext, type BookingPrefill, type ServiceKey } from '@/lib/booking/types';
import { todayISO, validateBooking } from '@/lib/booking/validate';
import type { BookingOption } from '@/lib/content/assemble';

const STEPS = ['Service', 'Schedule', 'Details', 'Confirmation'];
const STEP_FIELDS: Record<number, string[]> = { 1: ['service'], 2: ['date', 'timeWindow'], 3: ['name', 'phone', 'email', 'zip'] };

type Draft = { service: ServiceKey | ''; date: string; timeWindow: string; name: string; phone: string; email: string; zip: string; address: string; notes: string };
const EMPTY: Draft = { service: '', date: '', timeWindow: '', name: '', phone: '', email: '', zip: '', address: '', notes: '' };

function prettyDate(v: string) {
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? v : dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Service → Schedule → Details → Confirmation. Same markup and classes as the mock's widget for step 1;
 * steps 2–4 follow its script's contract (bk-slot, bk-date, bk-name …). Posts to /api/bookings, which
 * stores the row and hands it to the booking adapter (mock now, Workiz later).
 */
export function BookingForm({
  options,
  context,
  initialService,
  initialValues,
  embedded = false,
  onClose,
}: {
  options: BookingOption[];
  context: BookingContext;
  initialService?: ServiceKey | null;
  initialValues?: BookingPrefill;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, ...initialValues, service: initialService ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ reference: string; status: string } | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  // In-page "Schedule Service" links (data-book) reset the embedded form and preselect a service.
  useEffect(() => {
    if (!embedded) return;
    const root = rootRef.current;
    if (!root) return;
    const onBook = (e: Event) => {
      const svc = (e as CustomEvent<{ service?: string | null }>).detail?.service as ServiceKey | undefined;
      setReceipt(null);
      setErrors({});
      setDraft({ ...EMPTY, service: svc && options.some((o) => o.key === svc) ? svc : '' });
      setStep(1);
    };
    root.addEventListener('chimcare:book', onBook);
    return () => root.removeEventListener('chimcare:book', onBook);
  }, [embedded, options]);

  const set = (k: keyof Draft, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const check = (n: number) => {
    const { errors: all } = validateBooking(draft);
    const mine = Object.fromEntries(Object.entries(all).filter(([k]) => STEP_FIELDS[n]?.includes(k)));
    setErrors(mine);
    return Object.keys(mine).length === 0;
  };

  const next = () => {
    if (check(step)) setStep((s) => Math.min(4, s + 1));
  };
  const back = () => {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
  };

  const submit = async () => {
    if (!check(3)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          serviceLabel: options.find((o) => o.key === draft.service)?.label ?? draft.service,
          context,
          sourceUrl: window.location.href,
        }),
      });
      const json = (await res.json()) as { ok: boolean; reference?: string; status?: string; errors?: Record<string, string> };
      if (json.ok && json.reference) {
        setReceipt({ reference: json.reference, status: json.status ?? 'received' });
        setStep(4);
      } else {
        setErrors(json.errors ?? { form: 'Something went wrong. Please call us instead.' });
        const firstField = Object.keys(json.errors ?? {})[0];
        if (firstField && STEP_FIELDS[1].includes(firstField)) setStep(1);
        else if (firstField && STEP_FIELDS[2].includes(firstField)) setStep(2);
      }
    } catch {
      setErrors({ form: 'We could not reach the scheduler. Please try again or call us.' });
    } finally {
      setBusy(false);
    }
  };

  const summary: Array<[string, string]> = [['Service', options.find((o) => o.key === draft.service)?.label ?? '']];
  if (draft.date) summary.push(['When', `${prettyDate(draft.date)} · ${draft.timeWindow}`]);
  if (context.cityName) summary.push(['Area', `${context.cityName}${context.stateCode ? `, ${context.stateCode}` : ''}`]);

  return (
    <section className="book" id={embedded ? 'booking' : undefined} aria-labelledby="book-title" ref={rootRef} data-step={step}>
      <div className="book-head">
        <h3 id="book-title">{step === 4 ? 'Request received' : 'Schedule Your Chimney Service Today !'}</h3>
        <p>{step === 4 ? 'We will confirm the appointment by email or phone.' : 'we will confirm the appointment by Email / Call'}</p>
        {context.label !== 'Chimcare' && step < 4 && <p className="book-ctx">Booking with {context.label}</p>}
      </div>
      <div className="book-body">
        <ol className="steps" data-step={step} aria-label="Booking steps">
          {STEPS.map((s, i) => (
            <li className={`step${i + 1 === step ? ' is-active' : ''}${i + 1 < step ? ' is-done' : ''}`} key={s} aria-current={i + 1 === step ? 'step' : undefined}>
              <span className="dot"></span>
              <span className="lbl">{s}</span>
            </li>
          ))}
        </ol>
        <p className="sr-only" aria-live="polite">Step {step} of 4</p>

        {step === 1 && (
          <>
            <p className="book-q">What service do you need?</p>
            <div className="svc-opts" role="radiogroup" aria-label="Service">
              {options.map((o) => (
                <button className="svc-opt" type="button" role="radio" aria-checked={draft.service === o.key} data-svc={o.key} key={o.key} onClick={() => set('service', o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="bk-err" role="alert">{errors.service}</p>
            <div className="bk-nav">
              <span />
              <button className="bk-btn primary" type="button" onClick={next}>Continue <Icon name="arrow" /></button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="book-q">When works for you?</p>
            <label className="bk-field">
              <span>Preferred date</span>
              <input className="bk-input" id="bk-date" type="date" min={todayISO()} value={draft.date} aria-invalid={!!errors.date} onChange={(e) => set('date', e.target.value)} />
              <span className="bk-err">{errors.date}</span>
            </label>
            <p className="book-q">Time window</p>
            <div className="bk-slots" role="radiogroup" aria-label="Time window">
              {TIME_WINDOWS.map((w) => (
                <button className="bk-slot" type="button" role="radio" aria-checked={draft.timeWindow === w} data-slot={w} key={w} onClick={() => set('timeWindow', w)}>
                  {w}
                </button>
              ))}
            </div>
            <p className="bk-err" role="alert">{errors.timeWindow}</p>
            <div className="bk-nav">
              <button className="bk-btn" type="button" onClick={back}>Back</button>
              <button className="bk-btn primary" type="button" onClick={next}>Continue <Icon name="arrow" /></button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="bk-summary" id="bk-mini-summary">
              <dl>{summary.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
            </div>
            <p className="book-q">Who should we confirm with?</p>
            <div className="bk-grid">
              <label className="bk-field"><span>Name</span><input className="bk-input" id="bk-name" autoComplete="name" value={draft.name} aria-invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} /><span className="bk-err">{errors.name}</span></label>
              <label className="bk-field"><span>Phone</span><input className="bk-input" id="bk-phone" type="tel" autoComplete="tel" value={draft.phone} aria-invalid={!!errors.phone} onChange={(e) => set('phone', e.target.value)} /><span className="bk-err">{errors.phone}</span></label>
              <label className="bk-field"><span>Email</span><input className="bk-input" id="bk-email" type="email" autoComplete="email" value={draft.email} aria-invalid={!!errors.email} onChange={(e) => set('email', e.target.value)} /><span className="bk-err">{errors.email}</span></label>
              <label className="bk-field"><span>ZIP code</span><input className="bk-input" id="bk-zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={draft.zip} aria-invalid={!!errors.zip} onChange={(e) => set('zip', e.target.value.replace(/\D/g, ''))} /><span className="bk-err">{errors.zip}</span></label>
            </div>
            <label className="bk-field"><span>Street address <em>(optional)</em></span><input className="bk-input" id="bk-addr" autoComplete="street-address" value={draft.address} onChange={(e) => set('address', e.target.value)} /></label>
            <label className="bk-field"><span>Anything we should know? <em>(optional)</em></span><textarea className="bk-input" id="bk-notes" rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} /></label>
            {errors.form && <p className="bk-err" role="alert">{errors.form}</p>}
            <div className="bk-nav">
              <button className="bk-btn" type="button" onClick={back} disabled={busy}>Back</button>
              <button className="bk-btn primary" type="button" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Confirm booking'}</button>
            </div>
          </>
        )}

        {step === 4 && receipt && (
          <div className="bk-done">
            <span className="tick"><Icon name="check" /></span>
            <h4>Thanks, {draft.name.split(' ')[0]}.</h4>
            <p>Your reference is</p>
            <span className="bk-ref">{receipt.reference}</span>
            <div className="bk-summary" id="bk-summary">
              <dl>
                {summary.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
                <div><dt>Phone</dt><dd>{draft.phone}</dd></div>
                <div><dt>Email</dt><dd>{draft.email}</dd></div>
                <div><dt>ZIP</dt><dd>{draft.zip}</dd></div>
                {draft.address && <div><dt>Address</dt><dd>{draft.address}</dd></div>}
              </dl>
            </div>
            <p className="bk-note">{receipt.status === 'failed' ? 'We saved your request but could not reach the scheduler — our office will call you to confirm.' : 'Our office will confirm the exact arrival time by email or phone.'}</p>
            {onClose ? (
              <button className="bk-btn primary" type="button" onClick={onClose}>Done</button>
            ) : (
              <button className="bk-btn" type="button" onClick={() => { setDraft(EMPTY); setReceipt(null); setStep(1); }}>Book another</button>
            )}
          </div>
        )}
      </div>
      <div className="book-foot"></div>
    </section>
  );
}
