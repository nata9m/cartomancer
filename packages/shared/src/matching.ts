/**
 * Answer normalisation shared by the API (the exact-match pass that runs before
 * the pg_trgm fallback) and the web app (local duplicate detection during
 * recall).
 *
 * Deliberately conservative: case, accents, punctuation and article noise are
 * folded away, nothing else. Anything looser than this is the fuzzy pass's job.
 *
 * This must stay in lockstep with the `cartomancer_normalize()` SQL function
 * (migration 0002) — `pnpm --filter @cartomancer/db verify:matching` asserts the
 * two agree over every seeded name, capital and alias.
 */

/**
 * Letters that NFD decomposition leaves alone because they are distinct
 * letters rather than a base plus a combining mark (ø, đ, ł, ß …). The SQL
 * function folds these via translate(), so TS has to as well.
 */
const STANDALONE_LETTER_FOLDING: readonly [RegExp, string][] = [
  [/ß/g, 'ss'],
  [/[æ]/g, 'a'],
  [/[øœ]/g, 'o'],
  [/[đðď]/g, 'd'],
  [/[łŀ]/g, 'l'],
  [/[þ]/g, 't'],
  [/[ıĳ]/g, 'i'],
  [/[ħ]/g, 'h'],
  [/[ŧ]/g, 't'],
];

export function normalizeAnswer(input: string): string {
  let value = input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const [pattern, replacement] of STANDALONE_LETTER_FOLDING) {
    value = value.replace(pattern, replacement);
  }
  return value
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function answersMatchExactly(a: string, b: string): boolean {
  const left = normalizeAnswer(a);
  return left.length > 0 && left === normalizeAnswer(b);
}
