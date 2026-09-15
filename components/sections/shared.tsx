import { Icon } from '@/components/chrome/Icon';
import { Accordion } from '@/components/islands/Accordion';
import type { Crumb, FaqItem, TrustItem } from '@/lib/content/assemble';

export function Breadcrumbs({ crumbs, style }: { crumbs: Crumb[]; style?: React.CSSProperties }) {
  return (
    <nav className="crumbs" style={style} aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.label} style={{ display: 'contents' }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/**
 * A section heading. `figure` is the optional illustration the newest city mock places beside the
 * heading (`.ph-img`); when no asset is supplied the head renders exactly as before, so the hub and
 * state templates are unaffected.
 */
export function SectionHead({
  eyebrow,
  heading,
  lede,
  left,
  figure,
  figureId,
}: {
  eyebrow: string;
  heading: string;
  lede?: string;
  left?: boolean;
  figure?: { src: string; alt: string; width: number; height: number } | null;
  figureId?: string;
}) {
  return (
    <div className={left ? 'sec-head left reveal' : 'sec-head reveal'}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{heading}</h2>
        {figure && lede && <p className="sec-head-lede">{lede}</p>}
      </div>
      {figure ? (
        <figure className="ph-img" id={figureId}>
          <img src={figure.src} width={figure.width} height={figure.height} loading="lazy" decoding="async" alt={figure.alt} title={figure.alt} />
        </figure>
      ) : (
        lede && <p>{lede}</p>
      )}
    </div>
  );
}

/** The three membership and award badges, each on its own white tile — the same files, alt text and
 *  sizes the location page hero renders from the reference, so the hubs and the leaf pages match. */
const AWARD_BADGES = [
  { src: '/reference/img-1660ae67.webp', alt: 'National Chimney Sweep Guild member', width: 113, height: 200 },
  { src: '/reference/img-858464cf.webp', alt: 'Angie’s List Super Service Award 2020', width: 177, height: 200 },
  { src: '/reference/img-164602b6.webp', alt: 'Angi Super Service Award 2021', width: 148, height: 200 },
];

export function HeroAwards() {
  return (
    <ul className="hero-awards">
      {AWARD_BADGES.map((a) => (
        <li key={a.src}>
          <img src={a.src} alt={a.alt} title={a.alt} width={a.width} height={a.height} loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  );
}

export function TrustStrip({ items, className = 'trust', awards = true }: { items: TrustItem[]; className?: string; awards?: boolean }) {
  return (
    <div className={className}>
      <div className="wrap">
        {items.map((t) => (
          <div className="t" key={t.title}>
            <Icon name={t.icon} />
            <div>
              <b>{t.title}</b>
              <small>{t.small}</small>
            </div>
          </div>
        ))}
        {awards && (
          <div className="t t-awards">
            <img src="/img/awards.png" width={1248} height={450} loading="lazy" decoding="async" alt="National Chimney Sweep Guild member, Angie’s List Super Service Award 2020 and Angi Super Service Award 2021" title="National Chimney Sweep Guild member, Angie’s List Super Service Award 2020 and Angi Super Service Award 2021" />
          </div>
        )}
      </div>
    </div>
  );
}

/** FAQ accordion — every item is in the HTML; the first opens by default like the mock. */
export function Faq({ items, maxWidth = 820 }: { items: FaqItem[]; maxWidth?: number }) {
  return (
    <Accordion mode="single" className="faq reveal" style={{ maxWidth }}>
      {items.map((f, i) => (
        <div className={i === 0 ? 'faq-item is-open' : 'faq-item'} key={f.question} data-acc-item>
          <button className="faq-q" type="button" aria-expanded={i === 0} data-acc-trigger>
            {f.question}
            <Icon name="plus" />
          </button>
          <div className="acc-panel">
            <div>
              <p className="faq-a">{f.answer}</p>
            </div>
          </div>
        </div>
      ))}
    </Accordion>
  );
}
