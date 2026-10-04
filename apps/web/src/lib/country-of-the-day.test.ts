import { COUNTRIES } from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';
import { countryOfTheDay } from './country-of-the-day';

const day = (n: number): Date => new Date(n * 86_400_000);

describe('countryOfTheDay', () => {
  it('is the same country all day, whichever moment of it is asked', () => {
    const start = countryOfTheDay(new Date('2026-10-04T00:00:00.000Z'));
    for (const time of [
      '2026-10-04T00:00:01Z',
      '2026-10-04T12:00:00Z',
      '2026-10-04T23:59:59.999Z',
    ]) {
      expect(countryOfTheDay(new Date(time))).toEqual(start);
    }
  });

  it('changes at midnight UTC, for everyone at once', () => {
    const before = countryOfTheDay(new Date('2026-10-04T23:59:59.999Z'));
    const after = countryOfTheDay(new Date('2026-10-05T00:00:00.000Z'));
    expect(after?.country.isoCode).not.toBe(before?.country.isoCode);
  });

  it('shows every country exactly once before any repeats', () => {
    // A permutation, not a hash: hashing 195 days into 195 slots would repeat
    // some countries and never show others.
    const seen = new Set<string>();
    for (let n = 20_000; n < 20_000 + COUNTRIES.length; n += 1) {
      const pick = countryOfTheDay(day(n));
      expect(pick).toBeDefined();
      seen.add(pick!.country.isoCode);
    }
    expect(seen.size).toBe(COUNTRIES.length);
  });

  it('starts the cycle over after a full pass', () => {
    const n = 20_000;
    expect(countryOfTheDay(day(n + COUNTRIES.length))?.country.isoCode).toBe(
      countryOfTheDay(day(n))?.country.isoCode,
    );
  });

  it('wraps a clock set before 1970 into range instead of indexing off the front', () => {
    for (const n of [-1, -195, -196, -100_000]) {
      expect(countryOfTheDay(day(n))?.country).toBeDefined();
    }
  });

  it('keeps the clue stable while the country stays put', () => {
    const a = countryOfTheDay(new Date('2026-10-04T01:00:00Z'));
    const b = countryOfTheDay(new Date('2026-10-04T22:00:00Z'));
    expect(a?.fact).toBe(b?.fact);
  });

  it('never lets a clue name the country it is the caption for', () => {
    for (let n = 20_000; n < 20_000 + COUNTRIES.length; n += 1) {
      const pick = countryOfTheDay(day(n));
      if (pick?.fact) {
        expect(pick.fact.toLowerCase()).not.toContain(pick.country.name.toLowerCase());
      }
    }
  });
});
