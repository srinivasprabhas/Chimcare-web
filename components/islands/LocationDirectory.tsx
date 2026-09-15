'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LocationCard } from '@/lib/content/assemble-hubs';
import { Icon } from '@/components/chrome/Icon';
import { fold, SEARCH_DISABLED_NOTE, SEARCH_ENABLED } from '@/lib/content/search';
import { ensureQuery, getQuery, setQuery, subscribe } from './locationSearch';

const FIRST = 6; // how many cards a visitor sees before asking for more
const STEP = 12; // how many each "Load more" adds

/**
 * The state directory: every city in the state, revealed a few at a time.
 *
 * All cards are rendered in the server HTML and stay there — the client only toggles `hidden`.
 * That matters for SEO: these are the internal links to every city page in the state, and a
 * crawler must see them all without running JavaScript. It also matters for scale: Minnesota has
 * 150 cities and Massachusetts would have roughly 220, which is far too many to show at once.
 */
export function LocationDirectory({ cards, initialQuery = '' }: { cards: LocationCard[]; initialQuery?: string }) {
  const seed = SEARCH_ENABLED ? initialQuery : '';
  ensureQuery(seed);
  // Shared with the hero field: typing in either box filters this grid immediately.
  const query = useSyncExternalStore(subscribe, getQuery, () => seed);
  // Search is off: the first click, tap or Enter explains why nothing happens.
  const [notice, setNotice] = useState(false);
  const explain = SEARCH_ENABLED ? undefined : () => setNotice(true);
  const [shown, setShown] = useState(FIRST);

  // Fold each card's search text once, not on every keystroke.
  const folded = useMemo(() => cards.map((c) => ({ card: c, text: fold(c.search) })), [cards]);
  const needle = fold(query);
  const matching = useMemo(
    () => (needle ? folded.filter((f) => f.text.includes(needle)).map((f) => f.card) : cards),
    [cards, folded, needle],
  );
  // A new query starts the list again at the first page.
  const lastQuery = useRef(query);
  if (lastQuery.current !== query) {
    lastQuery.current = query;
    if (shown !== FIRST) setShown(FIRST);
  }
  const visibleIds = useMemo(() => new Set(matching.slice(0, shown).map((c) => c.id)), [matching, shown]);
  const remaining = Math.max(0, matching.length - shown);

  return (
    <>
      <div className="dir-bar">
        <label className="dir-search">
          <Icon name="pin" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(FIRST);
            }}
            readOnly={!SEARCH_ENABLED}
            onFocus={explain}
            onClick={explain}
            placeholder="Find your town"
            aria-label="Find your town"
          />
        </label>
        <p className={notice ? 'dir-count is-notice' : 'dir-count'} id="dir-count" role="status">
          {notice ? SEARCH_DISABLED_NOTE : (
            <>
              Showing <b>{Math.min(shown, matching.length)}</b> of <b>{matching.length}</b>
              {needle ? ' matching' : ''} location{matching.length === 1 ? '' : 's'}
            </>
          )}
        </p>
      </div>

      <div className="loc-grid" id="loc-grid">
        {cards.map((c) => (
          <article
            className="job_listing loc-card reveal"
            key={c.id}
            data-id={c.id}
            data-search={c.search}
            hidden={!visibleIds.has(c.id)}
          >
            <div className="content-box">
              {c.href && <a className="job_listing-clickbox" href={c.href} aria-hidden="true" tabIndex={-1}></a>}
              <header className={c.photo ? 'job_listing-entry-header listing-cover has-image' : 'job_listing-entry-header listing-cover no-image'}>
                {c.photo && <img className="ph-photo" src={c.photo.src} alt={c.photo.alt} title={c.photo.alt} loading="lazy" decoding="async" />}
              </header>
              <div className="body">
                <p className="city">{c.name}{c.kind === 'coverage' ? ' · coverage' : ''}</p>
                <h3>{c.title}</h3>
                <div className="meta">
                  <div>
                    <Icon name="pin" />
                    <span>{c.addressLines.length ? <>{c.addressLines[0]}<br />{c.addressLines[1]}</> : c.servedFrom}</span>
                  </div>
                </div>
                <a className="tel" href={c.phoneHref}><Icon name="phone" />{c.phone}</a>
                <div className="foot">
                  {c.href ? <a className="go" href={c.href}>View location <Icon name="arrow" /></a> : <span className="go">Page in review</span>}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {matching.length === 0 && (
        <p className="dir-empty">
          No location matches “{query}”. Our service areas overlap, so try a nearby town — or call and we will tell you
          straight away whether we cover your address.
        </p>
      )}

      {remaining > 0 && (
        <div className="dir-more">
          <button type="button" className="btn btn-outline" onClick={() => setShown((n) => n + STEP)}>
            Load more locations <span className="dir-more-count">{remaining} left</span>
          </button>
        </div>
      )}
    </>
  );
}