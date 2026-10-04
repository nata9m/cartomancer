// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getRoundNote, setRoundNote } from './round-note';

describe('the one-line note about a round (#70)', () => {
  it('carries a note across to the round it is about', () => {
    setRoundNote('s1', 'Only 5 countries have a clue matching these filters.');
    expect(getRoundNote('s1')).toBe('Only 5 countries have a clue matching these filters.');
  });

  it('is keyed by session, so one round’s note is never another’s', () => {
    setRoundNote('s1', 'one');
    expect(getRoundNote('s2')).toBeNull();
  });

  it('survives being read twice, which is what a refresh does', () => {
    setRoundNote('s3', 'kept');
    getRoundNote('s3');
    expect(getRoundNote('s3')).toBe('kept');
  });

  it('is a courtesy: blocked storage neither throws nor shows a note', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setRoundNote('s4', 'x')).not.toThrow();
    expect(getRoundNote('s4')).toBeNull();
  });
});
