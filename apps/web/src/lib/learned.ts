import { learnedThresholdForCategory } from '@cartomancer/shared';

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
   * see recordProgress (three in a row, reset by a wrong answer) and the recall
   * guess handler (one recall, and no wrong answer to reset it — an
   * unrecognised guess writes nothing at all).
   */
  explanation: string;
  /** The right-hand column, where the category has one. */
  detail?: 'capital';
}

/**
 * Every threshold is read from the taxonomy rather than written into the
 * sentence, so changing LEARNED_STREAK_THRESHOLD cannot leave the explanation
 * lying. Per category, not one shared constant: capitals and flags happen to
 * agree today, and a sentence that quotes the wrong category's number would be
 * a hard bug to spot.
 */
const streakSentence = (thing: string, category: LearnedCategory): string =>
  `A ${thing} counts as learned after you get it right ` +
  `${learnedThresholdForCategory(category)} times in a row, in either direction ` +
  'and typed or multiple choice. One wrong answer resets the streak and sends it ' +
  'back to “Not learned yet”.';

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
    explanation: streakSentence('capital', 'capitals'),
    detail: 'capital',
  },
  flags: {
    label: 'Flags learned',
    explanation: streakSentence('flag', 'flags'),
  },
};
