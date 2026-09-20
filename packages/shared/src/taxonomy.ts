/**
 * Quiz taxonomy.
 *
 * Adding a quiz type is meant to be a data change, not a code change: a row in
 * `quiz_types` (key/category/display_name/format) plus an entry here describing
 * the prompt/answer direction. Rendering branches on `category` + `format`
 * (+ `direction` for the two-way categories), never on the individual key.
 */

export const REGIONS = ['Africa', 'Asia', 'Europe', 'Americas', 'Oceania'] as const;
export type Region = (typeof REGIONS)[number];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUIZ_CATEGORIES = ['capitals', 'flags', 'countries', 'trivia'] as const;
export type QuizCategory = (typeof QUIZ_CATEGORIES)[number];

export const QUIZ_FORMATS = ['multiple_choice', 'type_in', 'recall'] as const;
export type QuizFormat = (typeof QUIZ_FORMATS)[number];

/**
 * Which way round the question is asked. `country_to_x` means the country is
 * the prompt and the attribute is the answer; `x_to_country` is the reverse.
 * `none` covers formats where the notion doesn't apply (recall).
 */
export const QUIZ_DIRECTIONS = ['country_to_attribute', 'attribute_to_country', 'none'] as const;
export type QuizDirection = (typeof QUIZ_DIRECTIONS)[number];

export interface QuizTypeDefinition {
  key: string;
  category: QuizCategory;
  format: QuizFormat;
  displayName: string;
  /** Sub-heading used on the mode pickers and results screens. */
  directionLabel: string;
  direction: QuizDirection;
  /** One-liner shown under the title on mode-picker cards. */
  description: string;
  isActive: boolean;
}

export const QUIZ_TYPES: readonly QuizTypeDefinition[] = [
  {
    key: 'capitals-c2cap-mc',
    category: 'capitals',
    format: 'multiple_choice',
    displayName: 'Capitals',
    directionLabel: 'Country → capital',
    direction: 'country_to_attribute',
    description: 'Pick the capital city of the country shown',
    isActive: true,
  },
  {
    key: 'capitals-cap2c-mc',
    category: 'capitals',
    format: 'multiple_choice',
    displayName: 'Capitals',
    directionLabel: 'Capital → country',
    direction: 'attribute_to_country',
    description: 'Pick the country a capital belongs to',
    isActive: true,
  },
  {
    key: 'capitals-c2cap-type',
    category: 'capitals',
    format: 'type_in',
    displayName: 'Capitals',
    directionLabel: 'Country → capital',
    direction: 'country_to_attribute',
    description: 'Type the capital city of the country shown',
    isActive: true,
  },
  {
    key: 'capitals-cap2c-type',
    category: 'capitals',
    format: 'type_in',
    displayName: 'Capitals',
    directionLabel: 'Capital → country',
    direction: 'attribute_to_country',
    description: 'Type the country a capital belongs to',
    isActive: true,
  },
  {
    key: 'flags-flag2c-mc',
    category: 'flags',
    format: 'multiple_choice',
    displayName: 'Flags',
    directionLabel: 'Flag → country',
    direction: 'attribute_to_country',
    description: 'Pick the country a flag belongs to',
    isActive: true,
  },
  {
    key: 'flags-c2flag-mc',
    category: 'flags',
    format: 'multiple_choice',
    displayName: 'Flags',
    directionLabel: 'Country → flag',
    direction: 'country_to_attribute',
    description: 'Pick the flag of the country shown',
    isActive: true,
  },
  {
    key: 'flags-flag2c-type',
    category: 'flags',
    format: 'type_in',
    displayName: 'Flags',
    directionLabel: 'Flag → country',
    direction: 'attribute_to_country',
    description: 'Type the country a flag belongs to',
    isActive: true,
  },
  {
    key: 'countries-recall',
    category: 'countries',
    format: 'recall',
    displayName: 'Countries',
    directionLabel: 'Active recall',
    direction: 'none',
    description: 'Name as many countries as you can from a region',
    isActive: true,
  },
  {
    key: 'trivia-fact2c-type',
    category: 'trivia',
    format: 'type_in',
    displayName: 'Fun facts',
    directionLabel: 'Fact → country',
    direction: 'attribute_to_country',
    description: 'Guess the country from a clue',
    isActive: true,
  },
] as const;

export const QUIZ_TYPES_BY_KEY: Readonly<Record<string, QuizTypeDefinition>> = Object.fromEntries(
  QUIZ_TYPES.map((t) => [t.key, t]),
);

export function quizTypeByKey(key: string): QuizTypeDefinition | undefined {
  return QUIZ_TYPES_BY_KEY[key];
}

/** Quiz-type keys grouped per home-screen card. */
export const CATEGORY_CARDS: readonly {
  category: QuizCategory;
  title: string;
  description: string;
  /** Tabler icon name, matching the design mockups. */
  icon: 'building-bank' | 'map' | 'flag' | 'bulb';
  /** Route tapped from the home screen. */
  href: string;
}[] = [
  {
    category: 'capitals',
    title: 'Capitals',
    description: 'Match countries with their capital cities',
    icon: 'building-bank',
    href: '/capitals',
  },
  {
    category: 'countries',
    title: 'Countries',
    description: 'Recall every country in a region from memory',
    icon: 'map',
    href: '/countries',
  },
  {
    category: 'flags',
    title: 'Flags',
    description: 'Learn the flag of every country',
    icon: 'flag',
    href: '/flags',
  },
  {
    category: 'trivia',
    title: 'Fun facts',
    description: 'Guess the country from a clue',
    icon: 'bulb',
    href: '/trivia',
  },
] as const;

/** Question-count options offered by the trivia quiz (and reused elsewhere). */
export const QUESTION_COUNT_OPTIONS = [10, 20, 30] as const;
export const DEFAULT_QUESTION_COUNT = 20;

/** 3 correct answers in a row marks a country learned… */
export const LEARNED_STREAK_THRESHOLD = 3;
/** …except active recall, where one successful recall is enough. */
export const RECALL_LEARNED_STREAK_THRESHOLD = 1;

export function learnedThresholdFor(quizTypeKey: string): number {
  return quizTypeByKey(quizTypeKey)?.format === 'recall'
    ? RECALL_LEARNED_STREAK_THRESHOLD
    : LEARNED_STREAK_THRESHOLD;
}

/**
 * pg_trgm similarity floor for fuzzy answer matching. Exact (case-insensitive)
 * matches against the canonical name/capital or a hand-seeded alias are tried
 * first; this only governs the typo fallback. 0.45 sits in the middle of the
 * 0.4–0.5 band the brief calls for: it forgives a transposed or missing letter
 * in a medium-length name without letting "Niger" match "Nigeria".
 */
export const FUZZY_MATCH_THRESHOLD = 0.45;

export const TOTAL_COUNTRIES = 195;
