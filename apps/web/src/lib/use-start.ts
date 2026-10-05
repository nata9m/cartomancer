'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEFAULT_QUESTION_COUNT, type QuizSession } from '@cartomancer/shared';
import { startQuizSession, startRecallSession } from './client-api';
import type { Filters } from './filters';
import { preloadQuestionFlags } from './flag-art';
import { saveGuestQuiz, saveGuestRecall } from './guest-store';
import { getSeenCountries } from './seen-countries';
import { setRoundNote } from './round-note';

/** The guest's country rotation for a quiz type, when there is one to send (#96). */
export function countryRotation(quizTypeKey: string): { seenCountries?: Record<string, number> } {
  const seenCountries = getSeenCountries(quizTypeKey);
  return Object.keys(seenCountries).length > 0 ? { seenCountries } : {};
}

/** The pending key of a quiz type's review card, apart from its normal start card. */
export const reviewKeyFor = (quizTypeKey: string): string => `${quizTypeKey}:review`;

export const pendingKeyFor = (quizTypeKey: string, questionCount?: number): string =>
  `${quizTypeKey}:${questionCount ?? 'default'}`;

/**
 * Starts sessions from the home screen and the mode pickers.
 *
 * Filters arrive as props from the server component that read them off the URL,
 * rather than through useSearchParams, so the subtree is not opted out of server
 * rendering.
 *
 * Returns the created session.
 */
export function useSessionStarter(filters: Filters) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startQuiz(
    quizTypeKey: string,
    questionCount?: number,
    seenFacts?: Record<string, number>,
  ): Promise<QuizSession | null> {
    setPendingKey(pendingKeyFor(quizTypeKey, questionCount));
    setError(null);
    try {
      const session = await startQuizSession({
        quizTypeKey,
        region: filters.region,
        difficulty: filters.difficulty,
        ...(questionCount === undefined ? {} : { questionCount }),
        ...(seenFacts && Object.keys(seenFacts).length > 0 ? { seenFacts } : {}),
        // Sent whoever is playing: the api ignores it for a signed-in player,
        // whose rotation is on the server, and it is cheaper than asking here.
        ...countryRotation(quizTypeKey),
      });
      if (session.isGuest) {
        saveGuestQuiz({ session, answers: [] });
      }
      preloadQuestionFlags(session.questions[0]);
      // A round is never padded with repeats (#70), so one that the filters
      // cannot fill comes back short, and the player is told why on its first
      // question rather than left to count.
      if (session.quizType.category === 'trivia') {
        const asked = questionCount ?? DEFAULT_QUESTION_COUNT;
        if (session.questions.length < asked) {
          const n = session.questions.length;
          setRoundNote(
            session.id,
            n === 1
              ? 'Only 1 country has a clue matching these filters.'
              : `Only ${n} countries have a clue matching these filters.`,
          );
        }
      }
      router.push(`/quiz/${session.id}`);
      return session;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that quiz');
      setPendingKey(null);
      return null;
    }
  }

  /**
   * A round over exactly the countries (or, for Fun facts, the clues) that need
   * review in this quiz type (#51, #108). The filters play no part, so the same
   * `Filters` every other starter takes is not read.
   */
  async function startReview(
    quizTypeKey: string,
    entry: { countryIds: number[]; factIds?: Record<string, number> },
  ): Promise<void> {
    setPendingKey(reviewKeyFor(quizTypeKey));
    setError(null);
    try {
      // Fun facts re-asks the clue that was missed, not another for the country.
      const clues = entry.factIds ? Object.values(entry.factIds) : [];
      const session = await startQuizSession(
        clues.length > 0
          ? { quizTypeKey, factIds: clues }
          : { quizTypeKey, countryIds: entry.countryIds },
      );
      if (session.isGuest) {
        saveGuestQuiz({ session, answers: [] });
      }
      preloadQuestionFlags(session.questions[0]);
      router.push(`/quiz/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that round');
      setPendingKey(null);
    }
  }

  async function startRecall(regionOverride?: string): Promise<void> {
    setPendingKey(pendingKeyFor('countries-recall'));
    setError(null);
    try {
      const session = await startRecallSession(regionOverride ?? filters.region);
      if (session.isGuest) {
        saveGuestRecall({ session, recalled: [] });
      }
      router.push(`/recall/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that round');
      setPendingKey(null);
    }
  }

  return { startQuiz, startReview, startRecall, pendingKey, error };
}
