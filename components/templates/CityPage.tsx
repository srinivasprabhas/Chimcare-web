import '@/styles/city.css';
import type { CSSProperties } from 'react';
import type { CityPageProps } from '@/lib/content/assemble';
import { Icon } from '@/components/chrome/Icon';
import { JsonLd } from '@/components/seo/JsonLd';
import { Accordion } from '@/components/islands/Accordion';
import { ServiceDirectory } from '@/components/islands/ServiceDirectory';
import { Breadcrumbs, Faq, SectionHead } from '@/components/sections/shared';
import { BookingForm } from '@/components/islands/BookingForm';
import { BookingSheet } from '@/components/islands/BookingSheet';
import { ServiceDrawer } from '@/components/islands/ServiceDrawer';
import { FloatingCta } from '@/components/chrome/FloatingCta';

const pad = (n: number) => String(n + 1).padStart(2, '0');

/**
 * The city page. Spokane is one instance of this template — every city-specific value arrives in
 * `CityPageProps` and nothing here names a city.
 *
 * The trust strip the earlier mocks put under the hero is `display:none` in the newest city mock;
 * its three claims moved into the hero as `hero.trustLine`. The strip is therefore not rendered,
 * rather than rendered invisibly.
 */
export function CityPage(p: CityPageProps) {
  const style = { '--img-city': `url(${p.imgCity})` } as CSSProperties;
  return (
    <>
      <main id="main">
      <JsonLd data={p.jsonLd} />
      <section className="option o1 tpl-city" style={style}>
        {/* HERO: location message left · booking right */}
        <div className="hero o1-hero" id="o1-hero">
          <div className="wrap">
            <div className="enter">
              <Breadcrumbs crumbs={p.crumbs} style={{ '--i': 0 } as CSSProperties} />
              {p.hero.trustLine.length > 0 && (
                <ul className="hero-trust" aria-label="Trust" style={{ '--i': 1 } as CSSProperties}>
                  {p.hero.trustLine.map((t) => (
                    <li key={t.label}><Icon name={t.icon} />{t.label}</li>
                  ))}
                </ul>
              )}
              <p className="eyebrow" style={{ '--i': 1 } as CSSProperties}>{p.hero.eyebrow}</p>
              <h1 style={{ '--i': 2 } as CSSProperties}>{p.hero.title}</h1>
              <p className="lede" style={{ '--i': 3 } as CSSProperties}>{p.hero.lede}</p>
              <div className="ctas" style={{ '--i': 4 } as CSSProperties}>
                <a className="btn btn-primary" href="#booking" data-book>Schedule Service</a>
                <a className="btn btn-outline" href={p.contact.phoneHref}><Icon name="phone" />Call {p.contact.phone}</a>
              </div>
              {p.hero.addressLine && (
                <p className="addr" style={{ '--i': 5 } as CSSProperties}><Icon name="pin" />{p.hero.addressLine}</p>
              )}
              {(p.hero.rating || p.hero.awards.length > 0) && (
                <div className="hero-proof" style={{ '--i': 5 } as CSSProperties}>
                  {p.hero.rating && (
                    <p className="rating">
                      <span className="stars" aria-hidden="true">★★★★★</span> Rated <b>{p.hero.rating.value}</b> on Google
                    </p>
                  )}
                  {p.hero.awards.length > 0 && (
                    <ul className="hero-awards">
                      {p.hero.awards.map((a) => (
                        <li key={a.src}><img src={a.src} width={a.width} height={a.height} decoding="async" alt={a.alt} title={a.alt} /></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <figure className="hero-figure" style={{ '--i': 7 } as CSSProperties}>
                <img src={p.hero.image.src} width={p.hero.image.width} height={p.hero.image.height} fetchPriority="high" decoding="async" alt={p.hero.image.alt} title={p.hero.image.alt} />
                <figcaption>{p.hero.figCaption}</figcaption>
              </figure>
            </div>
            <div className="book-slot">
              <BookingForm embedded options={p.booking} context={p.bookingContext} />
            </div>
          </div>
        </div>

        {/* INTRODUCTION */}
        <div className="section o1-intro" id="o1-intro">
          <div className="wrap">
            <div className="reveal">
              <p className="eyebrow">{p.intro.eyebrow}</p>
              <h2>{p.intro.heading}</h2>
              <ol className="o1-reasons">
                {p.reasons.map((r, i) => (
                  <li key={r.title}>
                    <span className="n">{pad(i)}</span>
                    <div>
                      <b>{r.title}</b>
                      <span>{r.body}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="copy reveal">
              {p.intro.teamPhoto && (
                <figure className="team-photo">
                  <img src={p.intro.teamPhoto.src} width={p.intro.teamPhoto.width} height={p.intro.teamPhoto.height} loading="lazy" decoding="async" alt={p.intro.teamPhoto.alt} title={p.intro.teamPhoto.alt} />
                </figure>
              )}
              {p.intro.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
              <div className="ctas"><a className="btn btn-primary" href="#booking" data-book>{p.intro.cta}</a></div>
            </div>
          </div>
        </div>

        {/* WHY HOMEOWNERS TRUST CHIMCARE */}
        <div className="o1-trust-copy on-dark" id="o1-trust-copy">
          <div className="wrap">
            <div className="reveal">
              <p className="eyebrow">{p.whyTrust.eyebrow}</p>
              <h2>{p.whyTrust.heading}</h2>
              <p>{p.whyTrust.paragraph}</p>
            </div>
            <figure className="trust-art reveal">
              <img src="/img/trust-art.webp" width={361} height={302} loading="lazy" decoding="async" alt="Local & trusted, dust-free cleaning, safety first, transparent pricing" title="Local & trusted, dust-free cleaning, safety first, transparent pricing" />
            </figure>
          </div>
        </div>

        {/* SERVICE DIRECTORY: expandable rows */}
        <div className="section o1-svc" id="o1-services">
          <div className="wrap">
            <SectionHead eyebrow={p.serviceRows.eyebrow} heading={p.serviceRows.heading} lede={p.serviceRows.lede} figure={p.serviceRows.image} figureId="ph-services" />
            <Accordion mode="single" className="o1-list reveal" id="svc-lib">
              {p.serviceRows.rows.map((r, i) => (
                <article className={i === 0 ? 'o1-row is-open' : 'o1-row'} key={r.key} data-service={r.key} data-acc-item>
                  <button className="o1-row-btn" type="button" aria-expanded={i === 0} aria-controls={`o1-p${i + 1}`} data-acc-trigger>
                    <span className="num">{pad(i)}</span>
                    <span className="ic"><Icon name={r.icon} /></span>
                    <span>
                      <h3 className="svc-name">{r.name}</h3>
                      <p className="short svc-short">{r.short}</p>
                    </span>
                    <span className="plus"><Icon name="plus" /></span>
                  </button>
                  <div className="acc-panel" id={`o1-p${i + 1}`}>
                    <div>
                      <div className="body">
                        <div className="svc-body svc-main">
                          {r.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
                        </div>
                        <div className="side svc-body svc-side">
                          <h4>What's included</h4>
                          <ul className="svc-list">
                            {r.included.map((x) => <li key={x}><Icon name="check" />{x}</li>)}
                          </ul>
                          <div className="ctas">
                            <a className="btn btn-primary" href="#booking" data-book>{r.cta}</a>
                            <button className="btn btn-ghost" type="button" data-drawer-open={r.key}>
                              Open full detail
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </Accordion>
          </div>
        </div>

        {/* FULL SERVICE SOLUTIONS — every service, filterable */}
        <div className="section o1-solutions" id="o1-solutions">
          <div className="wrap">
            <SectionHead eyebrow={p.solutions.eyebrow} heading={p.solutions.heading} lede={p.solutions.lede} />
            <ServiceDirectory tiles={p.solutions.tiles} cards={p.solutions.cards} count={p.solutions.count} />
          </div>
        </div>

        {/* SERVICE AREA */}
        <div className="section areas" id="o1-areas">
          <div className="wrap">
            <div className="reveal">
              <p className="eyebrow">{p.areas.eyebrow}</p>
              <h2>{p.areas.heading}</h2>
              <p className="lede">{p.areas.lede}</p>
            </div>
            <div className="reveal">
              {p.areas.image && (
                <figure className="ph-img" id="ph-areas">
                  <img src={p.areas.image.src} width={p.areas.image.width} height={p.areas.image.height} loading="lazy" decoding="async" alt={p.areas.image.alt} title={p.areas.image.alt} />
                </figure>
              )}
              <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', margin: '0 0 8px' }}>{p.areas.subHeading}</h3>
              <p style={{ color: 'var(--text-2)', marginBottom: 22 }}>{p.areas.subLede}</p>
              <ul className="area-list">
                {p.areas.list.map((a) => <li key={a}><Icon name="pin" />{a}</li>)}
              </ul>
              <div className="ctas" style={{ marginTop: 26 }}><a className="btn btn-primary" href="#booking" data-book>{p.areas.cta}</a></div>
            </div>
          </div>
        </div>

        {/* PROCESS */}
        <div className="section" id="o1-process">
          <div className="wrap">
            <SectionHead eyebrow={p.process.eyebrow} heading={p.process.heading} lede={p.process.lede} />
            <ol className="o1-steps reveal">
              {p.process.steps.map((s, i) => (
                <li className="o1-step" key={s.title}>
                  <span className="dot">{pad(i)}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* COST */}
        <div className="section o1-cost" id="o1-cost">
          <div className="wrap">
            <div className="panel reveal">
              <div>
                <p className="eyebrow">{p.cost.eyebrow}</p>
                <h2>{p.cost.heading}</h2>
                <p>{p.cost.paragraph}</p>
                <div className="factors">{p.cost.factors.map((f) => <span key={f}>{f}</span>)}</div>
              </div>
              <div className="ctas" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <a className="btn btn-primary" href="#booking" data-book>{p.cost.cta}</a>
                <a className="btn btn-ghost" href={p.contact.phoneHref}><Icon name="phone" />{p.contact.phone}</a>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="section" id="o1-faq">
          <div className="wrap">
            <SectionHead eyebrow={p.faq.eyebrow} heading={p.faq.heading} />
            <Faq items={p.faq.items} />
          </div>
        </div>

        {/* CONTACT */}
        <div className="section o1-contact" id="o1-contact">
          <div className="wrap">
            <div className="reveal">
              <p className="eyebrow">{p.contactBlock.eyebrow}</p>
              <h2 style={{ fontSize: 'clamp(30px,3.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.06, margin: '12px 0 18px' }}>{p.contactBlock.heading}</h2>
              <p style={{ color: 'var(--text-2)', maxWidth: '46ch' }}>{p.contactBlock.paragraph}</p>
              <div className="contact-lines">
                {p.contact.addressLines.length > 0 && (
                  <span className="row"><Icon name="pin" /><span>{p.contact.addressLines[0]}<br />{p.contact.addressLines[1]}</span></span>
                )}
                {p.contact.servedFrom && <span className="row"><Icon name="pin" /><span>{p.contact.servedFrom}</span></span>}
                <span className="row"><Icon name="phone" /><a href={p.contact.phoneHref}>{p.contact.phone}</a></span>
                <span className="row"><Icon name="cal" /><a href="#booking" data-book>Schedule online</a></span>
                {p.contact.directionsHref && (
                  <span className="row"><Icon name="arrow" /><a href={p.contact.directionsHref} target="_blank" rel="noopener">Get Directions</a></span>
                )}
              </div>
            </div>
            <div className="why-card reveal">
              <h3>{p.contactBlock.whyHeading}</h3>
              <ul>
                {p.contactBlock.why.map((w) => <li key={w}><Icon name="check" /><span>{w}</span></li>)}
              </ul>
            </div>
          </div>
        </div>

        {/* FINAL CTA */}
        <div className="section o1-final" id="o1-cta">
          <div className="wrap">
            <div className="panel on-dark reveal">
              <div>
                <p className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>{p.finalCta.eyebrow}</p>
                <h2 style={{ marginTop: 12 }}>{p.finalCta.heading}</h2>
                <p>{p.finalCta.paragraph}</p>
              </div>
              <div className="side">
                <a className="btn btn-primary" href="#booking" data-book>{p.finalCta.cta}</a>
                <a className="phone" href={p.contact.phoneHref}><Icon name="phone" />{p.contact.phone}</a>
                {p.hero.addressLine && <span style={{ fontSize: 14, color: 'rgba(255,255,255,.8)' }}>{p.hero.addressLine}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>
      {/* Dialogs and the floating cluster are siblings of <main>, as in the mocks. Nested inside a
          section they would be positioned against it rather than the viewport, and a closed panel
          parked off-canvas would widen the document. */}
      <BookingSheet options={p.booking} context={p.bookingContext} />
      <ServiceDrawer
        rows={p.serviceRows.rows}
        eyebrow={p.hero.eyebrow}
        phone={p.contact.phone}
        phoneHref={p.contact.phoneHref}
      />
      <FloatingCta phone={p.contact.phone} phoneHref={p.contact.phoneHref} email="harold@chimcare.com" quoteHref="#o1-cost" />
    </>
  );
}
