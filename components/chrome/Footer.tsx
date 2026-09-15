const SERVICES = [
  'Chimney Sweep & Cleaning',
  'Chimney & Fireplace Inspection',
  'Gas Fireplace Service & Repair',
  'Chimney Repair & Masonry',
  'Crown, Flashing & Tuckpointing',
  'Fireplace Installation',
  'Gas & Wood-Burning Inserts',
  'Gas Log Sets',
  'Chimney Caps & Dampers',
  'Animal-Safe Chimney Clearing',
];

export function Footer({ states }: { states: Array<{ name: string; href: string }> }) {
  return (
    <footer className="ftr">
      <div className="ftr-main">
        <div className="wrap">
          <div className="ftr-cols">
            <div className="ftr-brand">
              <span className="logo-chip">
                <img src="/img/logo.svg" alt="Chimcare" title="Chimcare" />
              </span>
              <p>America’s Fireplace &amp; Chimney Experts. Founded 1989 — working toward every rooftop and hearth in the country.</p>
            </div>
            <div className="ftr-col">
              <h4>Services</h4>
              <div className="ftr-links">
                {SERVICES.map((s) => (
                  <a key={s} href="#booking" data-book>
                    {s}
                  </a>
                ))}
              </div>
            </div>
            <div className="ftr-col">
              <h4>States served</h4>
              <div className="ftr-links two">
                {states.map((s) => (
                  <a key={s.href} href={s.href}>
                    {s.name}
                  </a>
                ))}
              </div>
              <p className="ftr-more">…and growing</p>
            </div>
            <div className="ftr-col">
              <h4>Contact</h4>
              <div className="ftr-contact">
                <a className="tel" href="tel:18003624840">1-800-362-4840</a>
                <a href="mailto:harold@chimcare.com">harold@chimcare.com</a>
                <span>Corporate office · 12236 SW Garden Place, Tigard, OR 97223</span>
                <span className="soc">
                  <a href="https://www.facebook.com/chimcare.chimneysweep/">Facebook</a>
                  <a href="https://www.youtube.com/user/Chimcare">YouTube</a>
                  <a href="https://www.linkedin.com/company/chimcare">LinkedIn</a>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ftr-legal">
        <div className="wrap">
          <span>© {new Date().getFullYear()} Chimcare · Since 1989 · OR CCB #195475 · WA License #CHIMC**882C</span>
          <span className="policies">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Cookie Policy</a>
            <a href="#">Accessibility</a>
            <a href="#">Do Not Sell or Share My Info</a>
            <a href="/sitemap.xml">Sitemap</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
