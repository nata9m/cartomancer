/**
 * Spaced repetition for the learned state (#50).
 *
 * A country used to be "learned" after three correct answers in a row and stayed
 * learned until a wrong answer, so something learned months ago was only asked
 * again when the least-recently-seen cursor happened to reach it, and "learned"
 * never expired. Now each (country, quiz type) carries a review interval that
 * stretches with every success and collapses on a lapse, and the country is due
 * when that interval has run out. A simplified SM-2:
 *
 *   - the first success schedules a review in 1 day, the second in 6, and from
 *     then each interval is the last one times an ease factor (2.5 to start);
 *   - how quickly the answer came nudges the ease: a fast answer widens future
 *     gaps, a slow one narrows them, because slow-but-right is not the same as
 *     known (`session_answers.time_taken_ms` was captured and unused until now);
 *   - a wrong answer resets the interval to nothing (due immediately) and costs
 *     ease;
 *   - a correct answer taken *with the hint* (#53) is not evidence of recall, so
 *     it leaves the interval and the streak alone, brings it back in a day, and
 *     costs a little ease.
 *
 * "Learned" is an interval of at least `LEARNED_INTERVAL_DAYS`. With the default
 * ease that is the third unhinted success in a row (1, 6, 15 days), so the rule
 * feels the same on the way in; the difference is that it is a property of
 * *retention*, and that a lapse takes it away.
 *
 * Pure and dependency-free: the api applies it inside a row lock, and the
 * numbers here are what the tests pin.
 */
import { QUIZ_TYPES, quizTypeByKey, type QuizCategory } from './taxonomy.js';

export const EASE_DEFAULT = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 3;

/** The review interval at which a country counts as learned. */
export const LEARNED_INTERVAL_DAYS = 14;
/**
 * Active recall has no interval to stretch: one successful recall is the whole
 * claim ("name every country in a region"), so its first success, a 1-day
 * interval, is enough.
 */
export const RECALL_LEARNED_INTERVAL_DAYS = 1;

export function learnedIntervalDaysFor(quizTypeKey: string): number {
  return quizTypeByKey(quizTypeKey)?.format === 'recall'
    ? RECALL_LEARNED_INTERVAL_DAYS
    : LEARNED_INTERVAL_DAYS;
}

/**
 * The interval a country has to reach to count as learned in a whole category,
 * for screens that explain the rule rather than apply it (`is_learned` is stored
 * per quiz type and a category is `bool_or` over those). Derived from the
 * category's quiz types, so adding one keeps the copy honest: `countries` is
 * recall alone, everything else is the long interval. If a category ever mixed
 * the two this returns the strictest, which is the number the explanation should
 * quote.
 */
export function learnedIntervalDaysForCategory(category: QuizCategory): number {
  const intervals = QUIZ_TYPES.filter((type) => type.category === category).map((type) =>
    learnedIntervalDaysFor(type.key),
  );
  return intervals.length === 0 ? LEARNED_INTERVAL_DAYS : Math.max(...intervals);
}

/** How the answer felt: derived from how long it took. */
export type AnswerQuality = 'easy' | 'good' | 'hard';

/** Seconds beyond which a correct answer reads as quick, and as slow, per format. */
const TIMING_MS = {
  /** Tapping one of four options, or a spot on a map. */
  tap: { easy: 3_000, hard: 12_000 },
  /** Typing a whole word costs seconds that are not hesitation. */
  typed: { easy: 8_000, hard: 20_000 },
} as const;

/**
 * Fast is easy and slow is hard. Without a time (older clients, replays) the
 * answer is simply good: no signal is not a bad signal.
 */
export function qualityFromTime(
  format: string,
  timeTakenMs: number | null | undefined,
): AnswerQuality {
  if (timeTakenMs === null || timeTakenMs === undefined || !Number.isFinite(timeTakenMs)) {
    return 'good';
  }
  const limits = format === 'type_in' ? TIMING_MS.typed : TIMING_MS.tap;
  if (timeTakenMs <= limits.easy) return 'easy';
  if (timeTakenMs >= limits.hard) return 'hard';
  return 'good';
}

const EASE_DELTA: Record<AnswerQuality, number> = { easy: 0.1, good: 0, hard: -0.15 };
const LAPSE_EASE_PENALTY = 0.2;
const HINT_EASE_PENALTY = 0.15;

export interface ScheduleState {
  /** Consecutive unhinted successes. */
  streak: number;
  intervalDays: number;
  ease: number;
}

export interface ScheduleOutcome extends ScheduleState {
  /** When the country is next due, in days from now: 0 means straight away. */
  dueInDays: number;
}

export const NEW_SCHEDULE: ScheduleState = { streak: 0, intervalDays: 0, ease: EASE_DEFAULT };

const clampEase = (ease: number): number => Math.min(EASE_MAX, Math.max(EASE_MIN, ease));
/** One decimal is plenty for a count of days, and keeps stored values readable. */
const round1 = (value: number): number => Math.round(value * 10) / 10;
/** Two for the ease, so a 0.15 step is a 0.15 step and not rounded into a 0.1 or a 0.2. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

export function nextSchedule(
  previous: ScheduleState,
  answer: { wasCorrect: boolean; hintUsed?: boolean; quality: AnswerQuality },
): ScheduleOutcome {
  if (!answer.wasCorrect) {
    return {
      streak: 0,
      intervalDays: 0,
      ease: round2(clampEase(previous.ease - LAPSE_EASE_PENALTY)),
      dueInDays: 0,
    };
  }

  if (answer.hintUsed) {
    return {
      streak: previous.streak,
      intervalDays: previous.intervalDays,
      ease: round2(clampEase(previous.ease - HINT_EASE_PENALTY)),
      dueInDays: 1,
    };
  }

  const streak = previous.streak + 1;
  const ease = round2(clampEase(previous.ease + EASE_DELTA[answer.quality]));
  const intervalDays =
    streak === 1
      ? 1
      : streak === 2
        ? 6
        : Math.max(previous.intervalDays + 1, round1(previous.intervalDays * ease));
  return { streak, intervalDays, ease, dueInDays: intervalDays };
}

export function isLearnedInterval(quizTypeKey: string, intervalDays: number): boolean {
  return intervalDays >= learnedIntervalDaysFor(quizTypeKey);
}
