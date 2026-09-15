import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // WordPress URLs end with a slash; keep them byte-identical so no legacy URL ever 308s.
  trailingSlash: true,
  // Native / WASM database drivers must not be bundled into the server build.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  // The route store is a data file, not an import, so nothing in the module graph points at it and
  // the build would leave it out of the serverless bundle. That failure is silent: every page works
  // locally and 404s in production, because the lookup finds no store and falls through. Naming it
  // here is what puts it in the function's filesystem.
  outputFileTracingIncludes: {
    '/location/[slug]': ['./data/routes.sqlite'],
    // The footer (on every page) and the location hubs list the migrated routes and their map pins.
    '/*': ['./data/routes.sqlite', './data/migrated-geocode.json'],
  },
};

export default nextConfig;
