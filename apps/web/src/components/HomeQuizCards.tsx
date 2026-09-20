'use client';

import Link from 'next/link';
import { ActionCard } from './ActionCard';
import { CardShell } from './Cards';
import { IconBuildingBank, IconBulb, IconFlag, IconMap } from './icons';
import { filtersToQuery, type Filters } from '@/lib/filters';
import { pendingKeyFor, useSessionStarter } from '@/lib/use-start';

/**
 * The four home-screen category cards.
 *
 * Judgement call the brief left open: Capitals and Flags each get a mode picker
 * (both have multiple-choice and type-in variants across two directions, which
 * is too much to guess on the user's behalf), Fun facts gets one because its
 * length is configurable (10/20/30), and Countries — which only takes a region,
 * and takes it from the chip already on this screen — starts a round straight
 * away.
 */
export function HomeQuizCards({ filters }: { filters: Filters }) {
  const { startRecall, pendingKey, error } = useSessionStarter(filters);
  const query = filtersToQuery(filters);
  const withFilters = (href: string): string => (query ? `${href}?${query}` : href);

  return (
    <div className="stack">
      <Link className="card" href={withFilters('/capitals')}>
        <CardShell
          icon={<IconBuildingBank size={19} stroke={1.75} />}
          title="Capitals"
          description="Match countries with their capital cities"
        />
      </Link>

      <ActionCard
        icon={<IconMap size={19} stroke={1.75} />}
        title="Countries"
        description="Recall every country in a region from memory"
        onClick={() => void startRecall()}
        pending={pendingKey === pendingKeyFor('countries-recall')}
      />

      <Link className="card" href={withFilters('/flags')}>
        <CardShell
          icon={<IconFlag size={19} stroke={1.75} />}
          title="Flags"
          description="Learn the flag of every country"
        />
      </Link>

      <Link className="card" href={withFilters('/trivia')}>
        <CardShell
          icon={<IconBulb size={19} stroke={1.75} />}
          title="Fun facts"
          description="Guess the country from a clue"
        />
      </Link>

      {error ? <p className="error-note">{error}</p> : null}
    </div>
  );
}
