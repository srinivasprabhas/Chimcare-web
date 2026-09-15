import type { MetadataRoute } from 'next';

// Crawling is switched off for this deployment: every bot is asked to stay out of the whole site.
// Delete this file (or change `disallow` to `allow`) when the site should be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
