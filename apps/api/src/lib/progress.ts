import { learnedThresholdFor, TOTAL_COUNTRIES, type ProgressSummary } from '@cartomancer/shared';
import type { PrismaClient } from '@cartomancer/db';

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
 */
export async function recordProgress(
  prisma: PrismaClient,
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

  const existing = await prisma.progress.findUnique({
    where: { userId_countryId_quizTypeId: { userId, countryId, quizTypeId } },
  });

  const previousStreak = existing?.currentStreak ?? 0;
  const previouslyLearned = previousStreak >= threshold;
  const currentStreak = wasCorrect ? previousStreak + 1 : 0;
  const isLearned = currentStreak >= threshold;

  await prisma.progress.upsert({
    where: { userId_countryId_quizTypeId: { userId, countryId, quizTypeId } },
    create: { userId, countryId, quizTypeId, currentStreak, isLearned, lastAnsweredAt: answeredAt },
    update: { currentStreak, isLearned, lastAnsweredAt: answeredAt },
  });

  return { currentStreak, isLearned, newlyLearned: isLearned && !previouslyLearned };
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
 * caller's timezone (the web app passes the browser's), defaulting to UTC.
 */
export async function loadSummary(
  prisma: PrismaClient,
  userId: string,
  timeZone = 'UTC',
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

  const today = localDateParts(new Date(), zone);
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

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return /^[A-Za-z0-9+\-_/]+$/.test(zone);
  } catch {
    return false;
  }
}

/** ISO `YYYY-MM-DD` for an instant in a given timezone. */
function localDateParts(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function shiftDay(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive active days ending today — or ending yesterday, so that a streak
 * is still shown before the first answer of the day rather than reading zero.
 */
function countStreak(activeDays: ReadonlySet<string>, today: string): number {
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
function currentWeekDays(today: string): string[] {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay(); // 0 = Sunday
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = shiftDay(today, offsetToMonday);
  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
}
