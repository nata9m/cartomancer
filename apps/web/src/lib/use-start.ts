'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { QuizSession } from '@cartomancer/shared';
import { startQuizSession, startRecallSession } from './client-api';
import type { Filters } from './filters';
import { preloadQuestionFlags } from './flag-art';
import { saveGuestQuiz, saveGuestRecall } from './guest-store';

export const pendingKeyFor = (quizTypeKey: string, questionCount?: number): string =>
  `${quizTypeKey}:${questionCount ?? 'default'}`;

/**
 * Starts sessions from the home screen and the mode pickers.
 *
 * Filters arrive as props from the server component that read them off the URL,
 * rather than through useSearchParams, so the subtree is not opted out of server
 * rendering.
 *
 * Returns the created session so trivia callers can extract fact IDs for guest
 * rotation tracking.
 */
export function useSessionStarter(filters: Filters) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startQuiz(
    quizTypeKey: string,
    questionCount?: number,
    excludeFactIds?: number[],
  ): Promise<QuizSession | null> {
    setPendingKey(pendingKeyFor(quizTypeKey, questionCount));
    setError(null);
    try {
      const session = await startQuizSession({
        quizTypeKey,
        region: filters.region,
        difficulty: filters.difficulty,
        ...(questionCount === undefined ? {} : { questionCount }),
        ...(excludeFactIds?.length ? { excludeFactIds } : {}),
      });
      if (session.isGuest) {
        saveGuestQuiz({ session, answers: [] });
      }
      preloadQuestionFlags(session.questions[0]);
      router.push(`/quiz/${session.id}`);
      return session;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that quiz');
      setPendingKey(null);
      return null;
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

  return { startQuiz, startRecall, pendingKey, error };
}
