/**
 * Answer normalisation shared by the API (exact-match pass before the pg_trgm
 * fallback) and the web app (local duplicate detection during recall).
 *
 * Deliberately conservative: case, accents, punctuation and article noise are
 * stripped, nothing else. Everything looser than this is the fuzzy pass's job.
 */
export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[.,'’`´"()\-_/]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function answersMatchExactly(a: string, b: string): boolean {
  return normalizeAnswer(a) === normalizeAnswer(b) && normalizeAnswer(a).length > 0;
}
