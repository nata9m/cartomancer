import { learnedIntervalDaysForCategory } from '@cartomancer/shared';

/**
 * The three categories with a stat on the home strip, and what each learned
 * list says about itself.
 *
 * Trivia is missing on purpose: it tracks progress like the rest, but the home
 * screen shows no "Fun facts learned" tile, so there is nothing to tap through
 * from and no list to land on. The api endpoint takes any category, so adding
 * the tile later is a change here and in StatsStrip, not in the api.
 *
 * Deliberately free of a 'use client' / 'server-only' marker, like lib/filters:
 * the learned screens are server components and StatsStrip is rendered from one,
 * but nothing here should stop a client component importing it later.
 */
export const LEARNED_CATEGORIES = ['countries', 'capitals', 'flags'] as const;
export type LearnedCategory = (typeof LEARNED_CATEGORIES)[number];

export function learnedHref(category: LearnedCategory): string {
  return `/learned/${category}`;
}

export function parseLearnedCategory(value: string): LearnedCategory | undefined {
  return (LEARNED_CATEGORIES as readonly string[]).includes(value)
    ? (value as LearnedCategory)
    : undefined;
}

interface LearnedCopy {
  /** Home strip label and, with the count, the list's own heading. */
  label: string;
  /**
   * What "learned" means here, at most two sentences, and true of the code:
   * see recordProgress (a review interval of two weeks, reset by a wrong answer) and the recall
   * guess handler (one recall, and no wrong answer to reset it — an
   * unrecognised guess writes nothing at all).
   */
  explanation: string;
  /** The right-hand column, where the category has one. */
  detail?: 'capital';
}

/**
 * The interval is read from the taxonomy rather than written into the sentence,
 * so changing LEARNED_INTERVAL_DAYS cannot leave the explanation lying. Per
 * category, not one shared constant: a sentence that quotes the wrong category's
 * number would be a hard bug to spot.
 */
const spacedSentence = (thing: string, category: LearnedCategory): string => {
  const weeks = learnedIntervalDaysForCategory(category) / 7;
  return (
    `A ${thing} counts as learned once you can hold it for ${weeks} weeks: each time you ` +
    'get it right it comes back later, and when the gap reaches that long it is learned, ' +
    'in either direction and typed or multiple choice. A wrong answer brings it back at ' +
    'once and sends it back to “Not learned yet”.'
  );
};

export const LEARNED_COPY: Record<LearnedCategory, LearnedCopy> = {
  countries: {
    label: 'Countries learned',
    explanation:
      'A country counts as learned once you have named it in a Countries round. ' +
      'Nothing takes it away — a round never marks a country wrong, it just ' +
      'leaves it unnamed.',
  },
  capitals: {
    label: 'Capitals learned',
    explanation: spacedSentence('capital', 'capitals'),
    detail: 'capital',
  },
  flags: {
    label: 'Flags learned',
    explanation: spacedSentence('flag', 'flags'),
  },
};
