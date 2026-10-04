import { learnedIntervalDaysForCategory } from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';
import { LEARNED_CATEGORIES, LEARNED_COPY, learnedHref, parseLearnedCategory } from './learned';

describe('parseLearnedCategory', () => {
  it('accepts exactly the three categories that have a home tile', () => {
    for (const category of ['countries', 'capitals', 'flags']) {
      expect(parseLearnedCategory(category)).toBe(category);
    }
  });

  it('refuses everything else, trivia included', () => {
    for (const value of ['trivia', 'Countries', '', ' flags', '__proto__', 'constructor']) {
      expect(parseLearnedCategory(value)).toBeUndefined();
    }
  });
});

describe('learnedHref', () => {
  it('points each stat at its own list', () => {
    expect(LEARNED_CATEGORIES.map(learnedHref)).toEqual([
      '/learned/countries',
      '/learned/capitals',
      '/learned/flags',
    ]);
  });
});

describe('LEARNED_COPY', () => {
  it('has copy for every category it links to', () => {
    for (const category of LEARNED_CATEGORIES) {
      expect(LEARNED_COPY[category].label).toMatch(/learned$/);
      expect(LEARNED_COPY[category].explanation.length).toBeGreaterThan(20);
    }
  });

  it('quotes the interval from the taxonomy, not a number written into the sentence', () => {
    for (const category of ['capitals', 'flags'] as const) {
      const weeks = learnedIntervalDaysForCategory(category) / 7;
      expect(LEARNED_COPY[category].explanation).toContain(`hold it for ${weeks} weeks`);
    }
  });
});
