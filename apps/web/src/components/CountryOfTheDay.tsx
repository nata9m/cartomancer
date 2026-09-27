import Link from 'next/link';
import { Flag } from './Flag';
import { countryOfTheDay } from '@/lib/country-of-the-day';

/**
 * The home screen's one piece of reading matter: today's country, its flag and
 * its capital, the same for everyone until midnight UTC.
 *
 * A server component with no data fetching — COUNTRIES and COUNTRY_FACTS are
 * compiled in, so the card costs nothing to render and cannot fail. It renders
 * nothing at all rather than throwing if the pick somehow comes back empty; a
 * decorative card is not worth a broken home screen.
 *
 * Tapping it opens the register filtered to that country, which is the natural
 * next question ("where is it, what else is near it").
 */
export function CountryOfTheDay() {
  const pick = countryOfTheDay();
  if (!pick) return null;

  const { country, fact } = pick;

  return (
    <Link
      className="card cotd"
      href={`/countries?q=${encodeURIComponent(country.name)}`}
      aria-label={`Country of the day: ${country.name}, capital ${country.capital}. Open it in the country register.`}
    >
      {/* Sized in explicit pixels with object-fit: contain, so a 1:2 or square
          flag letterboxes inside the box instead of cropping or spilling — the
          failure #19 was about, reached here by a route that cannot repeat it,
          since neither dimension is a percentage of anything. */}
      <span className="cotd-flag">
        <Flag isoCode={country.isoCode} label={country.name} variant="inline" />
      </span>

      <span className="card-body">
        <span className="cotd-label">Country of the day</span>
        <span className="card-title">{country.name}</span>
        <span className="card-description">
          {country.capital} · {country.region}
        </span>
        {fact ? <span className="cotd-fact">{fact}</span> : null}
      </span>
    </Link>
  );
}
