import { describe, expect, it } from 'vitest';
import { ALL, readFilters } from './filters';

describe('readFilters', () => {
  it('defaults every filter to "all", and the question count to none', () => {
    expect(readFilters({})).toEqual({ region: ALL, difficulty: ALL, questionCount: '' });
  });

  it('reads region, difficulty and count from the query', () => {
    expect(readFilters({ region: 'Europe', difficulty: 'Hard', count: '30' })).toEqual({
      region: 'Europe',
      difficulty: 'Hard',
      questionCount: '30',
    });
  });

  it('takes the first of a repeated parameter', () => {
    expect(readFilters({ region: ['Asia', 'Europe'], count: ['10', '20'] })).toMatchObject({
      region: 'Asia',
      questionCount: '10',
    });
  });

  it('treats count=all as no count, like leaving it out', () => {
    expect(readFilters({ count: 'all' }).questionCount).toBe('');
  });

  it('ignores ?mode=, which a link from before #49 may still carry', () => {
    expect(readFilters({ mode: 'type', region: 'Africa' })).toEqual({
      region: 'Africa',
      difficulty: ALL,
      questionCount: '',
    });
  });

  it('does not invent a value for an empty array', () => {
    expect(readFilters({ region: [] }).region).toBe(ALL);
  });
});
