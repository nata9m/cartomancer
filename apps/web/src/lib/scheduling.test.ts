import {
  EASE_DEFAULT,
  EASE_MAX,
  EASE_MIN,
  LEARNED_INTERVAL_DAYS,
  NEW_SCHEDULE,
  isLearnedInterval,
  learnedIntervalDaysFor,
  learnedIntervalDaysForCategory,
  nextSchedule,
  qualityFromTime,
  type ScheduleState,
} from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';

const good = { wasCorrect: true, quality: 'good' as const };

function run(answers: Parameters<typeof nextSchedule>[1][], from: ScheduleState = NEW_SCHEDULE) {
  let state = from;
  const dueIn: number[] = [];
  for (const answer of answers) {
    const outcome = nextSchedule(state, answer);
    state = outcome;
    dueIn.push(outcome.dueInDays);
  }
  return { state, dueIn };
}

describe('nextSchedule', () => {
  it('climbs 1 day, 6 days, then by the ease factor', () => {
    const { state, dueIn } = run([good, good, good, good]);
    expect(dueIn).toEqual([1, 6, 15, 37.5]);
    expect(state.streak).toBe(4);
    expect(state.ease).toBe(EASE_DEFAULT);
  });

  it('learns on the third success in a row with the default ease', () => {
    const { state } = run([good, good, good]);
    expect(isLearnedInterval('capitals-c2cap-mc', state.intervalDays)).toBe(true);
    const two = run([good, good]).state;
    expect(isLearnedInterval('capitals-c2cap-mc', two.intervalDays)).toBe(false);
  });

  it('a miss collapses the interval, resets the streak, costs ease and is due at once', () => {
    const learned = run([good, good, good]).state;
    const missed = nextSchedule(learned, { wasCorrect: false, quality: 'good' });
    expect(missed).toEqual({ streak: 0, intervalDays: 0, ease: 2.3, dueInDays: 0 });
    expect(isLearnedInterval('capitals-c2cap-mc', missed.intervalDays)).toBe(false);
  });

  it('a miss ignores speed and a hint', () => {
    const missed = nextSchedule(NEW_SCHEDULE, {
      wasCorrect: false,
      hintUsed: true,
      quality: 'easy',
    });
    expect(missed.streak).toBe(0);
    expect(missed.ease).toBe(2.3);
  });

  it('a hinted correct answer changes neither streak nor interval, costs ease, and is due tomorrow', () => {
    const before = run([good, good]).state;
    const hinted = nextSchedule(before, { wasCorrect: true, hintUsed: true, quality: 'easy' });
    expect(hinted.streak).toBe(before.streak);
    expect(hinted.intervalDays).toBe(before.intervalDays);
    expect(hinted.ease).toBe(2.35);
    expect(hinted.dueInDays).toBe(1);
  });

  it('a fast answer raises the ease and a slow one lowers it', () => {
    const fast = nextSchedule(NEW_SCHEDULE, { wasCorrect: true, quality: 'easy' });
    const slow = nextSchedule(NEW_SCHEDULE, { wasCorrect: true, quality: 'hard' });
    expect(fast.ease).toBe(2.6);
    expect(slow.ease).toBe(2.35);
  });

  it('slow answers delay learning: the third success is then too short of two weeks', () => {
    const { state } = run([
      { wasCorrect: true, quality: 'hard' },
      { wasCorrect: true, quality: 'hard' },
      { wasCorrect: true, quality: 'hard' },
    ]);
    expect(state.streak).toBe(3);
    expect(isLearnedInterval('capitals-c2cap-mc', state.intervalDays)).toBe(false);
  });

  it('keeps the ease inside its bounds however long the run', () => {
    let state = NEW_SCHEDULE;
    for (let i = 0; i < 40; i += 1)
      state = nextSchedule(state, { wasCorrect: true, quality: 'easy' });
    expect(state.ease).toBe(EASE_MAX);
    for (let i = 0; i < 40; i += 1)
      state = nextSchedule(state, { wasCorrect: false, quality: 'good' });
    expect(state.ease).toBe(EASE_MIN);
  });

  it('always moves the interval forward on a success, even at the lowest ease', () => {
    const state: ScheduleState = { streak: 3, intervalDays: 2, ease: EASE_MIN };
    const next = nextSchedule(state, { wasCorrect: true, quality: 'hard' });
    expect(next.intervalDays).toBeGreaterThan(2);
  });
});

describe('qualityFromTime', () => {
  it('is good when it cannot tell', () => {
    expect(qualityFromTime('multiple_choice', null)).toBe('good');
    expect(qualityFromTime('multiple_choice', undefined)).toBe('good');
    expect(qualityFromTime('multiple_choice', Number.NaN)).toBe('good');
  });
  it('is fast, ordinary or slow for a tap', () => {
    expect(qualityFromTime('multiple_choice', 1_200)).toBe('easy');
    expect(qualityFromTime('multiple_choice', 6_000)).toBe('good');
    expect(qualityFromTime('multiple_choice', 15_000)).toBe('hard');
    expect(qualityFromTime('map_tap', 15_000)).toBe('hard');
  });
  it('allows typing more time before it is slow', () => {
    expect(qualityFromTime('type_in', 6_000)).toBe('easy');
    expect(qualityFromTime('type_in', 15_000)).toBe('good');
    expect(qualityFromTime('type_in', 25_000)).toBe('hard');
  });
});

describe('what counts as learned', () => {
  it('is two weeks, except recall where one recall is enough', () => {
    expect(learnedIntervalDaysFor('capitals-c2cap-mc')).toBe(LEARNED_INTERVAL_DAYS);
    expect(learnedIntervalDaysFor('countries-recall')).toBe(1);
    expect(learnedIntervalDaysForCategory('capitals')).toBe(LEARNED_INTERVAL_DAYS);
    expect(learnedIntervalDaysForCategory('countries')).toBe(1);
    expect(isLearnedInterval('countries-recall', 1)).toBe(true);
    expect(isLearnedInterval('flags-flag2c-mc', 13.9)).toBe(false);
    expect(isLearnedInterval('flags-flag2c-mc', 14)).toBe(true);
  });
});
