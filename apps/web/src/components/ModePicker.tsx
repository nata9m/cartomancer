'use client';

import Link from 'next/link';
import { ActionCard } from './ActionCard';
import { FilterChips } from './FilterChips';
import { IconArrowLeft } from './icons';
import type { Filters } from '@/lib/filters';
import { pendingKeyFor, useSessionStarter } from '@/lib/use-start';

export interface ModeGroup {
  label: string;
  modes: { quizTypeKey: string; title: string; description: string; questionCount?: number }[];
}

/**
 * Shared mode-select screen (Capitals, Flags, Fun facts): back arrow + title,
 * the same filter chips as the home screen, then one labelled group per family
 * of modes. Tapping a card starts a session with that quiz type and the filters
 * currently selected.
 */
export function ModePicker({
  title,
  groups,
  filters,
  showDifficulty = true,
}: {
  title: string;
  groups: ModeGroup[];
  filters: Filters;
  showDifficulty?: boolean;
}) {
  const { startQuiz, pendingKey, error } = useSessionStarter(filters);

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">{title}</h1>
      </div>

      <FilterChips filters={filters} showDifficulty={showDifficulty} />

      {groups.map((group) => (
        <div className="stack" key={group.label}>
          <p className="group-label">{group.label}</p>
          {group.modes.map((mode) => (
            <ActionCard
              key={`${mode.quizTypeKey}-${mode.questionCount ?? 'default'}`}
              title={mode.title}
              description={mode.description}
              pending={pendingKey === pendingKeyFor(mode.quizTypeKey, mode.questionCount)}
              onClick={() => void startQuiz(mode.quizTypeKey, mode.questionCount)}
            />
          ))}
        </div>
      ))}

      {error ? <p className="error-note">{error}</p> : null}
    </main>
  );
}
