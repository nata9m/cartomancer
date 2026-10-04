// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSeenFacts, markFactSeen } from './seen-facts';

const KEY = 'cartomancer.seenFacts.v2';
const LEGACY = 'cartomancer.seenFacts';

beforeEach(() => {
  window.localStorage.clear();
});

describe('the guest clue rotation list (#70)', () => {
  it('starts empty', () => {
    expect(getSeenFacts()).toEqual({});
  });

  it('records a clue with the time it was met, keyed by clue id alone', () => {
    markFactSeen(7, 1000);
    expect(getSeenFacts()).toEqual({ '7': 1000 });
  });

  it('keeps every clue, and moves one that is met again to its new time', () => {
    markFactSeen(1, 100);
    markFactSeen(2, 200);
    markFactSeen(1, 300);
    expect(getSeenFacts()).toEqual({ '1': 300, '2': 200 });
  });

  it('stamps the present when no time is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    markFactSeen(5);
    expect(getSeenFacts()['5']).toBe(Date.parse('2026-10-04T12:00:00Z'));
    vi.useRealTimers();
  });

  it('is one list for the browser, not one per region and difficulty', () => {
    // The first version keyed by filter combination, so a clue met under "All
    // regions" was new under "Europe". Nothing in the API takes a filter.
    markFactSeen(3, 10);
    expect(Object.keys(JSON.parse(window.localStorage.getItem(KEY)!))).toEqual(['3']);
  });
});

describe('migrating the old per-filter lists', () => {
  it('folds them into one list as "met long ago", and removes the old key', () => {
    window.localStorage.setItem(
      LEGACY,
      JSON.stringify({ 'Europe:Easy': [1, 2], 'all:all': [2, 3] }),
    );
    expect(getSeenFacts()).toEqual({ '1': 0, '2': 0, '3': 0 });
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ '1': 0, '2': 0, '3': 0 });
  });

  it('puts migrated clues behind anything met since', () => {
    window.localStorage.setItem(LEGACY, JSON.stringify({ 'all:all': [1] }));
    markFactSeen(2, 500);
    const seen = getSeenFacts();
    expect(seen['1']).toBeLessThan(seen['2']!);
  });

  it('happens once: a later read does not resurrect or re-fold anything', () => {
    window.localStorage.setItem(LEGACY, JSON.stringify({ 'all:all': [1] }));
    getSeenFacts();
    window.localStorage.setItem(LEGACY, JSON.stringify({ 'all:all': [99] }));
    expect(getSeenFacts()).toEqual({ '1': 0 });
  });

  it('ignores entries that are not lists of ids', () => {
    window.localStorage.setItem(
      LEGACY,
      JSON.stringify({ a: 'nope', b: [4, 'x', null, 5], c: { 6: true } }),
    );
    expect(getSeenFacts()).toEqual({ '4': 0, '5': 0 });
  });

  it('survives an old value that is not JSON at all', () => {
    window.localStorage.setItem(LEGACY, '{{{');
    expect(getSeenFacts()).toEqual({});
  });
});

describe('a list that cannot be trusted', () => {
  it('treats a corrupted current list as empty rather than throwing', () => {
    window.localStorage.setItem(KEY, 'not json');
    expect(getSeenFacts()).toEqual({});
  });

  it('does not accept an array where the list should be an object', () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    expect(getSeenFacts()).toEqual({});
  });

  it('does not break answering when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => markFactSeen(1, 1)).not.toThrow();
  });

  it('is empty, and does nothing, away from a browser', () => {
    vi.stubGlobal('window', undefined);
    expect(getSeenFacts()).toEqual({});
    expect(() => markFactSeen(1, 1)).not.toThrow();
  });
});
