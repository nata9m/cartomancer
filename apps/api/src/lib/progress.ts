import {
  isLearnedInterval,
  nextSchedule,
  TOTAL_COUNTRIES,
  type AnswerQuality,
  type CategoryProgress,
  type CountryProgress,
  type ProgressSummary,
  type QuizCategory,
  type ReviewSummary,
  quizTypeByKey,
} from '@cartomancer/shared';
import type { PrismaClient } from '@cartomancer/db';
import type { Db } from './db.js';

export interface ProgressUpdate {
  currentStreak: number;
  isLearned: boolean;
  /** True when this answer is what moved the country into "learned". */
  newlyLearned: boolean;
  /** The review interval it now has, and when it is next due. */
  intervalDays: number;
  dueAt: Date;
  /** Days from this answer until it is due: 0 after a miss, which is "next round". */
  dueInDays: number;
}

/**
 * The client itself, as opposed to the one a transaction hands its callback.
 * `$connect` is the tell: the transaction client keeps `$transaction` at runtime
 * (it throws if used) but has no `$connect`, so testing for `$transaction` would
 * start a transaction inside a transaction and wait on a second connection.
 */
function isRootClient(db: Db): db is PrismaClient {
  return typeof (db as Partial<PrismaClient>).$connect === 'function';
}

/**
 * Applies one answer to a user's learning state (#50).
 *
 * The state is a review schedule, not a streak alone: an interval that stretches
 * with each success and collapses on a lapse, an ease factor that answer speed
 * nudges, and the moment the country is next due. The rules are in
 * `@cartomancer/shared`'s `nextSchedule`, which is pure; this is the part that
 * reads the row, applies them and writes the result. `is_learned` is never stored
 * independently: it is recomputed from the interval on every write, so it cannot
 * drift, and a lapse takes it away. `last_answered_at` is stamped either way.
 *
 * Read-modify-write, made safe by a row lock (#54). The schedule depends on the
 * previous interval and ease, so it cannot be one blind upsert the way the streak
 * was: two answers to the same country in flight together — two tabs, two
 * sessions — must each see the other's result. So the row is created if absent
 * (a no-op when it exists), locked with FOR UPDATE, read, and written back, and
 * the second writer waits for the first to commit and then reads what it wrote.
 * That needs a transaction to hold the lock across the three statements; when
 * given the bare client this opens one.
 */
export async function recordProgress(
  db: Db,
  options: {
    userId: string;
    quizTypeId: number;
    quizTypeKey: string;
    countryId: number;
    wasCorrect: boolean;
    /**
     * The player took the hint (#53). A correct answer with a hint is recorded
     * and shown as correct, but is no evidence of recall: see `nextSchedule`.
     */
    hintUsed?: boolean;
    /** From how long the answer took; `good` when that is unknown. */
    quality?: AnswerQuality;
    answeredAt?: Date;
  },
): Promise<ProgressUpdate> {
  if (isRootClient(db)) {
    return db.$transaction((tx) => recordProgress(tx, options));
  }

  const { userId, quizTypeId, quizTypeKey, countryId, wasCorrect } = options;
  const answeredAt = options.answeredAt ?? new Date();

  await db.$executeRawUnsafe(
    `INSERT INTO progress (user_id, country_id, quiz_type_id)
     VALUES ($1::uuid, $2::int, $3::int)
     ON CONFLICT (user_id, country_id, quiz_type_id) DO NOTHING`,
    userId,
    countryId,
    quizTypeId,
  );
  const rows = await db.$queryRawUnsafe<
    {
      current_streak: number;
      interval_days: number;
      ease: number;
      is_learned: boolean;
      learned_at: Date | null;
    }[]
  >(
    `SELECT current_streak, interval_days, ease, is_learned, learned_at
       FROM progress
      WHERE user_id = $1::uuid AND country_id = $2::int AND quiz_type_id = $3::int
        FOR UPDATE`,
    userId,
    countryId,
    quizTypeId,
  );
  const previous = rows[0];
  if (!previous) {
    throw new Error('progress row missing after insert');
  }

  const outcome = nextSchedule(
    {
      streak: Number(previous.current_streak),
      intervalDays: Number(previous.interval_days),
      ease: Number(previous.ease),
    },
    { wasCorrect, hintUsed: options.hintUsed, quality: options.quality ?? 'good' },
  );
  const isLearned = isLearnedInterval(quizTypeKey, outcome.intervalDays);
  const dueAt = new Date(answeredAt.getTime() + outcome.dueInDays * 86_400_000);
  // When it became learned, kept while it stays learned and cleared by a lapse.
  const learnedAt = isLearned ? (previous.is_learned ? previous.learned_at : answeredAt) : null;

  await db.$executeRawUnsafe(
    `UPDATE progress
        SET current_streak   = $4::int,
            interval_days    = $5::float8,
            ease             = $6::float8,
            is_learned       = $7::boolean,
            learned_at       = $8::timestamptz,
            last_answered_at = $9::timestamptz,
            due_at           = $10::timestamptz
      WHERE user_id = $1::uuid AND country_id = $2::int AND quiz_type_id = $3::int`,
    userId,
    countryId,
    quizTypeId,
    outcome.streak,
    outcome.intervalDays,
    outcome.ease,
    isLearned,
    learnedAt,
    answeredAt,
    dueAt,
  );

  return {
    currentStreak: outcome.streak,
    isLearned,
    newlyLearned: isLearned && !previous.is_learned,
    intervalDays: outcome.intervalDays,
    dueAt,
    dueInDays: outcome.dueInDays,
  };
}

/**
 * Countries that became learned during a session.
 *
 * Derived rather than stored: `learned_at` is stamped on the answer that made a
 * country learned and cleared by a lapse, and a country appears at most once per
 * session, so "learned since the session began" is exactly "learned in it".
 */
export async function newlyLearnedInSession(
  prisma: PrismaClient,
  options: {
    userId: string;
    quizTypeId: number;
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
      isLearned: true,
      learnedAt: { gte: options.since },
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
    review: await loadReview(prisma, userId),
  };
}

/** The most countries one review round asks about, the same as a normal round (#51). */
export const REVIEW_ROUND_SIZE = 20;

/**
 * Countries that need another go: asked at least once, and the last answer left
 * the streak at zero. A country never asked has no row and does not appear —
 * "review" is for what was seen and missed, not for what has not been met yet.
 *
 * Progress is per quiz type, and a round is of one quiz type, so this picks one:
 * the type with the most countries to review, the most recently missed on a tie.
 * Recall is left out; its rows are a different kind of thing and have no
 * question to ask again.
 */
export async function loadReview(
  prisma: PrismaClient,
  userId: string,
): Promise<ReviewSummary | null> {
  const rows = await prisma.$queryRawUnsafe<
    { key: string; country_id: number; last_answered_at: Date }[]
  >(
    `SELECT q.key, p.country_id, p.last_answered_at
       FROM progress p
       JOIN quiz_types q ON q.id = p.quiz_type_id
      WHERE p.user_id = $1::uuid
        AND p.current_streak = 0
        AND p.last_answered_at IS NOT NULL
        AND q.is_active
        AND q.format <> 'recall'
      ORDER BY p.last_answered_at DESC`,
    userId,
  );

  const byType = new Map<string, number[]>();
  for (const row of rows) {
    const list = byType.get(row.key);
    if (list) {
      list.push(row.country_id);
    } else {
      byType.set(row.key, [row.country_id]);
    }
  }

  // Rows arrive newest first, so on a tie the first type seen is the one with
  // the most recent miss, and a strict comparison keeps it.
  let best: { key: string; ids: number[] } | null = null;
  for (const [key, ids] of byType) {
    if (!quizTypeByKey(key)) continue;
    if (!best || ids.length > best.ids.length) {
      best = { key, ids };
    }
  }
  const definition = best ? quizTypeByKey(best.key) : undefined;
  if (!best || !definition) {
    return null;
  }
  return {
    count: best.ids.length,
    quizTypeKey: best.key,
    quizTypeName: definition.displayName,
    directionLabel: definition.directionLabel,
    countryIds: best.ids.slice(0, REVIEW_ROUND_SIZE),
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
