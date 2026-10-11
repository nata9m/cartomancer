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
 * The request never left the browser: DNS, TLS, a dropped connection, or no
 * network at all. Its own type because it is the one failure worth retrying —
 * a 4xx or 5xx is an answer, and sending it again would only get it twice.
 *
 * The message is what a player sees. `fetch` rejects with "Failed to fetch",
 * which is Chrome telling a developer something (#58).
 */
export class NetworkError extends Error {
  constructor() {
    super('Couldn’t reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}

/** Short: the player is waiting on the question in front of them. */
const RETRY_DELAYS_MS = [300, 900];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Every client-side call goes through the BFF proxy at /bff, which attaches the
 * shared secret and the signed-in user's id server-side. Nothing here knows
 * whether the caller is a guest — that is decided by the presence of an Auth.js
 * session when the proxy forwards the request.
 *
 * /bff rather than /api/bff because the Gateway routes /api to the api service;
 * only /api/auth (Auth.js, at its default basePath) comes back to this app.
 *
 * A transport failure is retried twice before it reaches the caller (#58): one
 * ECH handshake failure mid-round used to end the quiz. GETs retry by default
 * because reading twice costs nothing; a POST has to say `retry: true`, and
 * only the ones whose endpoint is safe to repeat do — answering (a repeat
 * replays the recorded answer), a recall guess (a repeat is a duplicate),
 * finishing (a repeat re-stamps the same finish). Starting a session never
 * retries: a second one would be a second round.
 */
async function bff<T>(
  path: string,
  init?: { method?: string; body?: unknown; retry?: boolean },
): Promise<T> {
  const method = init?.method ?? 'GET';
  const retries = (init?.retry ?? method === 'GET') ? RETRY_DELAYS_MS.length : 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send<T>(path, method, init?.body);
    } catch (cause) {
      if (!(cause instanceof NetworkError) || attempt >= retries) {
        throw cause;
      }
      await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
}

async function send<T>(path: string, method: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/bff/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when the request never got an answer: everything the
    // server says, including a 500, resolves.
    throw new NetworkError();
  }
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
  /** Ask about exactly these countries, instead of choosing by the filters (#51). */
  countryIds?: number[];
  /** Guest trivia rotation: clue id → epoch ms last answered (#70). */
  seenFacts?: Record<string, number>;
  /** Guest country rotation: country id → epoch ms last asked (#96). */
  seenCountries?: Record<string, number>;
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
  body: { sequence: number; answer: string; timeTakenMs?: number; hintUsed?: boolean },
): Promise<AnswerResult> =>
  bff<AnswerResult>(`sessions/${sessionId}/answers`, { method: 'POST', body, retry: true });

export const checkAnswerAsGuest = (body: {
  quizTypeKey: string;
  countryId: number;
  answer: string;
  hintUsed?: boolean;
}): Promise<AnswerResult> =>
  bff<AnswerResult>('answers/check', { method: 'POST', body, retry: true });

export const finishQuizSession = (sessionId: string): Promise<SessionResults> =>
  bff<SessionResults>(`sessions/${sessionId}/finish`, { method: 'POST', body: {}, retry: true });

export const loadQuizResults = (sessionId: string): Promise<SessionResults> =>
  bff<SessionResults>(`sessions/${sessionId}/results`);

export const startRecallSession = (region: string): Promise<RecallSession> =>
  bff<RecallSession>('recall', { method: 'POST', body: { region } });

export type PersistedRecallSession = RecallSession & {
  recalled: { id: number; name: string; isoCode: string }[];
};

export const loadRecallSession = (sessionId: string): Promise<PersistedRecallSession> =>
  bff<PersistedRecallSession>(`recall/${sessionId}`);

export const submitRecallGuess = (sessionId: string, guess: string): Promise<RecallGuessResult> =>
  bff<RecallGuessResult>(`recall/${sessionId}/guesses`, {
    method: 'POST',
    body: { guess },
    retry: true,
  });

export const checkRecallGuessAsGuest = (body: {
  region: string;
  guess: string;
  alreadyRecalledCountryIds: number[];
}): Promise<RecallGuessResult> =>
  bff<RecallGuessResult>('recall/check', { method: 'POST', body, retry: true });

export const finishRecallSession = (sessionId: string): Promise<RecallResults> =>
  bff<RecallResults>(`recall/${sessionId}/finish`, { method: 'POST', body: {}, retry: true });

export const loadRecallResults = (sessionId: string): Promise<RecallResults> =>
  bff<RecallResults>(`recall/${sessionId}/results`);

export const loadCountries = (
  region: string,
): Promise<{ countries: CountryRef[]; total: number }> =>
  bff<{ countries: CountryRef[]; total: number }>(`countries?region=${encodeURIComponent(region)}`);
