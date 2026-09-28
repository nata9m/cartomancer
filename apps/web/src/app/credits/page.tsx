import Link from 'next/link';
import { IconArrowLeft } from '@/components/icons';

/**
 * Where the borrowed data comes from, and under what licence (#47).
 *
 * The country pages used to carry their own credit line, which read as
 * developer notes under all 195 of them. The licences still have to be
 * honoured — CC BY 4.0 and ODbL both ask to be named where the data is shown —
 * so the attribution moved here, one page, linked from the home footer.
 *
 * Nothing to fetch and nothing per-user, so this is a plain static page.
 */
export const metadata = {
  title: 'Sources · Cartomancer',
};

interface Source {
  what: string;
  name: string;
  href: string;
  note: string;
}

const SOURCES: Source[] = [
  {
    what: 'Population',
    name: 'datasets/population',
    href: 'https://github.com/datasets/population',
    note: 'World Bank figures, each with its year · CC BY 4.0',
  },
  {
    what: 'Languages',
    name: 'mledoze/countries',
    href: 'https://github.com/mledoze/countries',
    note: 'Open Database License (ODbL) v1.0',
  },
  {
    what: 'Flag artwork',
    name: 'hjnilsson/country-flags',
    href: 'https://github.com/hjnilsson/country-flags',
    note: 'Wikimedia Commons renderings, public domain',
  },
];

export default function CreditsPage() {
  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">Sources</h1>
      </div>

      <p className="screen-note">
        The capitals, the clues and the difficulty tiers are Cartomancer&apos;s own. Everything
        else a country&apos;s page shows comes from one of these.
      </p>

      {/* The same stacked-row list the country pages use for their clues: a
          bordered card of short prose blocks is already this app's shape for
          exactly this, and a credits page does not deserve its own CSS. */}
      <div className="missed-list">
        {SOURCES.map((source) => (
          <div className="missed-row missed-row--stacked" key={source.name}>
            <span className="missed-clue">
              {source.what} —{' '}
              {/* A new tab, like the footer's commit link: tapping a credit
                  should not take someone out of the app, and the label says so
                  out loud because an unannounced new tab is disorienting with a
                  screen reader. */}
              <a
                className="credit-link"
                href={source.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${source.name} on GitHub — opens in a new tab`}
              >
                {source.name}
              </a>
            </span>
            <span className="missed-answer-line">{source.note}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
