import Link from 'next/link';
import type { CountryDetail as CountryDetailData, CountrySeed } from '@cartomancer/shared';
import { Flag } from './Flag';
import { IconArrowLeft } from './icons';

/**
 * One country, at rest: the flag large enough to look at, its capital, how many
 * people live there, what they speak, and the country's own trivia clues (#38).
 *
 * Deliberately five things. The register is for looking a country up, not for
 * reading an encyclopedia entry, and every extra row is one more thing to scan
 * past on a phone. Area, currency, calling code and the rest are a line each in
 * the generator if they are ever wanted.
 *
 * A server component with nothing to fetch — every field is compiled in, from
 * countries.ts, facts.ts and the generated country-details.ts — so the page
 * cannot fail and costs a render.
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
    ['Capital', country.capital],
    ['Population', formatPopulation(detail.population, detail.populationYear)],
    [detail.languages.length > 1 ? 'Languages' : 'Language', detail.languages.join(', ')],
  ];

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href={backHref} aria-label="Back to all countries">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">{country.name}</h1>
      </div>

      {/* Big enough to study, and capped in both directions rather than sized,
          so Nepal's pennant and Switzerland's square keep their own shape
          instead of being fitted to a box — the lesson of #11 and #19, reached
          here with px caps, which are definite in every engine. */}
      <div className="detail-flag">
        <Flag isoCode={country.isoCode} label={country.name} variant="fill" />
      </div>

      <div className="fact-list">
        {rows.map(([label, value]) => (
          <div className="fact-row" key={label}>
            <span className="fact-label">{label}</span>
            <span className="fact-value">{value}</span>
          </div>
        ))}
      </div>

      {/* The clues never name their country, so on a page that does they read as
          notes rather than questions — which is why they can be shown here at
          all without giving a round away. */}
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

      {/* Both source licences ask for attribution. The capital, the flag and the
          clues are the app's own, so only the two generated fields are credited
          here. */}
      <p className="detail-credit">
        Population from the World Bank, languages from mledoze/countries.
      </p>
    </main>
  );
}

/** "212 million (2024)" reads better than nine digits, and the year matters. */
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
