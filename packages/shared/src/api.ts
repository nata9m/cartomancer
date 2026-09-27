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

export interface MissedQuestion {
  countryId: number;
  countryName: string;
  isoCode: string;
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

export interface ApiError {
  error: string;
  message: string;
}
