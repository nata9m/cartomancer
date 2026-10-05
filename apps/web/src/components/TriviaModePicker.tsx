'use client';

import { ModePicker } from './ModePicker';
import type { ReviewByQuizType } from '@cartomancer/shared';
import type { Filters } from '@/lib/filters';
import { getSeenFacts } from '@/lib/seen-facts';

/**
 * Fun facts: the shared mode screen (#49), plus the part only trivia has — the
 * guest clue rotation.
 *
 * Both cards draw from one pool of clues, so the rotation is deliberately not
 * per mode: a clue met in multiple choice does not come back as the next
 * type-in question (#42). The signed-in side already works that way, keying
 * fact_progress by user and fact rather than by quiz type. The guest's list is
 * handed to the api, which does the ordering; recording a clue as met happens
 * when it is answered (QuizRunner), not here when a round starts (#70).
 */
export function TriviaModePicker({
  filters,
  review,
}: {
  filters: Filters;
  review: ReviewByQuizType;
}) {
  return (
    <ModePicker
      title="Fun facts"
      filters={filters}
      showDifficulty
      showQuestionCount
      seenFactsForStart={getSeenFacts}
      review={review}
      reviewNoun="clues"
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
