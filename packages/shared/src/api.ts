import type { Difficulty, QuizCategory, QuizDirection, QuizFormat, Region } from './taxonomy.js';

/** `'all'` is the wire representation of "no filter" for both filters. */
export const ALL_FILTER = 'all' as const;
export type RegionFilter = Region | typeof ALL_FILTER;
export type DifficultyFilter = Difficulty | typeof ALL_FILTER;

export interface QuizTypeSummary {
  key: string;
  category: QuizCategory;
  format: QuizFormat;
  direction: QuizDirection;
  displayName: string;
  directionLabel: string;
  description: string;
}

export interface QuizOption {
  /** Stable within a question; used only for client-side highlighting. */
  id: string;
  /** Text shown on the option row, or the caption under a flag tile. */
  label: string;
  /** Present when the option renders as a flag (country → flag). */
  isoCode?: string;
}

export interface QuizQuestion {
  sequence: number;
  countryId: number;
  /** Present for trivia questions; identifies the clue for rotation tracking. */
  factId?: number;
  /** Small muted line above the prompt, e.g. "Capital of". */
  promptLabel: string;
  /** Main prompt text: a country name, a capital name, or a trivia clue. */
  promptText: string;
  /** Present when the prompt renders as a flag (flag → country). */
  promptIsoCode?: string;
  /** Absent for type-in and recall formats. */
  options?: QuizOption[];
}

export interface QuizSession {
  id: string;
  quizType: QuizTypeSummary;
  regionFilter: RegionFilter;
  difficultyFilter: DifficultyFilter;
  questionCount: number;
  questions: QuizQuestion[];
  /** True when nothing about this session is persisted (guest play). */
  isGuest: boolean;
}

export interface StartSessionRequest {
  quizTypeKey: string;
  region?: RegionFilter;
  difficulty?: DifficultyFilter;
  questionCount?: number;
  /** Guest-only: fact IDs already seen, for clue rotation without a server session. */
  excludeFactIds?: number[];
}

export interface AnswerRequest {
  sequence: number;
  /** The typed text, or the chosen option's label. */
  answer: string;
  timeTakenMs?: number;
}

export interface AnswerResult {
  wasCorrect: boolean;
  /** Canonical correct answer, for the reveal row / results list. */
  correctAnswer: string;
  correctCountryId: number;
  correctCountryName: string;
  correctIsoCode: string;
  /** How the answer was accepted, for future tuning/telemetry. */
  matchedBy: 'exact' | 'alias' | 'fuzzy' | 'none';
  /** Null for guests — nothing is persisted, so there is no streak. */
  currentStreak: number | null;
  isLearned: boolean | null;
  /** True when this answer is what pushed the country over the threshold. */
  newlyLearned: boolean;
}

/**
 * One question that was answered wrongly, as the results screen shows it: the
 * question *and* the answer.
 *
 * `promptText` is why this carries more than the country: for every
 * `*_to_country` quiz the expected answer IS the country name, so a row built
 * from the country alone said "Brazil — Brazil" and hid what was actually
 * asked. It is the same string the question carried (see `QuizQuestion`) —
 * the country, the capital, or the trivia clue — and it is empty for
 * flag → country, where the question was a picture and the row shows the flag.
 */
export interface MissedQuestion {
  /**
   * The question's place in the round, and the row's key. Not `countryId`:
   * a country is unique per session today only because `session_answers` is
   * keyed that way, which is a storage detail rather than a promise.
   */
  sequence: number;
  countryId: number;
  countryName: string;
  isoCode: string;
  /** The question as it was asked, in text. Empty when it was a flag. */
  promptText: string;
  /** The answer that was expected (a capital or a country name). */
  correctAnswer: string;
}

export interface SessionResults {
  sessionId: string;
  quizType: QuizTypeSummary;
  /** Echoed so the results screen's "Play again" can reuse them. */
  regionFilter: RegionFilter;
  difficultyFilter: DifficultyFilter;
  score: number;
  total: number;
  percentCorrect: number;
  /** Empty for guests: no persisted streaks means nothing can be newly learned. */
  newlyLearned: { countryId: number; countryName: string }[];
  missed: MissedQuestion[];
  /** Null for guests. */
  dayStreak: number | null;
  isGuest: boolean;
}

export interface RecallSession {
  id: string;
  region: RegionFilter;
  /** How many countries are in scope — the denominator on the recall screens. */
  totalInRegion: number;
  isGuest: boolean;
}

export interface RecallGuessRequest {
  guess: string;
  /**
   * Guest play only: the client owns the recalled list (nothing is persisted),
   * so it tells the API what it already has in order to get `duplicate` right.
   * Ignored for signed-in sessions, where the server knows.
   */
  alreadyRecalledCountryIds?: number[];
}

export interface RecallGuessResult {
  /** True only for a correct, not-yet-recalled country. */
  accepted: boolean;
  /** Set when the guess matched a country already recalled this session. */
  duplicate: boolean;
  country: { id: number; name: string; isoCode: string } | null;
  recalledCount: number;
}

export interface RecallResults {
  sessionId: string;
  region: RegionFilter;
  totalInRegion: number;
  recalled: { id: number; name: string; isoCode: string }[];
  missed: { id: number; name: string; isoCode: string }[];
  isGuest: boolean;
}

/** Stateless answer check used by guest play, where no session exists. */
export interface AnswerCheckRequest {
  quizTypeKey: string;
  countryId: number;
  answer: string;
}

export interface CountryRef {
  id: number;
  name: string;
  isoCode: string;
  capital: string;
  region: Region;
  difficulty: Difficulty;
  /**
   * Accepted alternatives, for searching rather than showing: the column holds
   * both other country names ("Holland") and the second capital of states that
   * have one ("Cape Town"), with nothing to tell them apart — see the alias
   * note in the README. Matching on all of them is right for a lookup box;
   * printing them as "also known as" would call Cape Town another name for
   * South Africa.
   */
  aliases: string[];
}

export interface ProgressSummary {
  /** Consecutive days with at least one answered question, ending today. */
  dayStreak: number;
  /** Monday-first, seven entries; `true` where the user answered something. */
  weekActivity: boolean[];
  learned: {
    countries: number;
    capitals: number;
    flags: number;
  };
  totalCountries: number;
}

/**
 * One country's state within a category, from `GET /api/progress/:category`.
 *
 * Only countries the user has answered at least once appear: a country with no
 * `progress` row has nothing to say beyond "not learned", which the caller
 * already knows from the full country list. So the learned lists build their
 * "not learned yet" section from the 195 rather than from this response.
 */
export interface CountryProgress {
  countryId: number;
  /** True when any quiz type in the category has it learned — the api's rule. */
  learned: boolean;
  /**
   * Best current streak across the category's quiz types, for showing how close
   * an unlearned country is. Answering wrongly resets it, so this is progress
   * towards the threshold, never a total of correct answers.
   */
  bestStreak: number;
}

export interface CategoryProgress {
  category: QuizCategory;
  countries: CountryProgress[];
}

export interface ApiError {
  error: string;
  message: string;
}
