'use client';

import type { QuizQuestion } from '@cartomancer/shared';

/**
 * Where a country's artwork lives, and how to have it on hand before it is
 * needed. Both live here so a preload can never warm a URL the <img> then
 * misses — see scripts/vendor-flags.mjs for where the files come from.
 */
export const flagSrc = (isoCode: string): string => `/flag-art/${isoCode.toLowerCase()}.svg`;

/**
 * URLs already requested this tab, so a flag is fetched once however many
 * questions or rounds show it. If the browser has since evicted one from its
 * HTTP cache we skip it and it loads at render, which is only where we started.
 */
const requested = new Set<string>();

/**
 * Starts the downloads a question will need, without rendering anything.
 *
 * A flag <img> only begins fetching when it is rendered, so until now every
 * question's artwork arrived a round-trip after the question itself — measured
 * at 160-500ms on a Slow 4G link, worst for Country → flag, where four flags
 * land at once and a few carry detailed coats of arms (ec.svg is 177KB). Called
 * a question ahead, the fetch happens while the player is reading the question
 * they are on, and the next one paints from cache.
 *
 * A bare Image() is the whole mechanism: it fills the same HTTP cache the real
 * <img> reads from, with no element to position, hide, or keep out of the
 * accessibility tree — and none of `<link rel=preload>`'s "preloaded but not
 * used" console warnings when a player leaves the question open.
 */
export function preloadQuestionFlags(question: QuizQuestion | undefined): void {
  // Called from effects and handlers, never while rendering, but this keeps the
  // helper safe to call from anywhere.
  if (typeof window === 'undefined' || !question) return;

  const codes = [question.promptIsoCode, ...(question.options ?? []).map((o) => o.isoCode)];
  for (const code of codes) {
    if (!code) continue;
    const src = flagSrc(code);
    if (requested.has(src)) continue;
    requested.add(src);
    new Image().src = src;
  }
}
