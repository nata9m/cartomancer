import Link from 'next/link';
import type { ProgressSummary } from '@cartomancer/shared';
import { CardShell } from './Cards';
import { IconBuildingBank, IconBulb, IconFlag, IconMap, IconSparkles } from './icons';

/**
 * The four home-screen category cards.
 *
 * Every one of them now opens a start screen rather than doing anything itself:
 * Capitals and Flags to choose a mode, Fun facts and Countries to choose their
 * filters and press Play. Countries was the exception until #28 — it started a
 * round straight from here, using a region chip that sat above three other
 * games that ignored it.
 *
 * No filters travel with these links. Each screen opens on "All regions" and
 * owns its own chips, so nothing off this screen can narrow a round invisibly.
 *
 * Styled as tarot-like cards (#57): each mode is a card, and a signed-in player's
 * learned count is the card's number, so the home screen doubles as the progress
 * display. A guest has no count to show, so their cards carry none rather than a
 * zero that would read as a record. Fun facts has no learned count of its own and
 * wears a star.
 *
 * A server component: four links and no state, so none of this needs to reach
 * the browser.
 */
export function HomeQuizCards({ summary }: { summary?: ProgressSummary | null }) {
  const number = (learned: number | undefined) =>
    summary && learned !== undefined ? (
      <span className="card-number" aria-label={`${learned} of ${summary.totalCountries} learned`}>
        {learned}
        <small aria-hidden="true">/{summary.totalCountries}</small>
      </span>
    ) : undefined;

  return (
    <div className="stack">
      <Link className="card card--tarot" href="/capitals">
        <CardShell
          icon={<IconBuildingBank size={19} stroke={1.75} />}
          title="Capitals"
          description="Match countries with their capital cities"
          trailing={number(summary?.learned.capitals)}
        />
      </Link>

      <Link className="card card--tarot" href="/recall">
        <CardShell
          icon={<IconMap size={19} stroke={1.75} />}
          title="Countries"
          description="Recall every country in a region from memory"
          trailing={number(summary?.learned.countries)}
        />
      </Link>

      <Link className="card card--tarot" href="/flags">
        <CardShell
          icon={<IconFlag size={19} stroke={1.75} />}
          title="Flags"
          description="Learn the flag of every country"
          trailing={number(summary?.learned.flags)}
        />
      </Link>

      <Link className="card card--tarot" href="/trivia">
        <CardShell
          icon={<IconBulb size={19} stroke={1.75} />}
          title="Fun facts"
          description="Guess the country from a clue"
          trailing={<IconSparkles size={18} stroke={1.6} aria-hidden="true" />}
        />
      </Link>
    </div>
  );
}
