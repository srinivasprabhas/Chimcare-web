'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { LocationCard } from '@/lib/content/assemble-hubs';

/**
 * The state hub's map: one pin per location, drawn with Leaflet, beside the directory cards.
 *
 * Tiles come from OpenStreetMap by default. Its free tile servers suit a demo and light traffic but are
 * not meant for a busy commercial site, so the source is configurable: set NEXT_PUBLIC_MAP_TILE_URL and
 * NEXT_PUBLIC_MAP_TILE_ATTRIBUTION to a hosted provider before real traffic arrives. Both are read at
 * build time.
 *
 * Leaflet touches `window`, so it is imported inside the effect and never runs on the server. Every
 * location link is already in the server HTML through the directory cards, so the map hides nothing
 * from a crawler. If Leaflet cannot load, or no location has coordinates, the panel shows a plain list.
 *
 * The pin, tooltip and popup classes (`lpin`, `ltip`, `lpop`) are the design's own, styled in state.css.
 * Scroll-wheel zoom starts off so the page scrolls past the map, and turns on once the map is clicked or
 * focused. One-finger dragging is off on phones for the same reason; pinch zoom and the zoom buttons still work.
 */

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Pin = LocationCard & { lat: number; lng: number };

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

function popupHtml(c: Pin): string {
  const where = c.addressLines.length ? c.addressLines.join(', ') : c.servedFrom ?? '';
  return [
    `<strong>${escapeHtml(c.name)}</strong>`,
    where ? `${escapeHtml(where)}<br>` : '',
    `<a href="${escapeHtml(c.phoneHref)}">${escapeHtml(c.phone)}</a>`,
    c.href ? ` · <a href="${escapeHtml(c.href)}">View location</a>` : '',
  ].join('');
}

export function MapPanel({ cards }: { cards: LocationCard[] }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const mapEl = useRef<HTMLDivElement>(null);
  const pins = useMemo(() => cards.filter((c): c is Pin => c.lat != null && c.lng != null), [cards]);

  useEffect(() => {
    const el = mapEl.current;
    if (!el || pins.length === 0) {
      setStatus('failed');
      return;
    }
    let map: LeafletMap | null = null;
    let cancelled = false;

    import('leaflet')
      .then((mod) => {
        if (cancelled) return;
        // Leaflet is a CommonJS package; bundlers expose it either as the module itself or as `default`.
        const L = mod.default ?? mod;
        const m = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile });
        map = m;
        // Wheel zoom switches on once the visitor clicks into (or tabs to) the map, and off again when the pointer
        // leaves, so a page scroll that merely passes over the map still scrolls the page.
        m.on('click focus', () => m.scrollWheelZoom.enable());
        m.on('mouseout blur', () => m.scrollWheelZoom.disable());
        L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);

        const icon = L.divIcon({ className: 'lpin', html: '<span class="lpin-dot"></span>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
        for (const c of pins) {
          const marker = L.marker([c.lat, c.lng], { icon, title: c.name, alt: c.name, keyboard: true, riseOnHover: true }).addTo(map);
          marker.bindTooltip(escapeHtml(c.name), { className: 'ltip', direction: 'top', offset: [0, -12] });
          marker.bindPopup(popupHtml(c), { className: 'lpop' });
          marker.on('popupopen', () => marker.getElement()?.classList.add('is-active'));
          marker.on('popupclose', () => marker.getElement()?.classList.remove('is-active'));
        }
        map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [28, 28] });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);

  return (
    <>
      <button
        className="btn btn-ghost map-toggle"
        type="button"
        id="map-toggle"
        aria-expanded={open}
        aria-controls="map-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide map' : 'Show map'}
      </button>
      <div className={open ? 'map-panel reveal is-shown' : 'map-panel reveal'} id="map-panel">
        <div
          className="lmap"
          id="lmap"
          ref={mapEl}
          role="region"
          aria-label={`Map of ${pins.length} Chimcare locations`}
          hidden={status === 'failed'}
        />
        {status === 'failed' && (
          <div className="lmap-list-wrap">
            <p className="lmap-fallback">The map could not load. Every location is listed here, with a phone number for each.</p>
            <ul className="lmap-list">
              {cards.map((c) => (
                <li key={c.id}>
                  {c.href ? <a href={c.href}>{c.name}</a> : <span>{c.name}</span>}
                  <a className="tel" href={c.phoneHref}>{c.phone}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="map-legend">
          <span><i></i>Chimcare location</span>
          <span>Select a pin for its phone number and page.</span>
        </div>
      </div>
    </>
  );
}
