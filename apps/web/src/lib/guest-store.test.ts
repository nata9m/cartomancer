// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  isGuestSessionId,
  loadGuestQuiz,
  loadGuestRecall,
  saveGuestQuiz,
  saveGuestRecall,
} from './guest-store';

// Only the id matters to the store; the rest is carried along untouched.
const quiz = (id: string, extra = {}) =>
  ({ session: { id, questions: [{ sequence: 1 }] }, answers: [], ...extra }) as never;
const recall = (id: string) => ({ session: { id }, recalled: [{ id: 1, name: 'Fiji' }] }) as never;

describe('guest sessions live in sessionStorage', () => {
  it('round-trips a quiz', () => {
    const state = quiz('guest-a', { answers: [{ sequence: 1, wasCorrect: true }] });
    saveGuestQuiz(state);
    expect(loadGuestQuiz('guest-a')).toEqual(state);
  });

  it('round-trips a recall round', () => {
    saveGuestRecall(recall('guest-r'));
    expect(loadGuestRecall('guest-r')).toEqual(recall('guest-r'));
  });

  it('keeps a quiz and a recall round with the same id apart', () => {
    saveGuestQuiz(quiz('guest-same'));
    expect(loadGuestRecall('guest-same')).toBeNull();
    saveGuestRecall(recall('guest-same'));
    expect(loadGuestQuiz('guest-same')).not.toBeNull();
    expect(loadGuestRecall('guest-same')).not.toBeNull();
  });

  it('keeps sessions apart by id, and overwrites the same one', () => {
    saveGuestQuiz(quiz('guest-1'));
    saveGuestQuiz(quiz('guest-2', { answers: [1] }));
    expect(loadGuestQuiz('guest-1')?.answers).toEqual([]);
    expect(loadGuestQuiz('guest-2')?.answers).toEqual([1]);
    saveGuestQuiz(quiz('guest-1', { answers: [9] }));
    expect(loadGuestQuiz('guest-1')?.answers).toEqual([9]);
  });

  it('is null for a session this tab has never held', () => {
    expect(loadGuestQuiz('guest-never')).toBeNull();
    expect(loadGuestRecall('guest-never')).toBeNull();
  });

  it('does not lose the quiz to unreadable data: null, never a throw', () => {
    window.sessionStorage.setItem('cartomancer.guest.quiz.guest-bad', '{not json');
    expect(loadGuestQuiz('guest-bad')).toBeNull();
  });

  it('does not break the quiz when storage is full or blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveGuestQuiz(quiz('guest-full'))).not.toThrow();
  });

  it('reads as empty, not as a crash, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(loadGuestQuiz('guest-x')).toBeNull();
  });
});

describe('isGuestSessionId', () => {
  it('recognises the guest- prefix and nothing else', () => {
    expect(isGuestSessionId('guest-4f0c')).toBe(true);
    for (const id of ['', 'Guest-1', 'a-guest-1', '76802d1e-c9e1-4256-a059-7ac79b965655']) {
      expect(isGuestSessionId(id)).toBe(false);
    }
  });
});
