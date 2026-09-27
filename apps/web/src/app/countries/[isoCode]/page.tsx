import { notFound } from 'next/navigation';
import { COUNTRIES, COUNTRY_DETAILS, COUNTRY_FACTS } from '@cartomancer/shared';
import { CountryDetail } from '@/components/CountryDetail';

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
  const back = new URLSearchParams();
  for (const key of ['q', 'region'] as const) {
    const value = Array.isArray(params_[key]) ? params_[key][0] : params_[key];
    if (value) back.set(key, value);
  }
  const query = back.toString();

  const facts = COUNTRY_FACTS.filter((entry) => entry.countryName === country.name).map(
    (entry) => entry.fact,
  );

  return (
    <CountryDetail
      country={country}
      detail={detail}
      facts={facts}
      backHref={query ? `/countries?${query}` : '/countries'}
    />
  );
}
