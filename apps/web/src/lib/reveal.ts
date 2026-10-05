import type { AnswerResult } from '@cartomancer/shared';

/**
 * What a screen reader says when an answer is revealed (#56).
 *
 * The reveal is visual — an option turns green, a row appears — and none of that
 * is announced on its own, so a player using a screen reader had to hunt the page
 * for what had just happened. This is the sentence read out instead, through a
 * polite live region, so the result arrives without anyone having to look for it.
 *
 * The correct answer is always included, not only when the player was wrong: for
 * a typed answer it is the canonical spelling ("Kyiv" when "Kiev" was accepted),
 * and for a tapped option it confirms which one it was.
 */
export function revealAnnouncement(
  result: Pick<
    AnswerResult,
    'wasCorrect' | 'correctAnswer' | 'correctCountryName' | 'currentStreak' | 'newlyLearned'
  >,
): string {
  const verdict = result.wasCorrect
    ? `Correct, ${result.correctAnswer}.`
    : `Wrong. The answer is ${result.correctAnswer}.`;
  if (!result.newlyLearned) {
    return verdict;
  }
  const streak = result.currentStreak ? `, ${result.currentStreak} in a row` : '';
  return `${verdict} ${result.correctCountryName} is now learned${streak}.`;
}

/**
 * "See you again in 6 days": the spaced-repetition schedule made visible (#50),
 * shown after a correct answer. A value under a day is the hint's one-day
 * reminder or a country that is simply back next round.
 */
export function nextReviewText(days: number): string {
  if (days <= 1) return 'Next review tomorrow';
  const rounded = Math.round(days);
  if (rounded >= 14 && rounded % 7 === 0) {
    const weeks = rounded / 7;
    return `Next review in ${weeks} weeks`;
  }
  return `Next review in ${rounded} days`;
}
