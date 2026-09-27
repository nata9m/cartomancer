'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { normalizeAnswer, type CountryRef } from '@cartomancer/shared';
import { CountryRow } from './CountryRow';
import { FilterChips } from './FilterChips';
import { IconArrowLeft } from './icons';
import { ALL, type Filters } from '@/lib/filters';

/**
 * The lookup list: every country with its flag and capital, A–Z.
 *
 * All 195 rows arrive from the server once and every filter runs here, over an
 * array of 195 — there is no round trip behind the search box, and typing stays
 * at the speed of the keyboard.
 */
export function CountryRegister({
  countries,
  filters,
  initialQuery = '',
}: {
  countries: CountryRef[];
  filters: Filters;
  /** Seeds the search box, from ?q= — see the note in the page component. */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  /**
   * Each row's haystack, built once: name, capital and aliases, all normalised.
   *
   * normalizeAnswer is the api's own answer matcher, so the box forgives what
   * the quiz forgives — accents ("Yaounde" finds Yaoundé), punctuation, "St"
   * for "Saint". Aliases are in here because both kinds earn their place in a
   * lookup: "Holland" and "Cape Town" are each things someone might type. They
   * are searched, never shown — see the note on CountryRef.
   */
  const rows = useMemo(
    () =>
      [...countries]
        // Re-sorted here rather than trusting the api's ORDER BY: Postgres
        // collates by the database's locale, and on this cluster that puts
        // Côte d'Ivoire after Czechia, because ô sorts past z. Fine for the
        // quiz, which never shows the list in order; wrong for an A-Z register,
        // where it lands at the end of the C section. localeCompare also makes
        // the page independent of whatever collation a given database was
        // created with.
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((country) => ({
          country,
          haystack: normalizeAnswer(
            [country.name, country.capital, ...country.aliases].join(' '),
          ),
        })),
    [countries],
  );

  // The search box and the region chip ride along to the detail page, so its
  // back arrow can return to this list as it was left. The box is local state,
  // not the URL, which is why the link is built here rather than read off it.
  const detailHref = (isoCode: string): string => {
    const params = new URLSearchParams();
    if (query.trim() !== '') params.set('q', query.trim());
    if (filters.region !== ALL) params.set('region', filters.region);
    const suffix = params.toString();
    return `/countries/${isoCode.toLowerCase()}${suffix ? `?${suffix}` : ''}`;
  };

  const needle = normalizeAnswer(query);
  const matches = useMemo(
    () =>
      rows
        .filter(({ country }) => filters.region === ALL || country.region === filters.region)
        .filter(({ haystack }) => needle === '' || haystack.includes(needle))
        .map(({ country }) => country),
    [rows, filters.region, needle],
  );

  // A–Z headers, computed from what survived the filters so a letter never
  // appears above an empty run.
  const sections = useMemo(() => {
    const groups: { letter: string; countries: CountryRef[] }[] = [];
    for (const country of matches) {
      const letter = country.name.charAt(0).toUpperCase();
      const last = groups[groups.length - 1];
      if (last && last.letter === letter) {
        last.countries.push(country);
      } else {
        groups.push({ letter, countries: [country] });
      }
    }
    return groups;
  }, [matches]);

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">All countries</h1>
      </div>

      <input
        className="register-search"
        // Not type="search": the 16px floor that stops iOS zooming the page on
        // focus is keyed to the input types listed in globals.css, and a search
        // input also arrives with its own platform styling to undo.
        type="text"
        inputMode="search"
        value={query}
        placeholder="Search country or capital"
        aria-label="Search country or capital"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
      />

      <FilterChips filters={filters} showDifficulty={false} />

      <span className="section-label">
        {matches.length === countries.length
          ? `${countries.length} countries`
          : `${matches.length} of ${countries.length}`}
      </span>

      {matches.length === 0 ? (
        <p className="loading-note">Nothing matches “{query.trim()}”.</p>
      ) : (
        sections.map((section) => (
          <div className="stack stack--tight" key={section.letter}>
            <span className="register-letter">{section.letter}</span>
            <div className="missed-list">
              {section.countries.map((country) => (
                <CountryRow
                  isoCode={country.isoCode}
                  name={country.name}
                  href={detailHref(country.isoCode)}
                  key={country.id}
                >
                  <span className="missed-answer">{country.capital}</span>
                </CountryRow>
              ))}
            </div>
          </div>
        ))
      )}
    </main>
  );
}
