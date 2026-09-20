'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DIFFICULTIES, REGIONS } from '@cartomancer/shared';
import { IconChevronDown } from './icons';
import type { Filters } from '@/lib/filters';

/**
 * Region and difficulty filters as the mockups' pill chips.
 *
 * The selection lives in the URL, so a server-rendered quiz-type card can carry
 * it straight into a session start and a reloaded or shared link keeps it. The
 * current values arrive as props (read server-side) and are mirrored in local
 * state so the chip updates instantly while the route change settles.
 *
 * A native <select> sits invisibly over each chip: mobile gets its own picker
 * for free and the chip stays a chip.
 */
export function FilterChips({
  filters,
  showDifficulty = true,
}: {
  filters: Filters;
  showDifficulty?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [local, setLocal] = useState<Filters>(filters);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const update = (key: keyof Filters, value: string): void => {
    const next = { ...local, [key]: value };
    setLocal(next);
    const params = new URLSearchParams();
    if (next.region !== 'all') params.set('region', next.region);
    if (next.difficulty !== 'all') params.set('difficulty', next.difficulty);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="filter-chips">
      <span className={`chip${local.region === 'all' ? '' : ' chip--active'}`}>
        {local.region === 'all' ? 'All regions' : local.region}
        <IconChevronDown size={14} stroke={1.75} />
        <select
          aria-label="Filter by region"
          value={local.region}
          onChange={(event) => update('region', event.target.value)}
        >
          <option value="all">All regions</option>
          {REGIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </span>

      {showDifficulty ? (
        <span className={`chip${local.difficulty === 'all' ? '' : ' chip--active'}`}>
          {local.difficulty === 'all' ? 'All levels' : local.difficulty}
          <IconChevronDown size={14} stroke={1.75} />
          <select
            aria-label="Filter by difficulty"
            value={local.difficulty}
            onChange={(event) => update('difficulty', event.target.value)}
          >
            <option value="all">All levels</option>
            {DIFFICULTIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </span>
      ) : null}
    </div>
  );
}
