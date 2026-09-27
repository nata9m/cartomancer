'use client';

import { COUNTRIES } from '@cartomancer/shared';
import { PlayPicker } from './PlayPicker';
import { ALL, type Filters } from '@/lib/filters';
import { useSessionStarter } from '@/lib/use-start';

/**
 * The Countries start screen: pick a region, then play. Until #28 this round
 * started straight from the home card, taking its region from a chip that sat
 * above three other games which did not use it.
 *
 * No difficulty chip: recall ignores difficulty by design and always has
 * (apps/api/src/routes/recall.ts). Offering one here would be the same empty
 * promise #15 took off the home screen.
 */
export function RecallModePicker({ filters }: { filters: Filters }) {
  const { startRecall, pendingKey, error } = useSessionStarter(filters);

  // Straight from the compiled-in list rather than a round trip: the round's
  // own counter gets totalInRegion from the api, and this is only telling the
  // player how big the ask is before they commit to it.
  const total = COUNTRIES.filter(
    (country) => filters.region === ALL || country.region === filters.region,
  ).length;

  return (
    <PlayPicker
      title="Countries"
      description="Name every country in the region from memory"
      filters={filters}
      note={`${total} countries`}
      pending={pendingKey !== null}
      error={error}
      onPlay={() => void startRecall()}
    />
  );
}
