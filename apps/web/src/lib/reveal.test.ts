import { describe, expect, it } from 'vitest';
import { revealAnnouncement } from './reveal';

const base = {
  correctAnswer: 'Kyiv',
  correctCountryName: 'Ukraine',
  currentStreak: 1,
  newlyLearned: false,
};

describe('revealAnnouncement', () => {
  it('names the answer when correct', () => {
    expect(revealAnnouncement({ ...base, wasCorrect: true })).toBe('Correct, Kyiv.');
  });
  it('gives the right answer when wrong', () => {
    expect(revealAnnouncement({ ...base, wasCorrect: false })).toBe('Wrong. The answer is Kyiv.');
  });
  it('adds the learned news', () => {
    expect(
      revealAnnouncement({ ...base, wasCorrect: true, newlyLearned: true, currentStreak: 3 }),
    ).toBe('Correct, Kyiv. Ukraine is now learned, 3 in a row.');
  });
});
