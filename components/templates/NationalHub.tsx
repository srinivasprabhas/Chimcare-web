import '@/styles/hub.css';
import '@/styles/hub-hero.css';
import type { CSSProperties } from 'react';
import type { NationalHubProps } from '@/lib/content/assemble-hubs';
import { Icon } from '@/components/chrome/Icon';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumbs, HeroAwards, SectionHead, TrustStrip } from '@/components/sections/shared';
import { BookingForm } from '@/components/islands/BookingForm';
import { BookingSheet } from '@/components/islands/BookingSheet';
import { NationalFinder, StateDirectory } from '@/components/islands/StateDirectory';
import { FloatingCta } from '@/components/chrome/FloatingCta';

const FEATS = [
  { title: 'Experienced Technicians', body: 'With decades of experience and certifications from the Chimney Safety Institute of America (CSIA), our technicians are equipped to handle any chimney issue.' },
  { title: 'Comprehensive Services', body: 'From routine chimney sweeping to complex masonry repairs and gas fireplace services, Chimcare offers a full range of solutions to keep your home safe.' },
  { title: 'Local Expertise', body: "Our knowledge of the unique climates and building regulations in each state we operate allows us to provide customized services that best suit your location's needs." },
  { title: 'Customer Satisfaction', body: 'We are dedicated to providing exceptional service, ensuring each customer is fully satisfied with our work. Our 30+ years in the business speak to our reliability and quality.' },
];

export function NationalHub(p: NationalHubProps) {
  return (
    <>
      <main id="main" className="tpl-hub">
      <JsonLd data={p.jsonLd} />
      <section className="hero" id="o1-hero">
        <div className="wrap enter">
          <Breadcrumbs crumbs={[{ label: 'Home', href: '/' }, { label: 'Locations' }]} style={{ '--i': 0 } as CSSProperties} />
          <div className="hero-grid has-book" style={{ '--i': 1 } as CSSProperties}>
            <div className="hero-copy">
              <h1>Find the <span className="hl">Chimcare</span> crew that works your street.</h1>
              <p className="lede">
                Top-quality chimney sweeping, repair and masonry across {p.hero.states} {p.hero.states === 1 ? 'state' : 'states'}.<br className="br-lg" /> Trusted local teams who know your roofs, weather and codes.
              </p>
              {/* The finder sits in the hero and filters both directories below, through the shared store. */}
              <NationalFinder groups={p.directoryGroups} totalCities={p.hero.cities} stateCount={p.hero.states} />
              <div className="ctas">
                <a className="btn btn-primary" href="#states">Find Your Location <Icon name="arrow" /></a>
                <a className="btn btn-outline" href="#booking" data-book>Schedule Service</a>
              </div>
              <div className="hero-meta">
                <div><b>{p.hero.states}</b><span>States served</span></div>
                <div><b>{p.hero.cities}</b><span>Cities listed</span></div>
                <div><b>1989</b><span>Serving since</span></div>
              </div>
              <div className="hero-certs">
                <span className="lbl">MEMBERSHIPS &amp; AWARDS</span>
                <HeroAwards />
              </div>
            </div>
            {/* The same booking widget as the location pages; the hero's Schedule Service buttons scroll to it. */}
            <div className="book-slot">
              <BookingForm embedded options={p.booking} context={p.bookingContext} />
            </div>
          </div>
        </div>
      </section>

      <TrustStrip items={p.trust} className="trust" awards={false} />

      <section className="section intro">
        <div className="wrap">
          <div className="rail reveal">
            <p className="eyebrow">Who we are</p>
            <h2>Chimcare Service Locations</h2>
            <div className="ctas"><a className="btn btn-dark" href="#states">Browse by state</a><a className="btn btn-ghost" href="#booking" data-book>Schedule Service</a></div>
          </div>
          <div className="copy reveal">
            <p>At Chimcare, we pride ourselves on providing top-quality chimney sweeping, repair, and masonry services to homeowners across multiple states.</p>
            <p>Each region runs its own crew, so the technician on your roof already knows the local climate, the local building stock and the codes that apply to it.</p>
            <ul className="stats">
              <li><b>Sweeping &amp; inspection</b><span>Creosote removal, three-level inspections and draft checks</span></li>
              <li><b>Repair &amp; masonry</b><span>Crowns, caps, flashing, liners, tuckpointing and rebuilds</span></li>
              <li><b>Waterproofing</b><span>Protection against moisture damage in wet climates</span></li>
              <li><b>Gas fireplaces</b><span>Installation, repair and maintenance year-round</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* STATE CARDS + CITY DIRECTORY — one island, one search field, as in the mock */}
      <section className="section tinted" id="states">
        <div className="wrap">
          <SectionHead
            eyebrow="Where we work"
            heading={`${p.stateCards.length} ${p.stateCards.length === 1 ? 'state' : 'states'}, one standard of work.`}
            lede="Open a state to see every city its crew covers, or jump straight to the location nearest you."
          />
          <StateDirectory
            cards={p.stateCards}
            groups={p.directoryGroups}
            totalCities={p.hero.cities}
            coverageOnly={p.coverageOnly}
          />
        </div>
      </section>

      <section className="section" id="why">
        <div className="wrap">
          <SectionHead eyebrow="Why Chimcare" heading="Why homeowners across the U.S. trust us." lede="At Chimcare, we are committed to delivering the best customer experience, no matter where you are." />
          <div className="feats reveal">
            {FEATS.map((f, i) => (
              <div className="feat" key={f.title}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section tight" id="crew">
        <div className="wrap">
          <SectionHead eyebrow="Our people" heading="Real technicians, real certifications." lede="Every crew is CSIA-trained and background-checked. The photographs below are from Chimcare visits." />
          <div className="crew reveal">
            {p.crew.map((c) => (
              <div className="crew-card" key={c.title}>
                <img className="ph-photo" loading="lazy" decoding="async" width={600} height={400} src={c.src} alt={c.alt} title={c.alt} />
                <div className="info"><b>{c.title}</b><span>{c.small}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section final" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <div className="panel reveal">
            <div>
              <p className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>Chimcare</p>
              <h2 style={{ marginTop: 12 }}>Ready to find your Chimcare location?</h2>
              <p>For more information about the services we offer in each state, contact us today or visit our individual location pages to schedule your appointment.</p>
            </div>
            <div className="side">
              <a className="btn btn-primary" href="#states">Find My Location</a>
              <a className="btn btn-outline" href="#booking" data-book>Schedule Service</a>
              <a className="phone-big" href={p.phoneHref}><Icon name="phone" />{p.phone}</a>
            </div>
          </div>
        </div>
      </section>
      </main>
      {/* Siblings of <main>, as in the mocks — see CityPage. */}
      <BookingSheet options={p.booking} context={p.bookingContext} />
      <FloatingCta phone={p.phone} phoneHref={p.phoneHref} email="harold@chimcare.com" quoteHref="#booking" />
    </>
  );
}
