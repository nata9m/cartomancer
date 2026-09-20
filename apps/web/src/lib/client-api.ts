'use client';

import type {
  AnswerResult,
  CountryRef,
  QuizSession,
  RecallGuessResult,
  RecallResults,
  RecallSession,
  SessionResults,
} from '@cartomancer/shared';

/**
 * Every client-side call goes through the BFF proxy, which attaches the shared
 * secret and the signed-in user's id server-side. Nothing here knows whether the
 * caller is a guest — that is decided by the presence of an Auth.js session when
 * the proxy forwards the request.
 */
async function bff<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/bff/${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export interface StartQuizInput {
  quizTypeKey: string;
  region?: string;
  difficulty?: string;
  questionCount?: number;
}

export const startQuizSession = (input: StartQuizInput): Promise<QuizSession> =>
  bff<QuizSession>('sessions', { method: 'POST', body: input });

export type PersistedSession = QuizSession & {
  answered: { countryId: number; wasCorrect: boolean }[];
};

export const loadQuizSession = (sessionId: string): Promise<PersistedSession> =>
  bff<PersistedSession>(`sessions/${sessionId}`);

export const submitAnswer = (
  sessionId: string,
  body: { sequence: number; answer: string; timeTakenMs?: number },
): Promise<AnswerResult> => bff<AnswerResult>(`sessions/${sessionId}/answers`, { method: 'POST', body });

export const checkAnswerAsGuest = (body: {
  quizTypeKey: string;
  countryId: number;
  answer: string;
}): Promise<AnswerResult> => bff<AnswerResult>('answers/check', { method: 'POST', body });

export const finishQuizSession = (sessionId: string): Promise<SessionResults> =>
  bff<SessionResults>(`sessions/${sessionId}/finish`, { method: 'POST', body: {} });

export const loadQuizResults = (sessionId: string): Promise<SessionResults> =>
  bff<SessionResults>(`sessions/${sessionId}/results`);

export const startRecallSession = (region: string): Promise<RecallSession> =>
  bff<RecallSession>('recall', { method: 'POST', body: { region } });

export type PersistedRecallSession = RecallSession & {
  recalled: { id: number; name: string; isoCode: string }[];
};

export const loadRecallSession = (sessionId: string): Promise<PersistedRecallSession> =>
  bff<PersistedRecallSession>(`recall/${sessionId}`);

export const submitRecallGuess = (
  sessionId: string,
  guess: string,
): Promise<RecallGuessResult> =>
  bff<RecallGuessResult>(`recall/${sessionId}/guesses`, { method: 'POST', body: { guess } });

export const checkRecallGuessAsGuest = (body: {
  region: string;
  guess: string;
  alreadyRecalledCountryIds: number[];
}): Promise<RecallGuessResult> => bff<RecallGuessResult>('recall/check', { method: 'POST', body });

export const finishRecallSession = (sessionId: string): Promise<RecallResults> =>
  bff<RecallResults>(`recall/${sessionId}/finish`, { method: 'POST', body: {} });

export const loadRecallResults = (sessionId: string): Promise<RecallResults> =>
  bff<RecallResults>(`recall/${sessionId}/results`);

export const loadCountries = (region: string): Promise<{ countries: CountryRef[]; total: number }> =>
  bff<{ countries: CountryRef[]; total: number }>(
    `countries?region=${encodeURIComponent(region)}`,
  );
