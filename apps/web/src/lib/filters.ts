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

/** Normalises the `?region=&difficulty=&count=` pair a screen was opened with. */
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

export function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.region !== ALL) {
    params.set('region', filters.region);
  }
  if (filters.difficulty !== ALL) {
    params.set('difficulty', filters.difficulty);
  }
  if (filters.questionCount) {
    params.set('count', filters.questionCount);
  }
  return params.toString();
}
