import Link from 'next/link';
import { CardShell } from './Cards';
import { IconBuildingBank, IconBulb, IconFlag, IconMap, IconWorld } from './icons';

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
 * Title, description and chevron, and nothing about progress: the learned counts
 * live in the stats strip above (#33), and showing them on the cards as well said
 * everything twice (#94).
 *
 * A server component: four links and no state, so none of this needs to reach
 * the browser.
 */
export function HomeQuizCards() {
  return (
    <div className="stack">
      <Link className="card" href="/capitals">
        <CardShell
          icon={<IconBuildingBank size={19} stroke={1.75} />}
          title="Capitals"
          description="Match countries with their capital cities"
        />
      </Link>

      <Link className="card" href="/recall">
        <CardShell
          icon={<IconMap size={19} stroke={1.75} />}
          title="Countries"
          description="Recall every country in a region from memory"
        />
      </Link>

      <Link className="card" href="/flags">
        <CardShell
          icon={<IconFlag size={19} stroke={1.75} />}
          title="Flags"
          description="Learn the flag of every country"
        />
      </Link>

      <Link className="card" href="/map">
        <CardShell
          icon={<IconWorld size={19} stroke={1.75} />}
          title="Map"
          description="Find countries on a world map"
        />
      </Link>

      <Link className="card" href="/trivia">
        <CardShell
          icon={<IconBulb size={19} stroke={1.75} />}
          title="Fun facts"
          description="Guess the country from a clue"
        />
      </Link>
    </div>
  );
}
