'use client';

import { DEFAULT_QUESTION_COUNT } from '@cartomancer/shared';
import { PlayPicker } from './PlayPicker';
import type { Filters } from '@/lib/filters';
import { useSessionStarter } from '@/lib/use-start';
import { addSeenFactIds, getSeenFactIds, resetSeenFacts } from '@/lib/seen-facts';

/**
 * Fun facts: filter chips (Region / Difficulty / Count) and a single Play
 * button, per #16. The screen itself is PlayPicker, shared with Countries;
 * what is left here is the part only trivia has — the guest clue rotation.
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

      if (session.questions.length < questionCount) {
        // The pool for this filter combo is exhausted; reset so the next
        // round starts a fresh cycle rather than replaying the tail.
        resetSeenFacts(filters);
      } else {
        addSeenFactIds(filters, newIds);
      }
    }
  }

  return (
    <PlayPicker
      title="Fun facts"
      description="Read a clue, type the country it describes"
      filters={filters}
      showDifficulty
      showQuestionCount
      pending={pendingKey !== null}
      error={error}
      onPlay={() => void handlePlay()}
    />
  );
}
