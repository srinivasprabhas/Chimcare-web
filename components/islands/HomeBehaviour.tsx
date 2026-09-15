'use client';

import { useEffect } from 'react';
import type { BookingPrefill, ServiceKey } from '@/lib/booking/types';

/**
 * The homepage is WordPress/Elementor markup rendered verbatim (app/_home/content.ts), with every WordPress
 * script stripped. This island gives that markup back the behaviour those scripts provided, working on the
 * existing classes and attributes so the page still looks exactly like production:
 *
 *   - Elementor nav menu toggle (mobile/tablet) and the sticky header bar
 *   - FAQ accordion (one item open at a time, as Elementor does)
 *   - counters counting up when they scroll into view
 *   - the US map tooltip (the saved page's own `chimcare-map-tip` script, ported)
 *   - the Gravity Forms "Request Service" form → opens the app booking sheet, prefilled
 *   - the location search → the locations hub
 *
 * Content never depends on this running: with no JS the page shows the same text, counters show their
 * final values and the first FAQ answer is open.
 */

// Gravity Forms option text → booking service. Order matters: "Chimney Sweep + Inspection" is a sweep.
const SERVICE_BY_OPTION: [RegExp, ServiceKey][] = [
  [/sweep/i, 'sweep'],
  [/gas/i, 'gas'],
  [/inspection/i, 'inspect'],
  [/quote/i, 'quote'],
];
export const serviceFromOption = (option: string): ServiceKey | null =>
  SERVICE_BY_OPTION.find(([re]) => re.test(option))?.[1] ?? null;

export function HomeBehaviour() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.wp-home');
    if (!root) return;
    const ac = new AbortController();
    const { signal } = ac;
    const cleanups: (() => void)[] = [];
    const onKeyActivate = (el: HTMLElement, fn: () => void) =>
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fn();
        }
      }, { signal });

    // ---- nav menu toggle ----------------------------------------------------------------------
    root.querySelectorAll<HTMLElement>('.elementor-menu-toggle').forEach((toggle) => {
      const dropdown = toggle.nextElementSibling as HTMLElement | null;
      const set = (on: boolean) => {
        toggle.classList.toggle('elementor-active', on);
        toggle.setAttribute('aria-expanded', String(on));
        if (dropdown) {
          dropdown.setAttribute('aria-hidden', String(!on));
          dropdown.style.setProperty('--menu-height', on ? `${dropdown.scrollHeight}px` : '0');
        }
      };
      // The dropdown is `position: fixed` (a saved theme rule); overrides.css reads `--cc-menu-top` so the
      // panel opens just under the white header card instead of on top of it, and follows the card when the
      // sticky header moves.
      const card = toggle.closest<HTMLElement>('.elementor-sticky') ?? toggle.closest<HTMLElement>('section');
      const isOpen = () => toggle.classList.contains('elementor-active');
      const place = () => {
        if (dropdown && card) dropdown.style.setProperty('--cc-menu-top', `${Math.round(card.getBoundingClientRect().bottom + 8)}px`);
      };
      const flip = () => {
        place();
        set(!isOpen());
      };
      toggle.addEventListener('click', flip, { signal });
      onKeyActivate(toggle, flip);
      dropdown?.addEventListener('click', (e) => (e.target as HTMLElement).closest('a') && set(false), { signal });
      window.addEventListener('scroll', () => isOpen() && place(), { passive: true, signal });
      window.addEventListener('resize', () => isOpen() && place(), { signal });
      document.addEventListener('click', (e) => {
        const t = e.target as Node;
        if (isOpen() && !toggle.contains(t) && !dropdown?.contains(t)) set(false);
      }, { signal });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) {
          set(false);
          toggle.focus();
        }
      }, { signal });
    });

    // ---- sticky header ------------------------------------------------------------------------
    // Elementor's sticky: once the bar reaches `sticky_offset` from the top it is fixed there, and a hidden
    // clone keeps its place in the flow so nothing below jumps.
    const header = root.querySelector<HTMLElement>('.header-template.elementor-sticky');
    if (header) {
      const offset = 20;
      const spacer = header.cloneNode(true) as HTMLElement;
      spacer.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      spacer.classList.add('elementor-sticky__spacer');
      spacer.setAttribute('aria-hidden', 'true');
      spacer.inert = true;
      spacer.style.visibility = 'hidden';
      let active = false;
      const place = () => {
        const r = spacer.getBoundingClientRect();
        header.style.width = `${r.width}px`;
        header.style.left = `${r.left}px`;
      };
      const update = () => {
        if (!active && header.getBoundingClientRect().top <= offset) {
          header.before(spacer);
          Object.assign(header.style, { position: 'fixed', top: `${offset}px`, zIndex: '99', marginTop: '0' });
          header.classList.add('elementor-sticky--active', 'elementor-sticky--effects');
          active = true;
          place();
        } else if (active && spacer.getBoundingClientRect().top > offset) {
          spacer.remove();
          header.style.cssText = '';
          header.classList.remove('elementor-sticky--active', 'elementor-sticky--effects');
          active = false;
        } else if (active) {
          place();
        }
      };
      window.addEventListener('scroll', update, { passive: true, signal });
      window.addEventListener('resize', update, { signal });
      update();
      cleanups.push(() => {
        spacer.remove();
        header.style.cssText = '';
        header.classList.remove('elementor-sticky--active', 'elementor-sticky--effects');
      });
    }

    // ---- FAQ accordion ------------------------------------------------------------------------
    root.querySelectorAll<HTMLElement>('.elementor-accordion').forEach((accordion) => {
      const setItem = (title: HTMLElement, on: boolean) => {
        const content = document.getElementById(title.getAttribute('aria-controls') ?? '');
        title.classList.toggle('elementor-active', on);
        title.setAttribute('aria-expanded', String(on));
        title.setAttribute('aria-selected', String(on));
        content?.classList.toggle('elementor-active', on);
        if (content) content.style.display = on ? 'block' : 'none';
      };
      accordion.querySelectorAll<HTMLElement>('.elementor-tab-title').forEach((title) => {
        title.tabIndex = 0;
        const flip = () => {
          const on = !title.classList.contains('elementor-active');
          accordion.querySelectorAll<HTMLElement>('.elementor-tab-title.elementor-active').forEach((t) => setItem(t, false));
          if (on) setItem(title, true);
        };
        title.addEventListener('click', flip, { signal });
        onKeyActivate(title, flip);
      });
    });

    // ---- counters -----------------------------------------------------------------------------
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const counters = Array.from(root.querySelectorAll<HTMLElement>('.elementor-counter-number[data-to-value]'));
    if (!reduceMotion && 'IntersectionObserver' in window && counters.length) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);
          const el = en.target as HTMLElement;
          const from = Number(el.dataset.fromValue ?? 0);
          const to = Number(el.dataset.toValue ?? 0);
          const duration = Number(el.dataset.duration ?? 2000);
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            el.textContent = String(Math.round(from + (to - from) * t));
            if (t < 1 && !signal.aborted) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      }, { threshold: 0.3 });
      counters.forEach((c) => io.observe(c));
      cleanups.push(() => {
        io.disconnect();
        counters.forEach((c) => (c.textContent = c.dataset.toValue ?? c.textContent));
      });
    }

    // ---- testimonials slider (phones) ---------------------------------------------------------
    // overrides.css turns the three cards into a horizontal snap track below 768px; this adds the dots and
    // advances one review every few seconds. It pauses while the visitor touches or focuses it, while it is
    // off screen or the tab is hidden, and never auto-advances under prefers-reduced-motion.
    const track = root.querySelector<HTMLElement>('.elementor-element-92bd501 > .elementor-container');
    const slides = track ? Array.from(track.children).filter((c) => c.classList.contains('elementor-column')) : [];
    if (track && slides.length > 1) {
      const phone = window.matchMedia('(max-width: 767px)');
      const dots = document.createElement('div');
      dots.className = 'cc-testi-dots';
      dots.setAttribute('role', 'group');
      dots.setAttribute('aria-label', 'Choose a review');
      const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      const go = (i: number) => track.scrollTo({ left: i * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
      const buttons = slides.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Show review ${i + 1} of ${slides.length}`);
        b.addEventListener('click', () => {
          go(i);
          start();
        }, { signal });
        dots.append(b);
        return b;
      });
      track.after(dots);
      const mark = () => {
        const i = current();
        buttons.forEach((b, n) => b.setAttribute('aria-current', String(n === i)));
      };
      let frame = 0;
      track.addEventListener('scroll', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(mark);
      }, { passive: true, signal });
      mark();

      let timer: number | undefined;
      let held = false;
      let onScreen = false;
      const stop = () => {
        window.clearInterval(timer);
        timer = undefined;
      };
      const start = () => {
        stop();
        if (!phone.matches || reduceMotion || held || !onScreen || document.hidden) return;
        timer = window.setInterval(() => go((current() + 1) % slides.length), 4500);
      };
      const hold = (on: boolean) => () => {
        held = on;
        start();
      };
      track.addEventListener('pointerdown', hold(true), { signal });
      track.addEventListener('pointerup', hold(false), { signal });
      track.addEventListener('pointercancel', hold(false), { signal });
      root.querySelector('.elementor-element-3ec657d')?.addEventListener('focusin', hold(true), { signal });
      root.querySelector('.elementor-element-3ec657d')?.addEventListener('focusout', hold(false), { signal });
      document.addEventListener('visibilitychange', start, { signal });
      phone.addEventListener('change', () => {
        if (!phone.matches) track.scrollLeft = 0;
        start();
      }, { signal });
      const seen = new IntersectionObserver(([en]) => {
        onScreen = en.isIntersecting;
        start();
      }, { threshold: 0.5 });
      seen.observe(track);
      cleanups.push(() => {
        stop();
        seen.disconnect();
        dots.remove();
      });
    }

    // ---- US map tooltip -----------------------------------------------------------------------
    const map = root.querySelector<HTMLElement>('.cc-usmap');
    const tip = map?.querySelector<HTMLElement>('.cc-tip');
    if (map && tip) {
      let active: Element | null = null;
      const show = (g: Element, x: number, y: number) => {
        if (active && active !== g) active.classList.remove('is-active');
        active = g;
        g.classList.add('is-active');
        const name = g.getAttribute('data-name') ?? '';
        const towns = g.getAttribute('data-towns');
        const body = towns || (g.classList.contains('is-on') ? 'Chimcare serves this state' : '');
        tip.replaceChildren();
        const b = document.createElement('b');
        b.textContent = name;
        tip.append(b);
        if (body) {
          const span = document.createElement('span');
          span.textContent = body;
          tip.append(span);
        }
        tip.hidden = false;
        const r = map.getBoundingClientRect();
        tip.style.left = '0px';
        tip.style.top = '0px';
        const tw = tip.offsetWidth;
        const pad = 6;
        tip.style.left = `${Math.max(tw / 2 + pad, Math.min(x - r.left, r.width - tw / 2 - pad))}px`;
        const above = y - r.top - 10;
        const below = above - tip.offsetHeight * 1.15 < 0;
        tip.classList.toggle('is-below', below);
        tip.style.top = `${below ? y - r.top + 16 : above}px`;
      };
      const hide = () => {
        active?.classList.remove('is-active');
        active = null;
        tip.hidden = true;
      };
      const at = (e: Event) => (e.target as Element).closest?.('.cc-st') ?? null;
      const follow = (e: PointerEvent | MouseEvent) => {
        const g = at(e);
        if (g) show(g, e.clientX, e.clientY);
        else hide();
      };
      map.addEventListener('pointermove', follow, { signal });
      map.addEventListener('click', follow, { signal });
      map.addEventListener('pointerleave', hide, { signal });
      map.addEventListener('focusin', (e) => {
        const g = at(e);
        if (!g) return;
        const b = g.getBoundingClientRect();
        show(g, b.left + b.width / 2, b.top + b.height / 2);
      }, { signal });
      map.addEventListener('focusout', hide, { signal });
      document.addEventListener('keydown', (e) => e.key === 'Escape' && hide(), { signal });
    }

    // ---- request-service form → booking sheet -------------------------------------------------
    const form = root.querySelector<HTMLFormElement>('#gform_24');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = (selector: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value.trim() ?? '';
      if (value('#field_24_8 input')) return; // Gravity Forms honeypot
      const option = value('select');
      const service = serviceFromOption(option);
      const prefill: BookingPrefill = {
        name: value('input[placeholder^="Name"]'),
        email: value('input[type="email"]'),
        phone: value('input[placeholder^="Phone"]'),
        zip: value('input[placeholder^="Zip"]'),
      };
      document.dispatchEvent(new CustomEvent('chimcare:open-booking', { detail: { service, prefill } }));
    }, { signal });

    // ---- location search → locations hub ------------------------------------------------------
    root.querySelectorAll<HTMLFormElement>('.e-search-form').forEach((search) => {
      search.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = search.querySelector<HTMLInputElement>('input[name="s"]')?.value.trim() ?? '';
        window.location.assign(q ? `/locations/?q=${encodeURIComponent(q)}` : '/locations/');
      }, { signal });
    });

    // ---- newsletter ---------------------------------------------------------------------------
    // Production posts this to an empty URL and always fails; there is no subscription backend here either.
    // Stop the native submit reloading the page, and say plainly that sign-up is unavailable.
    const newsletter = root.querySelector<HTMLFormElement>('#newsletterForm');
    newsletter?.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = root.querySelector<HTMLElement>('#formMessage');
      if (msg) {
        msg.className = 'newsletter-message error';
        msg.textContent = 'Newsletter sign-up is not available yet. Please call us or use Contact Us.';
      }
    }, { signal });

    return () => {
      ac.abort();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
