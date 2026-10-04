import {
  learnedThresholdFor,
  TOTAL_COUNTRIES,
  type CategoryProgress,
  type CountryProgress,
  type ProgressSummary,
  type QuizCategory,
} from '@cartomancer/shared';
import type { PrismaClient } from '@cartomancer/db';
import type { Db } from './db.js';

export interface ProgressUpdate {
  currentStreak: number;
  isLearned: boolean;
  /** True when this answer is what pushed the country over the threshold. */
  newlyLearned: boolean;
}

/**
 * Applies one answer to a user's learning state.
 *
 * `is_learned` is never stored independently: it is recomputed as
 * `current_streak >= threshold` on every write, so it cannot drift from the
 * streak. A wrong answer resets the streak to 0, which demotes a country that
 * was already learned. `last_answered_at` is stamped either way — that column is
 * the rotation pool's cursor, so a wrong answer has to move it too, otherwise a
 * missed country would come straight back.
 *
 * The threshold is 3 in a row everywhere except active recall, where a single
 * successful recall is enough.
 *
 * One statement, not read-then-write (#54). This used to read the streak, add
 * one in JavaScript and upsert it back, so two answers to the same country in
 * flight together — two tabs, two sessions — both read the same streak and both
 * wrote the same successor: one correct answer vanished from the count. The
 * increment is now done by the database against the row as it is when the write
 * lands (`progress.current_streak` in the DO UPDATE is the committed row, after
 * waiting on any concurrent writer), so every answer counts.
 */
export async function recordProgress(
  db: Db,
  options: {
    userId: string;
    quizTypeId: number;
    quizTypeKey: string;
    countryId: number;
    wasCorrect: boolean;
    answeredAt?: Date;
  },
): Promise<ProgressUpdate> {
  const { userId, quizTypeId, quizTypeKey, countryId, wasCorrect } = options;
  const answeredAt = options.answeredAt ?? new Date();
  const threshold = learnedThresholdFor(quizTypeKey);
  // What a brand-new row starts at: one correct answer, or nothing.
  const firstStreak = wasCorrect ? 1 : 0;

  const rows = await db.$queryRawUnsafe<{ current_streak: number; is_learned: boolean }[]>(
    `INSERT INTO progress
            (user_id, country_id, quiz_type_id, current_streak, is_learned, last_answered_at)
     VALUES ($1::uuid, $2::int, $3::int, $4::int, $5::boolean, $6::timestamptz)
     ON CONFLICT (user_id, country_id, quiz_type_id) DO UPDATE
        SET current_streak  = CASE WHEN $7::boolean THEN progress.current_streak + 1 ELSE 0 END,
            is_learned      = (CASE WHEN $7::boolean THEN progress.current_streak + 1 ELSE 0 END) >= $8::int,
            last_answered_at = EXCLUDED.last_answered_at
     RETURNING current_streak, is_learned`,
    userId,
    countryId,
    quizTypeId,
    firstStreak,
    firstStreak >= threshold,
    answeredAt,
    wasCorrect,
    threshold,
  );
  const row = rows[0];
  if (!row) {
    throw new Error('progress upsert returned no row');
  }

  const currentStreak = Number(row.current_streak);
  // A correct answer moved the streak up by exactly one, so it crossed the
  // threshold exactly when it landed on it. A wrong one resets to zero and can
  // never be the answer that learned something.
  return {
    currentStreak,
    isLearned: row.is_learned,
    newlyLearned: wasCorrect && currentStreak === threshold,
  };
}

/**
 * Countries that crossed the learned threshold during a session.
 *
 * Derived rather than stored: a country appears at most once per session, so a
 * streak sitting exactly on the threshold with a `last_answered_at` inside the
 * session window can only have got there on this session's answer.
 */
export async function newlyLearnedInSession(
  prisma: PrismaClient,
  options: {
    userId: string;
    quizTypeId: number;
    quizTypeKey: string;
    countryIds: number[];
    since: Date;
  },
): Promise<{ countryId: number; countryName: string }[]> {
  if (options.countryIds.length === 0) {
    return [];
  }
  const rows = await prisma.progress.findMany({
    where: {
      userId: options.userId,
      quizTypeId: options.quizTypeId,
      countryId: { in: options.countryIds },
      currentStreak: learnedThresholdFor(options.quizTypeKey),
      isLearned: true,
      lastAnsweredAt: { gte: options.since },
    },
    select: { countryId: true, country: { select: { name: true } } },
    orderBy: { country: { name: 'asc' } },
  });
  return rows.map((row) => ({ countryId: row.countryId, countryName: row.country.name }));
}

/**
 * Day streak and weekly activity are derived from `session_answers` rather than
 * stored: "a day the user practised" is exactly "a day with at least one
 * answer", so there is nothing to keep in sync. Days are bucketed in the
 * caller's timezone, defaulting to UTC — which is only right for a player in UTC.
 * Everywhere this is called must say where the player is (`requestTimeZone`),
 * or "today" is the wrong day for anyone else: a player ahead of UTC who has not
 * played since Monday still has a streak on Wednesday morning, because their
 * Wednesday is still Tuesday in UTC (#66).
 *
 * `now` is a parameter so the day boundary can be tested; callers leave it out.
 */
export async function loadSummary(
  prisma: PrismaClient,
  userId: string,
  timeZone = 'UTC',
  now: Date = new Date(),
): Promise<ProgressSummary> {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';

  const activeDays = await prisma.$queryRawUnsafe<{ day: string }[]>(
    `SELECT DISTINCT to_char((answered_at AT TIME ZONE $2), 'YYYY-MM-DD') AS day
       FROM session_answers
      WHERE user_id = $1::uuid
      ORDER BY day DESC
      LIMIT 400`,
    userId,
    zone,
  );
  const activeDaySet = new Set(activeDays.map((row) => row.day));

  const today = localDateParts(now, zone);
  const dayStreak = countStreak(activeDaySet, today);
  const weekActivity = currentWeekDays(today).map((day) => activeDaySet.has(day));

  const learnedRows = await prisma.$queryRawUnsafe<{ category: string; learned: bigint }[]>(
    `SELECT q.category, COUNT(DISTINCT p.country_id) AS learned
       FROM progress p
       JOIN quiz_types q ON q.id = p.quiz_type_id
      WHERE p.user_id = $1::uuid AND p.is_learned
      GROUP BY q.category`,
    userId,
  );
  const learnedByCategory = new Map(learnedRows.map((row) => [row.category, Number(row.learned)]));

  return {
    dayStreak,
    weekActivity,
    learned: {
      // A country counts as learned for a category once it is learned in any
      // quiz type of that category (e.g. either capitals direction).
      countries: learnedByCategory.get('countries') ?? 0,
      capitals: learnedByCategory.get('capitals') ?? 0,
      flags: learnedByCategory.get('flags') ?? 0,
    },
    totalCountries: TOTAL_COUNTRIES,
  };
}

/**
 * Per-country learning state for one category — the drill-down behind a home
 * stat.
 *
 * `bool_or(is_learned)` is the same rule `loadSummary` counts with, so the
 * number of learned rows here cannot disagree with the number on the home
 * strip. That is the point of asking the database rather than recomputing the
 * threshold from the streaks: a category spans several quiz types (both
 * capitals directions, multiple choice and typing) and a country is learned
 * once any of them has it.
 *
 * Countries with no `progress` row are absent rather than returned as
 * not-learned: the caller has the full list of 195 already, and sending 195
 * rows of "nothing yet" to say the same thing would only add ways for the two
 * to disagree.
 */
export async function loadCategoryProgress(
  prisma: PrismaClient,
  userId: string,
  category: QuizCategory,
): Promise<CategoryProgress> {
  const rows = await prisma.$queryRawUnsafe<
    { country_id: number; learned: boolean; best_streak: number }[]
  >(
    `SELECT p.country_id, bool_or(p.is_learned) AS learned, MAX(p.current_streak) AS best_streak
       FROM progress p
       JOIN quiz_types q ON q.id = p.quiz_type_id
      WHERE p.user_id = $1::uuid AND q.category = $2
      GROUP BY p.country_id`,
    userId,
    category,
  );

  const countries: CountryProgress[] = rows.map((row) => ({
    countryId: Number(row.country_id),
    learned: row.learned,
    bestStreak: Number(row.best_streak),
  }));
  return { category, countries };
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return /^[A-Za-z0-9+\-_/]+$/.test(zone);
  } catch {
    return false;
  }
}

/** ISO `YYYY-MM-DD` for an instant in a given timezone. */
export function localDateParts(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function shiftDay(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive active days ending today — or ending yesterday, so that a streak
 * is still shown before the first answer of the day rather than reading zero.
 */
export function countStreak(activeDays: ReadonlySet<string>, today: string): number {
  let cursor = activeDays.has(today) ? today : shiftDay(today, -1);
  if (!activeDays.has(cursor)) {
    return 0;
  }
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** The seven days of the Monday-first week containing `today`. */
export function currentWeekDays(today: string): string[] {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay(); // 0 = Sunday
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = shiftDay(today, offsetToMonday);
  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
}
