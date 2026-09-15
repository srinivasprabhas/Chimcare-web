'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '@/components/chrome/Icon';
import { SEARCH_DISABLED_NOTE, SEARCH_ENABLED, fold } from '@/lib/content/search';
import type { StateCard } from '@/lib/content/assemble-hubs';
import { ensureQuery, getQuery, setQuery, subscribe } from './locationSearch';

const BATCH = 6; // the mock opens with six states and grows six at a time

export type DirectoryGroup = { name: string; coverageOnly: boolean; cities: Array<{ name: string; href?: string }> };

/**
 * The national hub's two directories, driven by one search field.
 *
 * Card grid  — every state, revealed six at a time ("Load more states" in the mock).
 * Chip list  — every city Chimcare lists, grouped by state, as an accordion.
 *
 * All states and all cities are in the server HTML and stay there; the client only toggles `hidden`.
 * These chips are the internal links to every state and city page, and a crawler must see them
 * without running JavaScript.
 *
 * Matching mirrors the mock: a state name matches its whole group, anything else matches city names,
 * and typing opens the groups that matched. Folding (`fold`) is shared with the state hub so
 * "St Paul", "St. Paul" and "Saint Paul" behave the same everywhere.
 *
 * The search field lives in the hero and the results live here, far apart in the template. They talk
 * through `locationSearch`, the same tiny store the state hub already uses, rather than threading
 * state through every server component between them.
 */
export function StateDirectory({
  cards,
  groups,
  totalCities,
  coverageOnly,
}: {
  cards: StateCard[];
  groups: DirectoryGroup[];
  totalCities: number;
  coverageOnly: string[];
}) {
  const query = useSyncExternalStore(subscribe, getQuery, () => '');
  const [shown, setShown] = useState(BATCH);
  // Every state row starts closed; its + opens it. React owns this, so a re-render never reopens a row.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const foldedGroups = useMemo(
    () => groups.map((g) => ({ group: g, state: fold(g.name), cities: g.cities.map((c) => ({ city: c, text: fold(c.name) })) })),
    [groups],
  );
  const needle = fold(query.trim());

  const result = useMemo(() => {
    if (!needle) return { groups: foldedGroups.map((g) => ({ ...g, hits: g.cities.map((c) => c.city), open: false })), shown: totalCities, covShown: 0, first: null as string | null };
    let count = 0;
    let cov = 0;
    let first: string | null = null;
    const out = foldedGroups.map((g) => {
      const stateMatch = g.state.startsWith(needle);
      if (g.group.coverageOnly) {
        if (stateMatch) { cov++; first ??= g.group.name; }
        return { ...g, hits: [] as DirectoryGroup['cities'], open: stateMatch };
      }
      const hits = stateMatch ? g.cities.map((c) => c.city) : g.cities.filter((c) => c.text.includes(needle)).map((c) => c.city);
      if (hits.length) { count += hits.length; first ??= g.group.name; }
      return { ...g, hits, open: hits.length > 0 };
    });
    return { groups: out, shown: count, covShown: cov, first };
  }, [foldedGroups, needle, totalCities]);

  const matchingCards = useMemo(
    () => (needle ? cards.filter((c) => fold(c.name).startsWith(needle) || c.cities.some((n) => fold(n).includes(needle))) : cards),
    [cards, needle],
  );
  const visibleCodes = useMemo(() => new Set(matchingCards.slice(0, shown).map((c) => c.code)), [matchingCards, shown]);
  const left = Math.max(0, matchingCards.length - shown);
  const empty = result.shown === 0 && result.covShown === 0;

  // A new query starts the card grid again at the first page.
  const lastQuery = useRef(query);
  if (lastQuery.current !== query) {
    lastQuery.current = query;
    if (shown !== BATCH) setShown(BATCH);
  }

  return (
    <>
      {/* ---- state cards ---- */}
      <div className="states" id="state-cards">
        {cards.map((s) => (
          <article className="state-card reveal" key={s.code} hidden={!visibleCodes.has(s.code)}>
            {s.photo ? (
              <div className="ph">
                <img className="ph-photo" loading="lazy" decoding="async" src={s.photo} alt={s.photoAlt ?? `Chimney service in ${s.name}`} />
                {s.photoCredit && <small className="ph-credit">{s.photoCredit}</small>}
              </div>
            ) : (
              <div className="ph ph-plain"><span className="ph-plain-name">{s.name}</span><span className="ph-plain-note">Local photo to come</span></div>
            )}
            <span className="abbr">{s.code}</span>
            <div className="body">
              <h3>{s.href ? <a href={s.href}>{s.name}</a> : s.name}</h3>
              <p className="desc">{s.blurb}</p>
              <div className="cities">
                {s.verified ? (
                  <>
                    {s.cities.slice(0, 4).map((c) => <span key={c}>{c}</span>)}
                    {s.cities.length > 4 && <span className="more">+{s.cities.length - 4} more</span>}
                  </>
                ) : (
                  <span className="more">Cities to be confirmed</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="dir-more" id="states-more" hidden={left === 0}>
        <button className="btn btn-ghost" type="button" id="states-load-more" aria-controls="state-cards" onClick={() => setShown((n) => n + BATCH)}>
          Load more states ({left}) <Icon name="plus" />
        </button>
      </div>
      {coverageOnly.length > 0 && (
        <p className="dir-coverage" id="dir-coverage" style={{ marginTop: 26 }}>
          <b>Also covered:</b> {coverageOnly.join(' · ')}. City-level listings for these states are pending confirmation from Chimcare.
        </p>
      )}

      {/* ---- city directory ---- */}
      <div className="dirlist reveal" data-accordion="multi" id="dirlist">
        {result.groups.map((g) => {
          const open = needle ? g.open : openGroups.has(g.group.name);
          const hitCount = g.group.coverageOnly ? 0 : g.hits.length;
          return (
            <div
              className={open ? 'chips-group is-open' : 'chips-group'}
              key={g.group.name}
              data-state={g.group.name}
              data-coverage-only={g.group.coverageOnly ? '' : undefined}
              hidden={needle ? (g.group.coverageOnly ? !g.open : hitCount === 0) : false}
            >
              <button
                className="chips-head"
                type="button"
                aria-expanded={open}
                onClick={() => toggleGroup(g.group.name)}
              >
                <span>{g.group.name}</span>
                <span className="c">{g.group.coverageOnly ? 'Coverage area' : `${hitCount} ${hitCount === 1 ? 'city' : 'cities'}`}</span>
                <Icon name="plus" />
              </button>
              <div className="chips">
                {g.group.cities.map((c) => {
                  const hit = g.hits.includes(c);
                  return c.href ? (
                    <a key={c.name} href={c.href} data-city={c.name} hidden={needle ? !hit : false}>{c.name}</a>
                  ) : (
                    <span key={c.name} data-city={c.name} hidden={needle ? !hit : false}>{c.name}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="dir-empty" id="dir-empty" hidden={!empty}>
        <b>No matching city yet.</b> Try a nearby larger city, or call and we will tell you whether a Chimcare crew covers
        your address.
      </p>
    </>
  );
}

/**
 * The national hero's search field — the mock's `#finder`, with its clear button and status line.
 *
 * It owns no results. It writes to the shared store; `StateDirectory` below reads it. The counts in
 * the status line are computed from the same folded index the directory filters on, so the two can
 * never disagree about what matched.
 */
export function NationalFinder({
  groups,
  totalCities,
  stateCount,
}: {
  groups: DirectoryGroup[];
  totalCities: number;
  stateCount: number;
}) {
  ensureQuery('');
  const query = useSyncExternalStore(subscribe, getQuery, () => '');
  const needle = fold(query.trim());
  // Search is off: the first click, tap or Enter explains why nothing happens.
  const [notice, setNotice] = useState(false);
  const explain = SEARCH_ENABLED ? undefined : () => setNotice(true);

  const index = useMemo(
    () => groups.map((g) => ({ name: g.name, state: fold(g.name), coverageOnly: g.coverageOnly, cities: g.cities.map((c) => fold(c.name)) })),
    [groups],
  );

  const { shown, covShown, first } = useMemo(() => {
    if (!needle) return { shown: totalCities, covShown: 0, first: null as string | null };
    let n = 0;
    let cov = 0;
    let first: string | null = null;
    for (const g of index) {
      const stateMatch = g.state.startsWith(needle);
      if (g.coverageOnly) {
        if (stateMatch) { cov++; first ??= g.name; }
        continue;
      }
      const hits = stateMatch ? g.cities.length : g.cities.filter((c) => c.includes(needle)).length;
      if (hits) { n += hits; first ??= g.name; }
    }
    return { shown: n, covShown: cov, first };
  }, [index, needle, totalCities]);

  return (
    <div className="hero-search" id="finder">
      <div className="searchbar">
        <Icon name="search" className="ico s-ico" />
        <input
          id="f-q"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          readOnly={!SEARCH_ENABLED}
          onFocus={explain}
          onClick={explain}
          placeholder="Search by ZIP, city or state"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search Chimcare locations by ZIP code, city or state"
        />
        <button
          type="button"
          className="f-clear"
          id="f-clear"
          aria-label="Clear search"
          hidden={!query}
          onClick={() => setQuery('')}
        >
          <Icon name="x" />
        </button>
      </div>
      <p className="finder-note" id="finder-note" role="status" aria-live="polite">
        <Icon name="pin" />
        {notice ? (
          <span>{SEARCH_DISABLED_NOTE}</span>
        ) : !needle ? (
          <span>Showing <b>all {totalCities} locations</b> across {stateCount} {stateCount === 1 ? 'state' : 'states'}.</span>
        ) : shown === 0 && covShown === 0 ? (
          <span>No location matches <b>{query.trim()}</b>.</span>
        ) : shown === 0 ? (
          <span>Chimcare covers <b>{first}</b> — city listings for it are on the way.</span>
        ) : (
          <span>Showing <b>{shown} of {totalCities} locations</b>{first ? <> in {first}</> : null}.</span>
        )}
      </p>
    </div>
  );
}
