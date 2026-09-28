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
}

export const ALL = 'all';

/**
 * Normalises the `?region=&difficulty=&count=` a screen was opened with.
 *
 * `?mode=` is not read: Fun facts picks its mode by tapping a card now, like
 * Capitals and Flags (#49), so a link still carrying the chip's parameter from
 * #42 opens the same screen as one without it.
 */
export function readFilters(
  params: Record<string, string | string[] | undefined>,
): Filters {
  const pick = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value) ?? ALL;
  return {
    region: pick(params.region),
    difficulty: pick(params.difficulty),
    questionCount: pick(params.count) === ALL ? '' : pick(params.count),
  };
}
