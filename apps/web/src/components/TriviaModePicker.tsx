'use client';

import { DEFAULT_QUESTION_COUNT } from '@cartomancer/shared';
import { PlayPicker } from './PlayPicker';
import type { Filters, QuizMode } from '@/lib/filters';
import { useSessionStarter } from '@/lib/use-start';
import { addSeenFactIds, getSeenFactIds, resetSeenFacts } from '@/lib/seen-facts';

const MODE_COPY: Record<QuizMode, { quizTypeKey: string; description: string }> = {
  mc: {
    quizTypeKey: 'trivia-fact2c-mc',
    description: 'Read a clue, pick the country it describes',
  },
  type: {
    quizTypeKey: 'trivia-fact2c-type',
    description: 'Read a clue, type the country it describes',
  },
};

/**
 * Fun facts: filter chips (Region / Difficulty / Mode / Count) and a single
 * Play button, per #16. The screen itself is PlayPicker, shared with Countries;
 * what is left here is the part only trivia has — the guest clue rotation.
 *
 * Both ways of answering draw from the same clue pool, so the mode is a chip
 * rather than a second card (#42): it picks the quiz type key, and nothing else
 * about the round changes.
 */
export function TriviaModePicker({ filters }: { filters: Filters }) {
  const { startQuiz, pendingKey, error } = useSessionStarter(filters);

  const questionCount = Number(filters.questionCount) || DEFAULT_QUESTION_COUNT;
  const mode = MODE_COPY[filters.mode];

  async function handlePlay(): Promise<void> {
    const seenFactIds = getSeenFactIds(filters);
    const session = await startQuiz(mode.quizTypeKey, questionCount, seenFactIds);
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
      description={mode.description}
      filters={filters}
      showDifficulty
      showMode
      showQuestionCount
      pending={pendingKey !== null}
      error={error}
      onPlay={() => void handlePlay()}
    />
  );
}
