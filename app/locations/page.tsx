import type { Metadata } from 'next';
import { NationalHub } from '@/components/templates/NationalHub';
import { assembleNationalHub } from '@/lib/content/assemble-hubs';
import { getMigratedStates } from '@/lib/data/migrated-locations';
import { getPrices } from '@/lib/data/pricing';

// Test slice: always read the database. Production: static + ISR, revalidated by the `states`/`branches` tags (architecture §10).
export const dynamic = 'force-dynamic';

/** Every state the migration carried URLs for, from the route store — not the Minnesota-only seed. */
async function load() {
  const prices = await getPrices(null);
  return assembleNationalHub({ states: getMigratedStates(), prices });
}

export async function generateMetadata(): Promise<Metadata> {
  const p = await load();
  return { title: p.meta.title, description: p.meta.description, alternates: { canonical: p.meta.canonical } };
}

export default async function LocationsPage() {
  const p = await load();
  return <NationalHub {...p} />;
}
