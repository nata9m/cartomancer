import { notFound } from 'next/navigation';
import { COUNTRIES, COUNTRY_DETAILS, COUNTRY_FACTS } from '@cartomancer/shared';
import { CountryDetail } from '@/components/CountryDetail';

/**
 * Where the back arrow goes when the link said where it came from (#48).
 *
 * A closed list, not a URL on the query string: `?from=` is whatever anyone
 * types, and an arrow that follows it would happily walk someone off to a
 * stranger's site. Anything unrecognised falls through to the register, which
 * is where a directly-opened or shared link lands.
 */
const ENTRY_POINTS: Record<string, { href: string; label: string }> = {
  home: { href: '/', label: 'Back to home' },
};

/**
 * /countries/br — one country's page, reached from the register or from the
 * Country of the day card.
 *
 * Every field is compiled in, so unlike the register this asks the api for
 * nothing and could be static. It is left dynamic only because the back link
 * reads the query string; there is no per-user data here at all.
 */
export default async function CountryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ isoCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { isoCode } = await params;
  const country = COUNTRIES.find(
    (candidate) => candidate.isoCode.toLowerCase() === isoCode.toLowerCase(),
  );
  const detail = country ? COUNTRY_DETAILS[country.isoCode] : undefined;
  if (!country || !detail) {
    notFound();
  }

  // The register's search box and region chip travel on the link and come back
  // on the back arrow, so returning from a country lands on the list as it was
  // left rather than at the top of all 195.
  const params_ = await searchParams;
  const first = (key: string): string | undefined =>
    Array.isArray(params_[key]) ? params_[key][0] : params_[key];
  const back = new URLSearchParams();
  for (const key of ['q', 'region'] as const) {
    const value = first(key);
    if (value) back.set(key, value);
  }
  const query = back.toString();

  // An explicit href rather than router.back(), so the arrow still works on a
  // shared link or a fresh tab, where there is no history to go back to.
  // hasOwn, not a bare lookup: `?from=constructor` otherwise reads a function
  // off Object.prototype. It falls through to the register either way, but by
  // accident rather than because this said so.
  const from = first('from') ?? '';
  const entryPoint = Object.hasOwn(ENTRY_POINTS, from) ? ENTRY_POINTS[from] : undefined;

  const facts = COUNTRY_FACTS.filter((entry) => entry.countryName === country.name).map(
    (entry) => entry.fact,
  );

  return (
    <CountryDetail
      country={country}
      detail={detail}
      facts={facts}
      backHref={entryPoint?.href ?? (query ? `/countries?${query}` : '/countries')}
      backLabel={entryPoint?.label ?? 'Back to all countries'}
    />
  );
}
