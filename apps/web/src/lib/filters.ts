/**
 * Region/difficulty/questionCount filter helpers.
 *
 * Deliberately free of a 'use client' / 'server-only' marker: the server
 * components read the filters off the URL and the client components turn them
 * back into query strings, so both sides import from here.
 */
export interface Filters {
  region: string;
  difficulty: string;
  questionCount: string;
  /**
   * Which way a game with two of them is played. Only Fun facts has a chip for
   * it today (#42); every other screen leaves it at the default and ignores it.
   * It is not sent to the api — the quiz type key is what carries the format.
   */
  mode: QuizMode;
}

/** Multiple choice leads: it is the gentler way in, and the app's default. */
export const QUIZ_MODES = ['mc', 'type'] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];
export const DEFAULT_MODE: QuizMode = 'mc';

export const ALL = 'all';

/** Normalises the `?region=&difficulty=&count=&mode=` a screen was opened with. */
export function readFilters(
  params: Record<string, string | string[] | undefined>,
): Filters {
  const pick = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value) ?? ALL;
  const mode = pick(params.mode);
  return {
    region: pick(params.region),
    difficulty: pick(params.difficulty),
    questionCount: pick(params.count) === ALL ? '' : pick(params.count),
    mode: (QUIZ_MODES as readonly string[]).includes(mode) ? (mode as QuizMode) : DEFAULT_MODE,
  };
}
