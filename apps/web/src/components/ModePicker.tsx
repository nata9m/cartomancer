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
 *
 * Fun facts came back here in #49: it had a Play button and a "how to answer"
 * chip (#42), which made the one screen with two ways to play look unlike the
 * two others that have them. The mode is a place you tap, not a filter you set.
 */
export function ModePicker({
  title,
  groups,
  filters,
  showDifficulty = true,
  showQuestionCount = false,
  seenFactsForStart,
}: {
  title: string;
  groups: ModeGroup[];
  filters: Filters;
  showDifficulty?: boolean;
  /** Fun facts lets the round be sized (#16); the other screens take the default. */
  showQuestionCount?: boolean;
  /**
   * The guest's clue-rotation list, asked for at the moment of the tap so it
   * reads whatever the last answer stored. Only Fun facts has one: a signed-in
   * player's rotation is the api's job (fact_progress).
   */
  seenFactsForStart?: () => Record<string, number>;
}) {
  const { startQuiz, pendingKey, error } = useSessionStarter(filters);

  // The count chip feeds every card on the screen, so it is resolved here
  // rather than written into each mode. A mode that names its own count (the
  // flags sprint, say) still wins.
  const chosenCount = showQuestionCount ? Number(filters.questionCount) || undefined : undefined;

  async function start(mode: ModeGroup['modes'][number]): Promise<void> {
    const requested = mode.questionCount ?? chosenCount;
    await startQuiz(mode.quizTypeKey, requested, seenFactsForStart?.());
  }

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">{title}</h1>
      </div>

      <FilterChips
        filters={filters}
        showDifficulty={showDifficulty}
        showQuestionCount={showQuestionCount}
      />

      {groups.map((group) => (
        <div className="stack" key={group.label}>
          <p className="group-label">{group.label}</p>
          {group.modes.map((mode) => (
            <ActionCard
              key={`${mode.quizTypeKey}-${mode.questionCount ?? 'default'}`}
              title={mode.title}
              description={mode.description}
              pending={
                pendingKey === pendingKeyFor(mode.quizTypeKey, mode.questionCount ?? chosenCount)
              }
              onClick={() => void start(mode)}
            />
          ))}
        </div>
      ))}

      {error ? <p className="error-note">{error}</p> : null}
    </main>
  );
}
