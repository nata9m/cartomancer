'use client';

import { DEFAULT_QUESTION_COUNT, type QuizSession } from '@cartomancer/shared';
import { ModePicker } from './ModePicker';
import type { Filters } from '@/lib/filters';
import { addSeenFactIds, getSeenFactIds, resetSeenFacts } from '@/lib/seen-facts';

/**
 * Fun facts: the shared mode screen (#49), plus the part only trivia has — the
 * guest clue rotation.
 *
 * Both cards draw from one pool of clues, so the rotation is deliberately not
 * per mode: a clue met in multiple choice does not come back as the next
 * type-in question (#42). The signed-in side already works that way, keying
 * fact_progress by user and fact rather than by quiz type.
 */
export function TriviaModePicker({ filters }: { filters: Filters }) {
  function handleStarted(session: QuizSession, requested: number | undefined): void {
    const asked = requested ?? DEFAULT_QUESTION_COUNT;
    const newIds = session.questions
      .map((question) => question.factId)
      .filter((id): id is number => id != null);

    if (session.questions.length < asked) {
      // The pool for this filter combo is exhausted; reset so the next round
      // starts a fresh cycle rather than replaying the tail.
      resetSeenFacts(filters);
    } else {
      addSeenFactIds(filters, newIds);
    }
  }

  return (
    <ModePicker
      title="Fun facts"
      filters={filters}
      showDifficulty
      showQuestionCount
      excludeIdsForStart={() => getSeenFactIds(filters)}
      onStarted={handleStarted}
      groups={[
        {
          label: 'Multiple choice',
          modes: [
            {
              quizTypeKey: 'trivia-fact2c-mc',
              title: 'Fact → country',
              description: 'Read a clue, pick the country it describes',
            },
          ],
        },
        {
          label: 'Type the answer',
          modes: [
            {
              quizTypeKey: 'trivia-fact2c-type',
              title: 'Fact → country',
              description: 'Read a clue, type the country it describes',
            },
          ],
        },
      ]}
    />
  );
}
