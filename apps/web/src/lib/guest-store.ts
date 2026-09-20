'use client';

import type { QuizSession, RecallSession } from '@cartomancer/shared';

/**
 * Guest session state, held in sessionStorage.
 *
 * The brief allows server memory or a signed cookie; sessionStorage is the
 * choice because it keeps the guarantee trivially true — a guest's quiz never
 * reaches the server as state at all, so there is nothing to expire, replicate
 * across api pods, or accidentally persist. It also survives a refresh, which a
 * short-lived server map would not across a rolling restart.
 */
const QUIZ_PREFIX = 'cartomancer.guest.quiz.';
const RECALL_PREFIX = 'cartomancer.guest.recall.';

export interface GuestAnswer {
  sequence: number;
  countryId: number;
  answer: string;
  wasCorrect: boolean;
  correctAnswer: string;
  correctCountryName: string;
  correctIsoCode: string;
}

export interface GuestQuizState {
  session: QuizSession;
  answers: GuestAnswer[];
}

export interface GuestRecallState {
  session: RecallSession;
  recalled: { id: number; name: string; isoCode: string }[];
}

export const isGuestSessionId = (id: string): boolean => id.startsWith('guest-');

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked sessionStorage costs the guest their results screen,
    // which is not worth breaking the quiz over.
  }
}

export const saveGuestQuiz = (state: GuestQuizState): void =>
  write(`${QUIZ_PREFIX}${state.session.id}`, state);

export const loadGuestQuiz = (sessionId: string): GuestQuizState | null =>
  read<GuestQuizState>(`${QUIZ_PREFIX}${sessionId}`);

export const saveGuestRecall = (state: GuestRecallState): void =>
  write(`${RECALL_PREFIX}${state.session.id}`, state);

export const loadGuestRecall = (sessionId: string): GuestRecallState | null =>
  read<GuestRecallState>(`${RECALL_PREFIX}${sessionId}`);
