import type { CountryRef } from '@cartomancer/shared';
import { CountryRegister } from '@/components/CountryRegister';
import { readFilters } from '@/lib/filters';
import { apiFetch } from '@/lib/server-api';

/**
 * The country register: a reference list, not a game. No login — it shows the
 * same 195 rows to a guest and to a signed-in player, and asks the api for
 * nothing user-specific.
 *
 * Every country is fetched once here, regardless of the region chip, and the
 * filtering happens in the client component. 195 rows is small enough that
 * re-fetching per region would only add latency to something the browser can
 * already answer instantly.
 */
export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = readFilters(params);
  // ?q= pre-fills the search box, which is how the home screen's Country of
  // the day card opens a country here. Still editable — it seeds the input
  // rather than locking the list.
  const initialQuery = Array.isArray(params.q) ? (params.q[0] ?? '') : (params.q ?? '');
  const { countries } = await apiFetch<{ countries: CountryRef[]; total: number }>(
    '/api/countries?region=all',
  );

  return <CountryRegister countries={countries} filters={filters} initialQuery={initialQuery} />;
}
