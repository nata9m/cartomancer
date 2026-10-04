/**
 * The hint a type-in question offers (#53): the first letter and how many
 * letters there are, as "K _ _ _ _ _ _ _ _ _".
 *
 * Letters and digits become underscores after the first, and everything else
 * (hyphens, apostrophes, full stops) is kept as written — "Côte d'Ivoire" is
 * only guessable if the apostrophe is visible. Words are separated by a wider
 * gap than letters are, so "New Zealand" reads as two words. Callers must
 * render it with `white-space: pre` or the gap collapses.
 *
 * It is built from the canonical answer only, never an alias: the hint should
 * describe what the reveal will show.
 */
export function answerHintFor(answer: string): string {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  let first = true;
  return words
    .map((word) =>
      [...word]
        .map((char) => {
          if (!/[\p{L}\p{N}]/u.test(char)) {
            return char;
          }
          if (first) {
            first = false;
            return char;
          }
          return '_';
        })
        .join(' '),
    )
    .join('   ');
}
