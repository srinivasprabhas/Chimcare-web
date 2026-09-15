'use client';

import { useState } from 'react';
import type { CategoryTile, ServiceCard } from '@/lib/content/assemble';
import { Icon } from '@/components/chrome/Icon';

const STEP = 8;

/**
 * The 92-card service directory with category tiles. All cards are in the server HTML;
 * the client only toggles `hidden` (same behaviour as the mock's filter script).
 */
export function ServiceDirectory({ tiles, cards, count }: { tiles: CategoryTile[]; cards: ServiceCard[]; count: number }) {
  const [filter, setFilter] = useState<string>('all');
  const [shown, setShown] = useState(STEP);

  const matching = cards.filter((c) => filter === 'all' || c.cat === filter);
  const visibleKeys = new Set(matching.slice(0, shown).map((c) => c.key));

  const pick = (key: string) => {
    setFilter(key);
    setShown(STEP);
    if (key !== 'all') document.getElementById('svc-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="svc-bar reveal">
        <p className="svc-status" id="svc-showing" role="status">
          Showing {Math.min(shown, matching.length)} of {matching.length}
        </p>
        <button className="tile-reset" type="button" data-filter="all" aria-pressed={filter === 'all'} onClick={() => pick('all')}>
          <Icon name="sparkles" />All {count} services
        </button>
      </div>
      <ul className="svc-tiles reveal" id="svc-filters" aria-label="Filter services by category">
        {tiles.map((t) => (
          <li key={t.key}>
            <button className="svc-tile" type="button" data-filter={t.key} aria-pressed={filter === t.key} onClick={() => pick(t.key)}>
              <img src={t.src} width={600} height={450} loading="lazy" alt={t.alt} title={t.alt} />
              <span className="t-label">
                <span className="t-name">{t.name}</span>
                <span className="t-n">
                  {t.count} {t.count === 1 ? 'service' : 'services'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="svc-grid reveal" id="svc-grid" style={{ marginTop: 44 }}>
        {cards.map((c) => (
          <article key={c.key} className="svc-card" id={`svc-${c.key}`} data-cat={c.cat} hidden={!visibleKeys.has(c.key)}>
            <h3>{c.href ? <a href={c.href}>{c.title}</a> : c.title}</h3>
            <p>{c.copy}</p>
          </article>
        ))}
      </div>
      <div className="svc-more" id="svc-more" hidden={visibleKeys.size >= matching.length}>
        <button className="btn btn-outline" type="button" id="svc-more-btn" onClick={() => setShown((n) => n + STEP)}>
          Show more services <Icon name="plus" />
        </button>
      </div>
    </>
  );
}
