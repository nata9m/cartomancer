/**
 * The day-boundary arithmetic behind the home screen's streak and week row,
 * on its own: no database, no clock, no server (#55).
 *
 * `loadSummary` is tested against Postgres in server.test.ts; these are the
 * pieces it is built from, which is where the calendar edge cases live — month
 * and year ends, leap days, weeks that straddle them, and zones whose midnight
 * is not on the hour. Everything here is a string date or a fixed instant, so
 * none of it depends on when, or where, the tests run.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countStreak,
  currentWeekDays,
  isValidTimeZone,
  localDateParts,
  shiftDay,
} from './progress.js';

const days = (...values: string[]) => new Set(values);

describe('shiftDay', () => {
  it('moves by whole days', () => {
    assert.equal(shiftDay('2026-10-04', 1), '2026-10-05');
    assert.equal(shiftDay('2026-10-04', -1), '2026-10-03');
    assert.equal(shiftDay('2026-10-04', 0), '2026-10-04');
    assert.equal(shiftDay('2026-10-04', 30), '2026-11-03');
  });

  it('crosses month and year ends', () => {
    assert.equal(shiftDay('2026-01-31', 1), '2026-02-01');
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
    assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  });

  it('knows leap years: 2028 has a 29 February, 2026 and 2100 do not', () => {
    assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
    assert.equal(shiftDay('2028-02-29', 1), '2028-03-01');
    assert.equal(shiftDay('2026-02-28', 1), '2026-03-01');
    assert.equal(shiftDay('2100-02-28', 1), '2100-03-01');
  });
});

describe('countStreak', () => {
  it('is zero with no days played', () => {
    assert.equal(countStreak(days(), '2026-10-04'), 0);
  });

  it('counts today alone as one', () => {
    assert.equal(countStreak(days('2026-10-04'), '2026-10-04'), 1);
  });

  it('keeps a streak alive through yesterday: the grace day, before the first answer of today', () => {
    assert.equal(countStreak(days('2026-10-03'), '2026-10-04'), 1);
    assert.equal(countStreak(days('2026-10-01', '2026-10-02', '2026-10-03'), '2026-10-04'), 3);
  });

  it('is over once a whole day has been missed', () => {
    assert.equal(countStreak(days('2026-10-02'), '2026-10-04'), 0);
    assert.equal(countStreak(days('2026-09-01', '2026-09-02', '2026-09-03'), '2026-10-04'), 0);
  });

  it('counts consecutive days, ending today or yesterday alike', () => {
    const run = days('2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04');
    assert.equal(countStreak(run, '2026-10-04'), 5);
    assert.equal(countStreak(run, '2026-10-05'), 5, 'the same run, the morning after');
  });

  it('stops at the first gap, however long the run before it', () => {
    const played = days('2026-09-20', '2026-09-21', '2026-09-22', '2026-10-03', '2026-10-04');
    assert.equal(countStreak(played, '2026-10-04'), 2);
  });

  it('counts across a month end, a year end and a leap day', () => {
    assert.equal(countStreak(days('2026-02-27', '2026-02-28', '2026-03-01'), '2026-03-01'), 3);
    assert.equal(countStreak(days('2025-12-31', '2026-01-01'), '2026-01-01'), 2);
    assert.equal(countStreak(days('2028-02-28', '2028-02-29', '2028-03-01'), '2028-03-01'), 3);
    // Not a run: 2026 has no 29 February to bridge the gap.
    assert.equal(countStreak(days('2026-02-27', '2026-03-01'), '2026-03-01'), 1);
  });

  it('ignores days after today, which are not a streak', () => {
    assert.equal(countStreak(days('2026-10-05', '2026-10-06'), '2026-10-04'), 0);
    assert.equal(countStreak(days('2026-10-04', '2026-10-05'), '2026-10-04'), 1);
  });

  it('is not thrown by a very long run', () => {
    const run = new Set<string>();
    let day = '2026-10-04';
    for (let i = 0; i < 400; i += 1) {
      run.add(day);
      day = shiftDay(day, -1);
    }
    assert.equal(countStreak(run, '2026-10-04'), 400);
  });
});

describe('currentWeekDays', () => {
  const week = (today: string) => currentWeekDays(today);

  it('is the Monday-first week that contains the day, for every day of it', () => {
    // 28 September 2026 is a Monday.
    const expected = [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ];
    for (const today of expected) {
      assert.deepEqual(week(today), expected, today);
    }
  });

  it('puts Sunday at the end of its week, not the start of the next', () => {
    assert.equal(week('2026-10-04')[0], '2026-09-28');
    assert.equal(week('2026-10-04')[6], '2026-10-04');
    assert.equal(week('2026-10-05')[0], '2026-10-05', 'Monday starts a new week');
  });

  it('straddles a month end', () => {
    assert.deepEqual(week('2026-09-30'), [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('straddles a year end', () => {
    assert.deepEqual(week('2026-01-01'), [
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
  });

  it('includes a leap day', () => {
    assert.deepEqual(week('2028-02-29'), [
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
      '2028-03-02',
      '2028-03-03',
      '2028-03-04',
      '2028-03-05',
    ]);
  });

  it('is always seven consecutive days, starting on a Monday, containing today', () => {
    let today = '2024-12-20';
    for (let i = 0; i < 800; i += 1) {
      const w = week(today);
      assert.equal(w.length, 7);
      assert.equal(new Date(`${w[0]}T00:00:00Z`).getUTCDay(), 1, `${today}: starts on a Monday`);
      assert.ok(w.includes(today), `${today}: contains itself`);
      w.forEach((day, index) => assert.equal(day, shiftDay(w[0]!, index)));
      today = shiftDay(today, 1);
    }
  });
});

describe('localDateParts: which calendar day an instant is, where the player is', () => {
  const at = (iso: string, zone: string) => localDateParts(new Date(iso), zone);

  it('is the UTC date in UTC', () => {
    assert.equal(at('2026-09-29T21:41:00Z', 'UTC'), '2026-09-29');
  });

  it('is already tomorrow ahead of UTC (#66: Wednesday 07:41 in Brisbane)', () => {
    assert.equal(at('2026-09-29T21:41:00Z', 'Australia/Brisbane'), '2026-09-30');
    assert.equal(at('2026-09-29T09:59:59Z', 'Pacific/Kiritimati'), '2026-09-29');
    assert.equal(at('2026-09-29T10:00:00Z', 'Pacific/Kiritimati'), '2026-09-30', 'UTC+14');
  });

  it('is still yesterday behind UTC', () => {
    assert.equal(at('2026-09-30T03:30:00Z', 'America/New_York'), '2026-09-29');
    assert.equal(at('2026-09-30T11:59:59Z', 'Etc/GMT+12'), '2026-09-29');
    assert.equal(at('2026-09-30T12:00:00Z', 'Etc/GMT+12'), '2026-09-30', 'UTC-12');
  });

  it('turns over at local midnight even when that is not on the hour', () => {
    // India is UTC+5:30, so its midnight is 18:30 UTC.
    assert.equal(at('2026-09-29T18:29:59Z', 'Asia/Kolkata'), '2026-09-29');
    assert.equal(at('2026-09-29T18:30:00Z', 'Asia/Kolkata'), '2026-09-30');
    // Nepal is UTC+5:45.
    assert.equal(at('2026-09-29T18:14:59Z', 'Asia/Kathmandu'), '2026-09-29');
    assert.equal(at('2026-09-29T18:15:00Z', 'Asia/Kathmandu'), '2026-09-30');
  });

  it('follows daylight saving: a day is a day even when it is 23 or 25 hours long', () => {
    // New York springs forward on 8 March 2026 (EST → EDT at 02:00 local).
    assert.equal(at('2026-03-08T04:59:59Z', 'America/New_York'), '2026-03-07');
    assert.equal(at('2026-03-08T05:00:00Z', 'America/New_York'), '2026-03-08');
    assert.equal(at('2026-03-09T03:59:59Z', 'America/New_York'), '2026-03-08', 'a 23-hour day');
    assert.equal(at('2026-03-09T04:00:00Z', 'America/New_York'), '2026-03-09');
    // …and falls back on 1 November 2026 (EDT → EST), a 25-hour day.
    assert.equal(at('2026-11-01T03:59:59Z', 'America/New_York'), '2026-10-31');
    assert.equal(at('2026-11-01T04:00:00Z', 'America/New_York'), '2026-11-01');
    assert.equal(at('2026-11-02T04:59:59Z', 'America/New_York'), '2026-11-01', 'a 25-hour day');
    assert.equal(at('2026-11-02T05:00:00Z', 'America/New_York'), '2026-11-02');
  });

  it('handles a zone whose offset changes the date across a year end', () => {
    assert.equal(at('2026-12-31T23:00:00Z', 'Pacific/Auckland'), '2027-01-01');
    assert.equal(at('2027-01-01T05:00:00Z', 'America/Los_Angeles'), '2026-12-31');
  });
});

describe('isValidTimeZone', () => {
  it('accepts real IANA names', () => {
    for (const zone of ['UTC', 'Europe/Warsaw', 'America/New_York', 'Asia/Kolkata', 'Etc/GMT+12']) {
      assert.equal(isValidTimeZone(zone), true, zone);
    }
  });

  it('refuses anything else, including what looks like an injection', () => {
    for (const zone of [
      '',
      'Not/AZone',
      'Europe Warsaw',
      "UTC'; DROP TABLE users;--",
      '../../etc/passwd',
      'Europe/Warsaw\n',
    ]) {
      assert.equal(isValidTimeZone(zone), false, JSON.stringify(zone));
    }
  });
});
