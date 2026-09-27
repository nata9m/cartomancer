import Link from 'next/link';
import type { CountryDetail as CountryDetailData, CountrySeed } from '@cartomancer/shared';
import { Flag } from './Flag';
import { IconArrowLeft } from './icons';

/**
 * One country, at rest: the flag large enough to look at, a short description,
 * and the facts a register entry cannot fit on its row (#38).
 *
 * A server component with nothing to fetch — every field is compiled in, from
 * countries.ts and the generated country-details.ts — so the page cannot fail
 * and costs a render.
 */
export function CountryDetail({
  country,
  detail,
  facts,
  backHref,
}: {
  country: CountrySeed;
  detail: CountryDetailData;
  facts: string[];
  /** Back to the register as it was left — see the note in the page. */
  backHref: string;
}) {
  const rows: [string, string][] = [
    [detail.capitals.length > 1 ? 'Capitals' : 'Capital', detail.capitals.join(' · ')],
    ['Region', detail.subregion ? `${country.region} · ${detail.subregion}` : country.region],
    ['Population', formatPopulation(detail.population, detail.populationYear)],
    ['Area', `${formatNumber(detail.areaKm2)} km²`],
    [
      detail.currencies.length > 1 ? 'Currencies' : 'Currency',
      detail.currencies.map((currency) => `${currency.name} (${currency.code})`).join(', '),
    ],
    [detail.languages.length > 1 ? 'Languages' : 'Language', detail.languages.join(', ')],
    ['Calling code', detail.callingCode],
    ['ISO code · domain', `${country.isoCode} · ${detail.tld}`],
  ];

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href={backHref} aria-label="Back to all countries">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">{country.name}</h1>
      </div>

      {/* Big enough to study, and capped so the tall ones (Nepal's pennant,
          Switzerland's square) stay their own shape rather than being fitted to
          a box — the lesson of #11 and #19, reached here with px caps, which are
          definite in every engine. */}
      <div className="detail-flag">
        <Flag isoCode={country.isoCode} label={country.name} variant="fill" />
      </div>

      {detail.description ? <p className="detail-description">{detail.description}</p> : null}

      <div className="fact-list">
        {rows.map(([label, value]) => (
          <div className="fact-row" key={label}>
            <span className="fact-label">{label}</span>
            <span className="fact-value">{value}</span>
          </div>
        ))}
      </div>

      {facts.length > 0 ? (
        <div className="stack stack--tight">
          <span className="section-label">Did you know</span>
          <div className="missed-list">
            {facts.map((fact) => (
              <div className="missed-row missed-row--stacked" key={fact}>
                <span className="missed-clue">{fact}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* CC BY-SA 4.0 requires the attribution and a link to the article the
          description came from; the other two datasets are credited in the
          README and in the generator that reads them. */}
      {detail.description && detail.wikipediaUrl ? (
        <p className="detail-credit">
          Description from{' '}
          <a
            className="link-underline"
            href={detail.wikipediaUrl}
            target="_blank"
            rel="noreferrer"
          >
            Wikipedia
          </a>
          , CC BY-SA 4.0.
        </p>
      ) : null}
    </main>
  );
}

/** "216 million (2024)" reads better than nine digits, and the year matters. */
function formatPopulation(population: number, year: number | null): string {
  const rounded =
    population >= 1_000_000
      ? `${(population / 1_000_000).toFixed(population >= 10_000_000 ? 0 : 1)} million`
      : formatNumber(population);
  return year === null ? rounded : `${rounded} (${year})`;
}

function formatNumber(value: number): string {
  // Not toLocaleString: the server and the browser can disagree on the locale,
  // and a hydration mismatch over a thousands separator is not worth it.
  const [whole, fraction] = String(value).split('.');
  const grouped = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}
