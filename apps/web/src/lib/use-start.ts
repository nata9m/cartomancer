'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { startQuizSession, startRecallSession } from './client-api';
import type { Filters } from './filters';
import { saveGuestQuiz, saveGuestRecall } from './guest-store';

export const pendingKeyFor = (quizTypeKey: string, questionCount?: number): string =>
  `${quizTypeKey}:${questionCount ?? 'default'}`;

/**
 * Starts sessions from the home screen and the mode pickers.
 *
 * Filters arrive as props from the server component that read them off the URL,
 * rather than through useSearchParams — that hook would opt the whole subtree
 * out of server rendering, and these screens should be readable before the
 * JavaScript lands.
 *
 * One path serves both modes: the api decides whether the caller is a guest (by
 * whether the BFF forwarded a user id) and says so on the payload. A guest
 * session is stashed in sessionStorage here; a persisted one needs nothing,
 * since the api already owns it.
 */
export function useSessionStarter(filters: Filters) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startQuiz(quizTypeKey: string, questionCount?: number): Promise<void> {
    // Composite so that, on a screen offering the same quiz type at several
    // lengths (Fun facts), only the tapped card shows as pending.
    setPendingKey(pendingKeyFor(quizTypeKey, questionCount));
    setError(null);
    try {
      const session = await startQuizSession({
        quizTypeKey,
        region: filters.region,
        difficulty: filters.difficulty,
        ...(questionCount === undefined ? {} : { questionCount }),
      });
      if (session.isGuest) {
        saveGuestQuiz({ session, answers: [] });
      }
      router.push(`/quiz/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that quiz');
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

  return { startQuiz, startRecall, pendingKey, error };
}
