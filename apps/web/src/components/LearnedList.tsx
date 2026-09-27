import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  learnedThresholdForCategory,
  type CountryProgress,
  type CountryRef,
} from '@cartomancer/shared';
import { CountryRow } from './CountryRow';
import { FilterChips } from './FilterChips';
import { IconArrowLeft } from './icons';
import { ALL, type Filters } from '@/lib/filters';
import { LEARNED_COPY, type LearnedCategory } from '@/lib/learned';

/**
 * What is behind one home-screen stat: the countries you know in that category
 * and the ones you don't, with the rule that decides which is which stated at
 * the top. Tapped from StatsStrip, which is the only thing that says "42/195"
 * without saying which 42.
 *
 * A server component, like the home screen it is reached from: the region chip
 * puts its choice in the URL and this re-renders, so there is no state to keep
 * and no reason to ship 195 rows of data to the browser as well as the HTML
 * built from them. The register is the other case — its search box has to keep
 * up with the keyboard, so it filters client-side.
 */
export function LearnedList({
  category,
  countries,
  progress,
  filters,
}: {
  category: LearnedCategory;
  /** Every country, unfiltered: the region chip is applied here. */
  countries: CountryRef[];
  /** Only the countries with a progress row — see CategoryProgress. */
  progress: CountryProgress[];
  filters: Filters;
}) {
  const copy = LEARNED_COPY[category];
  const threshold = learnedThresholdForCategory(category);
  const stateById = new Map(progress.map((row) => [row.countryId, row]));

  // Re-sorted here rather than trusting the api's ORDER BY name, for the reason
  // the register spells out: Postgres collates by the database's locale, which
  // puts Côte d'Ivoire after Czechia on this cluster.
  const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name));

  // The heading counts every region, always, because it is the number the home
  // strip shows and the acceptance criterion for this screen is that the two
  // agree. The sections below follow the chip instead.
  const learnedEverywhere = sorted.filter((country) => stateById.get(country.id)?.learned).length;

  const inRegion = sorted.filter(
    (country) => filters.region === ALL || country.region === filters.region,
  );
  const learned = inRegion.filter((country) => stateById.get(country.id)?.learned);
  const notYet = inRegion.filter((country) => !stateById.get(country.id)?.learned);

  const detail = (country: CountryRef): ReactNode =>
    copy.detail === 'capital' ? <span className="missed-answer">{country.capital}</span> : null;

  /**
   * How close an unlearned country is, shown only where it can move: recall's
   * threshold is one recall, so a country there is either learned or on zero and
   * "0/1" would be noise.
   */
  const streak = (country: CountryRef): ReactNode => {
    const best = stateById.get(country.id)?.bestStreak ?? 0;
    if (threshold <= 1 || best <= 0) {
      return null;
    }
    return (
      <span className="learned-streak" title={`${best} of ${threshold} correct in a row`}>
        {best}/{threshold}
      </span>
    );
  };

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">
          {copy.label} · {learnedEverywhere}/{countries.length}
        </h1>
      </div>

      <p className="learned-explainer">{copy.explanation}</p>

      <FilterChips filters={filters} showDifficulty={false} />

      <div className="stack stack--tight">
        <span className="section-label">Learned ({learned.length})</span>
        {learned.length === 0 ? (
          <p className="learned-empty">
            Nothing here yet — play a round and the countries you get right will appear.
          </p>
        ) : (
          <div className="missed-list">
            {learned.map((country) => (
              <CountryRow isoCode={country.isoCode} name={country.name} key={country.id}>
                {detail(country)}
              </CountryRow>
            ))}
          </div>
        )}
      </div>

      <div className="stack stack--tight">
        <span className="section-label">Not learned yet ({notYet.length})</span>
        {notYet.length === 0 ? (
          <p className="learned-empty">Nothing left — every country here is learned.</p>
        ) : (
          <div className="missed-list">
            {notYet.map((country) => (
              <CountryRow isoCode={country.isoCode} name={country.name} key={country.id}>
                {streak(country)}
                {detail(country)}
              </CountryRow>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
