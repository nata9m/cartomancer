import { describe, expect, it } from 'vitest';
import { nextReviewText, revealAnnouncement } from './reveal';

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

describe('nextReviewText', () => {
  it('speaks in days, tomorrow, and weeks', () => {
    expect(nextReviewText(1)).toBe('Next review tomorrow');
    expect(nextReviewText(0.5)).toBe('Next review tomorrow');
    expect(nextReviewText(6)).toBe('Next review in 6 days');
    expect(nextReviewText(15)).toBe('Next review in 15 days');
    expect(nextReviewText(14)).toBe('Next review in 2 weeks');
    expect(nextReviewText(37.5)).toBe('Next review in 38 days');
  });
});
