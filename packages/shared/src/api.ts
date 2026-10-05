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
  /**
   * Type-in formats only: `sha256(session salt + ':' + normalised form)` for the
   * canonical answer and every accepted alias, so the browser can recognise a
   * correct answer the moment it is typed without being told what it is (#69).
   * See `answer-hash.ts` — including what this does and does not protect.
   *
   * The server never consults these; it re-matches the submitted answer as it
   * always did. Absent means auto-accept is off, which is a degradation and
   * never a correctness problem.
   */
  answerHashes?: string[];
  /**
   * Type-in formats only: the optional hint, first letter plus letter count
   * ("K _ _ _ _ _ _ _ _ _"), see `answerHintFor` (#53). Telling the browser this
   * is no leak worth defending: the answer is, by definition, one the player
   * could be told, and the hashes above already let the browser check a guess.
   */
  answerHint?: string;
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
  /**
   * Salt for this payload's `answerHashes`, present for type-in formats only.
   * Generated per response rather than stored: the hashes travel with it, so
   * nothing has to match across two responses, and a rehydrated session simply
   * gets a new one.
   */
  answerSalt?: string;
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
  /**
   * How the answer was accepted, for future tuning/telemetry. `replay` is the
   * answer that was already recorded being reported again: a retried POST after
   * a lost response (#58), which re-reads rather than re-matches.
   */
  matchedBy: 'exact' | 'alias' | 'fuzzy' | 'none' | 'replay';
  /**
   * A wrong answer that nonetheless names a country exactly — "Austria" typed
   * for Australia, or Vienna typed for Canberra — carries that country's name,
   * so the reveal can say what was typed *is* something, just not this (#53).
   * Absent otherwise, and on a replay, which has no typed text to talk about.
   */
  matchedCountryName?: string;
  /** Null for guests — nothing is persisted, so there is no streak. */
  currentStreak: number | null;
  isLearned: boolean | null;
  /** True when this answer is what moved the country into "learned". */
  newlyLearned: boolean;
  /**
   * Spaced repetition (#50): days until this country is due for review again,
   * from this answer. 0 after a miss, when it is simply back next round. Absent
   * for guests, who have no schedule.
   */
  nextReviewInDays?: number;
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
   * Other names for the country ("Holland", "Burma"), and for its capital
   * ("Cape Town", "Praha"). Two lists since #35, so each can be both searched
   * and shown: printing a name alias says "also known as" and printing a
   * capital alias says "also", and neither can now claim Cape Town is another
   * name for South Africa.
   */
  nameAliases: string[];
  capitalAliases: string[];
  /** Searchable only: the famous city that is not the capital — see CountrySeed. */
  searchAliases: string[];
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
  /** Countries whose last answer was missed, ready to drill (#51); null when there are none. */
  review: ReviewSummary | null;
}

/**
 * What a "needs review" round would be. Progress is per quiz type, so a review
 * round is too: this is the quiz type with the most countries to review (the
 * most recently missed one on a tie), and `countryIds` are up to a round's worth
 * of them, most recently missed first.
 */
export interface ReviewSummary {
  /** How many countries need review in `quizTypeKey`, which can exceed `countryIds`. */
  count: number;
  quizTypeKey: string;
  quizTypeName: string;
  directionLabel: string;
  countryIds: number[];
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

/**
 * The two facts a country's detail page needs that the repo does not already
 * hold, keyed by ISO code in `country-details.ts`. Capitals, flags, regions and
 * the trivia clues are all in `countries.ts` and `facts.ts` already.
 *
 * Generated from published datasets rather than typed by hand — see the header
 * of `scripts/fetch-country-details.mjs` for which field comes from where and
 * what each one's licence asks for.
 */
export interface CountryDetail {
  isoCode: string;
  population: number;
  /** The year the figure is for; null where the source publishes none. */
  populationYear: number | null;
  languages: string[];
}

/**
 * What the account page knows about the signed-in player (#61), from
 * `GET /api/me`. `name` is the one thing a player may change; the rest is the
 * identity the provider vouched for.
 *
 * `name` is null when the player has none — a provider that supplied none, or
 * one cleared back to nothing — and the screens then fall back to the local part
 * of the email rather than showing a blank.
 */
export interface UserProfile {
  email: string;
  name: string | null;
  /** The provider's avatar URL; absent for providers that have none. */
  image: string | null;
  /** `google` | `apple`, or `pending` for the instant before the account links. */
  authProvider: string;
  /** ISO timestamp; null only for a row created before the column was filled. */
  createdAt: string | null;
}

/** `PATCH /api/me`. Only `name` is writable; null clears it. */
export interface UpdateProfileRequest {
  name: string | null;
}

export interface ApiError {
  error: string;
  message: string;
}
