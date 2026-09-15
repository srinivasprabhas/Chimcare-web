import '@/styles/state.css';
import type { CSSProperties } from 'react';
import type { StateHubProps } from '@/lib/content/assemble-hubs';
import { Icon } from '@/components/chrome/Icon';
import { JsonLd } from '@/components/seo/JsonLd';
import { Accordion } from '@/components/islands/Accordion';
import { Breadcrumbs, HeroAwards, SectionHead, TrustStrip } from '@/components/sections/shared';
import { BookingSheet } from '@/components/islands/BookingSheet';
import { HeroSearch } from '@/components/islands/HeroSearch';
import { LocationDirectory } from '@/components/islands/LocationDirectory';
import { MapPanel } from '@/components/islands/MapPanel';
import { FloatingCta } from '@/components/chrome/FloatingCta';

/**
 * The state hub. Washington is one instance of this template, not a page: everything specific to a
 * state arrives in `StateHubProps`, and nothing here names one.
 *
 * `query` is the `?q=` the route was asked for, so a shared or reloaded search filters on the server
 * before any JavaScript runs. `stateSlug` is where the search form posts back to.
 */
export function StateHub(p: StateHubProps & { query?: string; stateSlug: string }) {
  const query = p.query ?? '';
  const style = { '--img-state': `url(${p.imgState})` } as CSSProperties;
  return (
    <>
      <main id="main" className="tpl-state" style={style}>
      <JsonLd data={p.jsonLd} />
      {/* HERO */}
      <section className="hero" id="o1-hero">
        <div className="wrap enter">
          <Breadcrumbs crumbs={p.crumbs} style={{ '--i': 0 } as CSSProperties} />
          <div className="hero-grid" style={{ '--i': 1 } as CSSProperties}>
            <div className="hero-copy">
              <h1><span className="hl">Chimcare</span> Locations in {p.hero.name}</h1>
              <p className="lede">{p.hero.lede}</p>
              <HeroSearch
                action={`/locations/${p.stateSlug}/`}
                initialQuery={query}
                searchIndex={p.directory.cards.map((c) => c.search)}
                totalCount={p.hero.count}
                stateName={p.hero.name}
              />
              <div className="ctas">
                <a className="btn btn-primary" href="#directory">Find Your Location <Icon name="arrow" /></a>
                <a className="btn btn-outline" href="#booking" data-book>Schedule Service</a>
              </div>
              <div className="hero-meta">
                <div><b>{p.hero.count}</b><span>Locations statewide</span></div>
                <div><b>1989</b><span>Serving since</span></div>
                <div><b>CSIA</b><span>Certified technicians</span></div>
              </div>
            </div>
          </div>
          <div className="hero-certs">
            <span className="lbl">MEMBERSHIPS &amp; AWARDS</span>
            <HeroAwards />
          </div>
        </div>
        {p.imgCredit && <small className="hero-credit">{p.imgCredit}</small>}
      </section>

      <TrustStrip items={p.trust} className="trust" awards={false} />

      {/* DIRECTORY + MAP */}
      <section className="section mapsec dir-lead" id="directory">
        <div className="wrap">
          <SectionHead eyebrow={p.directory.eyebrow} heading={p.directory.heading} lede={p.directory.lede} />
          <div className="grid">
            <div>
              <LocationDirectory cards={p.directory.cards} initialQuery={query} />
            </div>
            {/* The map is the grid's second column on desktop, beside the cards, and leads on smaller
                screens (state.css orders it first). It used to share the first column's wrapper, which
                put it under every card and left the right-hand column empty. */}
            <MapPanel cards={p.mapCards ?? p.directory.cards} />
          </div>
        </div>
      </section>

      {/* EDITORIAL INTRO */}
      <section className="section tinted intro">
        <div className="wrap">
          <div className="rail reveal">
            <p className="eyebrow">{p.intro.eyebrow}</p>
            <h2>{p.intro.heading}</h2>
            <div className="ctas">
              <a className="btn btn-dark" href="#booking" data-book>Schedule Service</a>
              <a className="btn btn-ghost" href="#services">Read the detail</a>
            </div>
          </div>
          <div className="copy reveal">
            {p.intro.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
            <ul className="stats">
              {p.intro.stats.map((s) => <li key={s.title}><b>{s.title}</b><span>{s.body}</span></li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* EDITORIAL BLOCKS */}
      <section className="section">
        <div className="wrap">
          {p.editorial.map((e) => (
            <article className={e.flip ? 'ed flip reveal' : 'ed reveal'} key={e.heading}>
              <figure>
                <div className="ph" data-ph={e.imageAlt}>
                  <img className="ph-photo" src={'/' + e.imageKey} alt={e.imageAlt} loading="lazy" decoding="async" />
                </div>
              </figure>
              <div>
                <p className="eyebrow">{e.eyebrow}</p>
                <h2>{e.heading}</h2>
                <p>{e.intro}</p>
                <ul className="clist">
                  {e.bullets.map((b) => <li key={b}><Icon name="check" />{b}</li>)}
                </ul>
                {e.outro && <p style={{ marginTop: 20 }}>{e.outro}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* EXPANDABLE DETAIL */}
      <section className="section tinted" id="services">
        <div className="wrap">
          <SectionHead eyebrow={p.detail.eyebrow} heading={p.detail.heading} lede={p.detail.lede} left />
          <Accordion mode="multi" className="faq reveal">
            {p.detail.items.map((it, i) => (
              <div className={i === 0 ? 'faq-item is-open' : 'faq-item'} key={it.question} data-acc-item>
                <button className="faq-q" type="button" aria-expanded={i === 0} data-acc-trigger>
                  {it.question}
                  <Icon name="plus" />
                </button>
                <div className="acc-panel">
                  <div>
                    <div className="faq-a">
                      {it.intro && <p>{it.intro}</p>}
                      {it.bullets && <ul>{it.bullets.map((b) => <li key={b}><Icon name="check" /><span>{b}</span></li>)}</ul>}
                      {it.paragraphs?.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CREW */}
      <section className="section crew">
        <div className="wrap">
          <SectionHead eyebrow="Our people" heading="Real technicians, real certifications." lede="The same faces show up on your street year after year — trained, background-checked, and certified to work on your chimney." />
          <div className="crew-grid">
            {p.crew.map((c) => (
              <div className="crew-card reveal" key={c.title}>
                <img className="ph-photo" loading="lazy" decoding="async" width={600} height={400} src={c.src} alt={c.alt} />
                <div className="body"><b>{c.title}</b><small>{c.small}</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="section final" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="wrap">
          <div className="panel reveal">
            <div>
              <p className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>{p.finalCta.eyebrow}</p>
              <h2 style={{ marginTop: 12 }}>{p.finalCta.heading}</h2>
              <p>{p.finalCta.paragraph}</p>
            </div>
            <div className="side">
              <a className="btn btn-primary" href="#booking" data-book>Schedule Service</a>
              <a className="btn btn-outline" href="/locations/">All Chimcare locations</a>
              <a className="phone-big" href={p.phoneHref}><Icon name="phone" />{p.phone}</a>
            </div>
          </div>
        </div>
      </section>
      </main>
      {/* Siblings of <main>, as in the mocks — see CityPage. */}
      <BookingSheet options={p.booking} context={p.bookingContext} />
      <FloatingCta phone={p.phone} phoneHref={p.phoneHref} email="harold@chimcare.com" quoteHref="#directory" />
    </>
  );
}
