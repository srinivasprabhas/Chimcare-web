import type { Metadata } from 'next';
// The live chimcare.com homepage, lifted verbatim by scripts/extract-home.mjs: its own markup and its own
// (scoped) stylesheet, plus hand-written corrections. Rerun the script to refresh; never edit the generated files.
// The WordPress stylesheet is linked from /public rather than imported — see the script for why.
import './_home/overrides.css';
import { HOME_BODY_CLASS, HOME_CSS_HREF, HOME_HTML, HOME_META, HOME_SCHEMA } from './_home/content';
import { BookingSheet } from '@/components/islands/BookingSheet';
import { HomeBehaviour } from '@/components/islands/HomeBehaviour';
import { HomeBookingSlot } from '@/components/islands/HomeBookingSlot';
import type { BookingContext } from '@/lib/booking/types';
import { SITE_URL, bookingOptions } from '@/lib/content/assemble';
import { getPrices } from '@/lib/data/pricing';

// Booking prices come from the database, like every other page in this slice.
export const dynamic = 'force-dynamic';

const canonical = `${SITE_URL}/`;

export const metadata: Metadata = {
  title: HOME_META.title,
  robots: HOME_META.robots ?? undefined,
  alternates: { canonical },
  openGraph: {
    type: 'website',
    url: canonical,
    locale: HOME_META.ogLocale ?? undefined,
    title: HOME_META.ogTitle ?? undefined,
    description: HOME_META.ogDescription ?? undefined,
    siteName: HOME_META.ogSiteName ?? undefined,
  },
  twitter: { card: 'summary_large_image' },
  // The saved page's own site icons (the app has no favicon of its own yet).
  icons: {
    icon: [
      { url: 'https://www.chimcare.com/wp-content/uploads/2025/12/cropped-chimcare-site-icon-32x32.png', sizes: '32x32' },
      { url: 'https://www.chimcare.com/wp-content/uploads/2025/12/cropped-chimcare-site-icon-192x192.png', sizes: '192x192' },
    ],
    apple: 'https://www.chimcare.com/wp-content/uploads/2025/12/cropped-chimcare-site-icon-180x180.png',
  },
};

export default async function Home() {
  const booking = bookingOptions(await getPrices(null));
  const bookingContext: BookingContext = { pageSlug: '/', pageKind: 'hub', label: 'Chimcare' };
  return (
    <>
      <link rel="stylesheet" href={HOME_CSS_HREF} precedence="default" />
      {HOME_SCHEMA && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_SCHEMA).replace(/</g, '\\u003c') }}
        />
      )}
      {/* The wrapper stands in for WordPress's <body>: it carries the saved body classes the stylesheet keys on. */}
      <div className={`wp-home ${HOME_BODY_CLASS}`}>
        <div id="page" className="hfeed site">
          <div id="content" className="site-content">
            <main id="main" className="site-main" dangerouslySetInnerHTML={{ __html: HOME_HTML }} />
          </div>
        </div>
      </div>
      <HomeBookingSlot options={booking} context={bookingContext} />
      <BookingSheet options={booking} context={bookingContext} />
      <HomeBehaviour />
    </>
  );
}
