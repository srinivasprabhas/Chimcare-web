import 'leaflet/dist/leaflet.css';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StateHub } from '@/components/templates/StateHub';
import { assembleStateHub, genericHubState, hubStateFromRow } from '@/lib/content/assemble-hubs';
import { SEARCH_ENABLED } from '@/lib/content/search';
import { getMigratedState } from '@/lib/data/migrated-locations';
import { getPrices } from '@/lib/data/pricing';
import { getBranchesForState, getStateBySlug } from '@/lib/data/states';

export const dynamic = 'force-dynamic';

type Params = Promise<{ state: string }>;
type Search = Promise<{ q?: string }>;

/**
 * A state hub exists for every state with migrated URLs, and lists exactly those URLs. A state with a
 * reviewed `site.states` row (Minnesota) keeps its own editorial copy and regional prices; the others
 * get brand copy with their own name and cities filled in.
 */
async function load(slug: string) {
  const migrated = getMigratedState(slug);
  if (!migrated) return null;
  const row = await getStateBySlug(slug);
  if (row?.verified) {
    const branches = await getBranchesForState(row.id);
    const prices = await getPrices(branches.find((b) => b.regionId != null)?.regionId ?? null);
    return assembleStateHub({ state: hubStateFromRow(row, prices, migrated), migrated, prices, localPrices: !prices.isDefault });
  }
  const prices = await getPrices(null);
  return assembleStateHub({ state: genericHubState(migrated), migrated, prices, localPrices: false });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { state } = await params;
  const p = await load(state);
  if (!p) return { title: 'Not found' };
  return { title: p.meta.title, description: p.meta.description, alternates: { canonical: p.meta.canonical } };
}

export default async function StatePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { state } = await params;
  const { q } = await searchParams;
  const p = await load(state);
  if (!p) notFound();
  // `?q=` filters on the server too, so a shared link renders already filtered without JavaScript.
  // While search is switched off the query is ignored, so the page never renders pre-filtered.
  return <StateHub {...p} query={SEARCH_ENABLED ? q ?? '' : ''} stateSlug={state} />;
}
