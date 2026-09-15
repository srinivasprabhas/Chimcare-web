'use client';

import { useEffect } from 'react';
import { Icon } from './Icon';
import '@/styles/sticky-bar.css';

/**
 * Mobile-only sticky Call / Book bar. CSS hides it on desktop.
 *
 * It starts off-screen (`transform: translateY(100%)`) and is revealed by adding `.is-on`, which the
 * stylesheet already defines. Nothing was adding that class, so the bar rendered on every page and
 * was never visible on any of them.
 *
 * The reveal rule is the client reference's: stay hidden while any part of the hero is on screen, so
 * the bar can never cover the hero's own Call and Book buttons, and slide in once the hero is past.
 * A throttled scroll read drives it rather than an IntersectionObserver — that is the reference's own
 * choice, and its comment gives the reason: IntersectionObserver combined with `position: fixed` has
 * known quirks on older iOS Safari, and a scroll read is deterministic.
 *
 * Pages with no hero have nothing to hide behind, so the bar appears after
 * roughly one viewport of scrolling. That keeps it off the first screen, which is the point of the
 * rule, without making it unreachable on a page the reference never covered.
 */
export function StickyBar({ phoneHref }: { phoneHref: string }) {
  useEffect(() => {
    const bar = document.getElementById('sfoot');
    if (!bar) return;
    const hero = document.getElementById('o1-hero');

    let last = 0;
    const update = () => {
      const past = hero
        ? hero.getBoundingClientRect().bottom <= 0
        : window.scrollY > window.innerHeight;
      bar.classList.toggle('is-on', past);
    };
    const onScroll = () => {
      const now = Date.now();
      if (now - last < 60) return; // the reference's own throttle
      last = now;
      update();
    };

    update(); // a page restored mid-scroll must not start with the bar in the wrong state
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className="sfoot" id="sfoot" aria-label="Call or book service">
      <a className="sfoot-btn sfoot-call" href={phoneHref}>
        <Icon name="phone" />Call Now
      </a>
      <a className="sfoot-btn sfoot-book" href="#booking" data-book-sheet>
        <Icon name="cal" />Book Online
      </a>
    </div>
  );
}
