import '@/styles/city.css';
import type { CSSProperties } from 'react';
import type { LocationPageProps } from '@/lib/content/assemble-location';
import { Icon } from '@/components/chrome/Icon';
import { Accordion } from '@/components/islands/Accordion';
import { Breadcrumbs, SectionHead, TrustStrip, Faq } from '@/components/sections/shared';
import { ServiceDirectory } from '@/components/islands/ServiceDirectory';
import { ServiceDrawer } from '@/components/islands/ServiceDrawer';
import { FloatingCta } from '@/components/chrome/FloatingCta';
import { BookingForm } from '@/components/islands/BookingForm';
import { BookingSheet } from '@/components/islands/BookingSheet';

const pad = (n: number) => String(n + 1).padStart(2, '0');

/**
 * The leaf template — one service in one city, which is every URL under `/location/`.
 *
 * Built from the approved Spokane mock's design system, and driven entirely by what the page's own
 * WordPress body contains. A section that the source does not have is not rendered: no placeholder,
 * no borrowed content, no invented heading. That is why the same component renders a 60 KB city hub
 * and an 8 KB legacy page without a variant flag.
 *
 * Nothing here names a city, a state or a service.
 */
export function LocationPage(p: LocationPageProps) {
  const { hero, identity } = p;
  return (
    <>
      <main id="main">
        <section className="option o1 tpl-city">
          {/* HERO */}
          <div className="hero o1-hero" id="o1-hero">
            <div className="wrap">
              <div className="enter">
                <Breadcrumbs
                  crumbs={[
                    { label: 'Home', href: '/' },
                    { label: 'Locations', href: '/locations/' },
                    ...(identity.state ? [{ label: identity.stateName, href: `/locations/${identity.state.toLowerCase()}/` }] : []),
                    { label: identity.city || identity.slug },
                  ]}
                  style={{ '--i': 0 } as CSSProperties}
                />
                <ul className="hero-trust" aria-label="Trust" style={{ '--i': 1 } as CSSProperties}>
                  {hero.trustLine.map((t) => (
                    <li key={t.label}><Icon name={t.icon} />{t.label}</li>
                  ))}
                </ul>
                <p className="eyebrow" style={{ '--i': 1 } as CSSProperties}>{hero.eyebrow}</p>
                <h1 style={{ '--i': 2 } as CSSProperties}>{hero.title}</h1>
                {hero.lede && <p className="lede" style={{ '--i': 3 } as CSSProperties}>{hero.lede}</p>}
                <div className="ctas" style={{ '--i': 4 } as CSSProperties}>
                  <a className="btn btn-primary" href="#booking" data-book><em className="fast">Fast</em> Online Booking</a>
                  {hero.phone && hero.phoneHref && (
                    <a className="btn btn-outline" href={hero.phoneHref}><Icon name="phone" />Call {hero.phone}</a>
                  )}
                </div>
                {/* Proof, then the address — the mock's order. The rating and the award marks share
                    one row; the rating appears only where a rating is actually recorded. */}
                {(hero.rating || hero.awards.length > 0) && (
                  <div className="hero-proof" style={{ '--i': 5 } as CSSProperties}>
                    {hero.rating && (
                      <p className="rating">
                        <svg className="glogo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
                          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
                          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z" />
                          <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                        </svg>
                        <span className="stars" aria-hidden="true">★★★★★</span> Rated <b>{hero.rating.value}</b> on Google
                      </p>
                    )}
                    {hero.awards.length > 0 && (
                      <ul className="hero-awards">
                        {hero.awards.map((a) => (
                          <li key={a.src}><img src={a.src} width={a.width} height={a.height} decoding="async" alt={a.alt} title={a.alt} /></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {hero.addressLine && (
                  <p className="addr" style={{ '--i': 6 } as CSSProperties}><Icon name="pin" />{hero.addressLine}</p>
                )}
                {hero.image && (
                  <figure className="hero-figure" style={{ '--i': 7 } as CSSProperties}>
                    <img src={hero.image.src} width={hero.image.width} height={hero.image.height} fetchPriority="high" decoding="async" alt={hero.image.alt} title={hero.image.alt} />
                    {hero.figCaption && <figcaption>{hero.figCaption}</figcaption>}
                  </figure>
                )}
              </div>
              {/* The mock's hero is two columns: the page's own words on the left, the booking form
                  on the right. It is the same form on every page, so it is chrome, not content. */}
              <div className="book-slot">
                <BookingForm embedded options={p.booking} context={p.bookingContext} />
              </div>
            </div>
          </div>

          <TrustStrip items={p.trust} className="o1-trust" awards={false} />

          {/* WHY IT MATTERS — outline A */}
          {p.intro && (
            <div className="section o1-intro" id="o1-intro">
              <div className="wrap">
                <div className="reveal">
                  <p className="eyebrow">{p.intro.eyebrow}</p>
                  <h2>{p.intro.heading}</h2>
                  {p.reasons.length > 0 && (
                    <ol className="o1-reasons">
                      {p.reasons.map((r, i) => (
                        <li key={r.title}>
                          <span className="n">{pad(i)}</span>
                          <div><b>{r.title}</b><span>{r.body}</span></div>
                        </li>
                      ))}
                    </ol>
                  )}
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
          )}

          {/* WHY HOMEOWNERS TRUST CHIMCARE — outline B */}
          {p.whyTrust && (
            <div className="o1-trust-copy on-dark" id="o1-trust-copy">
              <div className="wrap">
                <div className="reveal">
                  <p className="eyebrow">Why Chimcare</p>
                  <h2>{p.whyTrust.heading}</h2>
                  {p.whyTrust.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
                </div>
                {p.whyTrust.art && (
                  <figure className="trust-art reveal">
                    <img src={p.whyTrust.art.src} width={p.whyTrust.art.width} height={p.whyTrust.art.height} loading="lazy" decoding="async" alt={p.whyTrust.art.alt} title={p.whyTrust.art.alt} />
                  </figure>
                )}
              </div>
            </div>
          )}

          {/* THE EIGHT HEADLINE SERVICES — the mock's accordion, with its illustration */}
          {p.serviceRows && (
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
                              <h4>What&rsquo;s included</h4>
                              <ul className="svc-list">
                                {r.included.map((x) => <li key={x}><Icon name="check" />{x}</li>)}
                              </ul>
                              <div className="ctas">
                                <a className="btn btn-primary" href="#booking" data-book>{r.cta}</a>
                                <button className="btn btn-ghost" type="button" data-drawer-open={r.key}>Open full detail</button>
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
          )}

          {/* THE FULL CATALOGUE — category tiles and the filterable grid */}
          {p.solutions && (
            <div className="section o1-solutions" id="o1-solutions">
              <div className="wrap">
                <SectionHead eyebrow={p.solutions.eyebrow} heading={p.solutions.heading} lede={p.solutions.lede} />
                <ServiceDirectory tiles={p.solutions.tiles} cards={p.solutions.cards} count={p.solutions.count} />
              </div>
            </div>
          )}

          {/* SERVICE DIRECTORY FROM THE SOURCE — outline B and C */}
          {p.serviceDirectory && p.serviceDirectory.items.length > 0 && (
            <div className="section o1-solutions" id="o1-solutions">
              <div className="wrap">
                <SectionHead eyebrow="Services" heading={p.serviceDirectory.heading} lede={p.serviceDirectory.lede ?? undefined} />
                <div className="svc-grid reveal" id="svc-grid" style={{ marginTop: 44 }}>
                  {p.serviceDirectory.items.map((name) => (
                    <article key={name} className="svc-card">
                      <h3>{name}</h3>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PROCESS — outline A */}
          {p.process && (
            <div className="section" id="o1-process">
              <div className="wrap">
                <SectionHead eyebrow="How it works" heading={p.process.heading} />
                {p.process.steps.length > 0 ? (
                  <ol className="o1-steps reveal">
                    {p.process.steps.map((s, i) => (
                      <li className="o1-step" key={(s.title || s.body).slice(0, 40)}>
                        <span className="dot">{pad(i)}</span>
                        {s.title && <h3>{s.title}</h3>}
                        <p>{s.body}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="copy reveal">{p.process.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}</div>
                )}
              </div>
            </div>
          )}

          {/* SERVICE AREAS */}
          {p.areas && p.areas.list.length > 0 && (
            <div className="section areas" id="o1-areas">
              <div className="wrap">
                <div className="reveal">
                  <p className="eyebrow">{p.areas.eyebrow}</p>
                  <h2>{p.areas.heading}</h2>
                  {p.areas.lede && <p className="lede">{p.areas.lede}</p>}
                </div>
                <div className="reveal">
                  {p.areas.image && (
                    <figure className="ph-img" id="ph-areas">
                      <img src={p.areas.image.src} width={p.areas.image.width} height={p.areas.image.height} loading="lazy" decoding="async" alt={p.areas.image.alt} title={p.areas.image.alt} />
                    </figure>
                  )}
                  {p.areas.subHeading && (
                    <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', margin: '0 0 8px' }}>{p.areas.subHeading}</h3>
                  )}
                  <ul className="area-list">
                    {p.areas.list.map((a) => <li key={a}><Icon name="pin" />{a}</li>)}
                  </ul>
                  <div className="ctas" style={{ marginTop: 26 }}>
                    <a className="btn btn-primary" href="#booking" data-book>Book a visit</a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WHY CHOOSE US */}
          {p.whyChooseUs && (
            <div className="section o1-contact" id="o1-contact">
              <div className="wrap">
                <div className="reveal">
                  <p className="eyebrow">Why us</p>
                  <h2 style={{ fontSize: 'clamp(30px,3.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.06, margin: '12px 0 18px' }}>
                    {p.whyChooseUs.heading}
                  </h2>
                  {p.whyChooseUs.paragraphs.map((t) => <p key={t.slice(0, 40)} style={{ color: 'var(--text-2)', maxWidth: '52ch' }}>{t}</p>)}
                </div>
                {p.whyChooseUs.bullets.length > 0 && (
                  <div className="why-card reveal">
                    <h3>What you get</h3>
                    <ul>
                      {p.whyChooseUs.bullets.map((b) => <li key={b}><Icon name="check" /><span>{b}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTACT */}
          {p.contact && (
            <div className="section o1-contact" id="o1-contact">
              <div className="wrap">
                <div className="reveal">
                  <p className="eyebrow">{p.contact.eyebrow}</p>
                  <h2 style={{ fontSize: 'clamp(30px,3.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.06, margin: '12px 0 18px' }}>{p.contact.heading}</h2>
                  <p style={{ color: 'var(--text-2)', maxWidth: '46ch' }}>{p.contact.paragraph}</p>
                  <div className="contact-lines">
                    {p.contact.addressLines.length > 0 && (
                      <span className="row"><Icon name="pin" /><span>{p.contact.addressLines[0]}<br />{p.contact.addressLines[1]}</span></span>
                    )}
                    {p.contact.servedFrom && <span className="row"><Icon name="pin" /><span>{p.contact.servedFrom}</span></span>}
                    {p.contact.phone && p.contact.phoneHref && (
                      <span className="row"><Icon name="phone" /><a href={p.contact.phoneHref}>{p.contact.phone}</a></span>
                    )}
                    <span className="row"><Icon name="cal" /><a href="#booking" data-book>Schedule online</a></span>
                  </div>
                </div>
                {p.contact.why.length > 0 && (
                  <div className="why-card reveal">
                    <h3>{p.contact.whyHeading}</h3>
                    <ul>{p.contact.why.map((w) => <li key={w}><Icon name="check" /><span>{w}</span></li>)}</ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ANYTHING THE OUTLINES DO NOT COVER — rendered plainly rather than dropped */}
          {p.other.map((o) => (
            <div className="section" key={o.heading}>
              <div className="wrap">
                <SectionHead eyebrow="From this page" heading={o.heading} />
                <div className="copy reveal">{o.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}</div>
              </div>
            </div>
          ))}

          {/* COST */}
          {p.cost && (
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
                    {hero.phone && hero.phoneHref && (
                      <a className="btn btn-ghost" href={hero.phoneHref}><Icon name="phone" />{hero.phone}</a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FAQ */}
          {p.faq && (
            <div className="section" id="o1-faq">
              <div className="wrap">
                <SectionHead eyebrow="Questions" heading={p.faq.heading} />
                <Faq items={p.faq.items} />
              </div>
            </div>
          )}

          {/* FINAL CTA */}
          {p.finalCta && (
            <div className="section o1-final" id="o1-cta">
              <div className="wrap">
                <div className="panel on-dark reveal">
                  <div>
                    <p className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>Chimcare</p>
                    <h2 style={{ marginTop: 12 }}>{p.finalCta.heading}</h2>
                    {p.finalCta.paragraphs.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
                  </div>
                  <div className="side">
                    <a className="btn btn-primary" href="#booking" data-book>Schedule Service</a>
                    {hero.phone && hero.phoneHref && (
                      <a className="phone" href={hero.phoneHref}><Icon name="phone" />{hero.phone}</a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      <BookingSheet options={p.booking} context={p.bookingContext} />
      {p.serviceRows && p.serviceRows.rows.length > 0 && hero.phone && hero.phoneHref && (
        <ServiceDrawer rows={p.serviceRows.rows} eyebrow={hero.eyebrow} phone={hero.phone} phoneHref={hero.phoneHref} />
      )}
      {hero.phone && hero.phoneHref && (
        <FloatingCta phone={hero.phone} phoneHref={hero.phoneHref} email="harold@chimcare.com" quoteHref="#booking" />
      )}
    </>
  );
}
