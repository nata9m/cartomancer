'use client';

import Link from 'next/link';
import { DEFAULT_QUESTION_COUNT } from '@cartomancer/shared';
import { FilterChips } from './FilterChips';
import { IconArrowLeft } from './icons';
import type { Filters } from '@/lib/filters';
import { useSessionStarter } from '@/lib/use-start';
import { addSeenFactIds, getSeenFactIds } from '@/lib/seen-facts';

/**
 * Trivia mode picker: filter chips (Region / Difficulty / Count) and a single
 * Play button. Replaces the old 10/20/30 card layout per issue #16.
 */
export function TriviaModePicker({ filters }: { filters: Filters }) {
  const { startQuiz, pendingKey, error } = useSessionStarter(filters);

  const questionCount = Number(filters.questionCount) || DEFAULT_QUESTION_COUNT;

  async function handlePlay(): Promise<void> {
    const seenFactIds = getSeenFactIds(filters);
    const session = await startQuiz('trivia-fact2c-type', questionCount, seenFactIds);
    if (session) {
      const newIds = session.questions
        .map((q) => q.factId)
        .filter((id): id is number => id != null);
      addSeenFactIds(filters, newIds);
    }
  }

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">Fun facts</h1>
      </div>

      <FilterChips filters={filters} showDifficulty showQuestionCount />

      <div className="stack">
        <button
          type="button"
          className="card card--primary"
          disabled={pendingKey !== null}
          aria-busy={pendingKey !== null}
          onClick={() => void handlePlay()}
        >
          <div className="card-body">
            <span className="card-title">{pendingKey ? 'Starting…' : 'Play'}</span>
            <span className="card-description">
              Read a clue, type the country it describes
            </span>
          </div>
        </button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
    </main>
  );
}
