import type { AnswerResult } from '@cartomancer/shared';

/** A run of the note's text, `emphasis` where the mockup italicises a name. */
export interface FeedbackPart {
  text: string;
  emphasis?: boolean;
}

export interface TypeInFeedback {
  kind: 'close' | 'other' | 'hinted';
  parts: FeedbackPart[];
}

type FeedbackResult = Pick<
  AnswerResult,
  'wasCorrect' | 'matchedBy' | 'correctAnswer' | 'matchedCountryName'
>;

/**
 * The line under a type-in reveal that says more than right or wrong (#53).
 * The matcher already knew these things; the screen used to throw them away.
 *
 * - Accepted by fuzzy match: "Close — you typed *Kyrgistan*, it's spelled
 *   *Kyrgyzstan*". Aliases are not noted: "USA" is simply right.
 * - Wrong, and the typed capital belongs to another country: "*Vienna* is the
 *   capital of *Austria* — the answer was *Canberra*", because that teaches a
 *   fact. There is no equivalent for a typed *country*: "Austria is a different
 *   country" is obvious, and the answer is already on the result card (#93).
 * - Right, with the hint taken: a reminder that it did not count towards
 *   learning, because otherwise it just looks like the streak is broken.
 *
 * At most one note: the hint wins over a fuzzy note, being the thing that
 * affects the player's progress.
 */
export function typeInFeedback(options: {
  result: FeedbackResult;
  typed: string;
  /** What the player typed names a capital, not a country. */
  capitalAnswer: boolean;
  hintUsed: boolean;
}): TypeInFeedback | null {
  const { result, capitalAnswer, hintUsed } = options;
  const typed = options.typed.trim();

  if (result.wasCorrect && hintUsed) {
    return {
      kind: 'hinted',
      parts: [{ text: 'You used the hint, so this answer does not count towards learning it.' }],
    };
  }
  if (result.wasCorrect && result.matchedBy === 'fuzzy' && typed !== '') {
    return {
      kind: 'close',
      parts: [
        { text: 'Close — you typed ' },
        { text: typed, emphasis: true },
        { text: ', it’s spelled ' },
        { text: result.correctAnswer, emphasis: true },
      ],
    };
  }
  if (!result.wasCorrect && capitalAnswer && result.matchedCountryName && typed !== '') {
    return {
      kind: 'other',
      parts: [
        { text: typed, emphasis: true },
        { text: ' is the capital of ' },
        { text: result.matchedCountryName, emphasis: true },
        { text: ' — the answer was ' },
        { text: result.correctAnswer, emphasis: true },
      ],
    };
  }
  return null;
}

/** The same note as plain text, for the live region. */
export function feedbackText(feedback: TypeInFeedback | null): string {
  return feedback ? `${feedback.parts.map((part) => part.text).join('')}.` : '';
}

/**
 * The note under a map reveal (#52): a wrong tap says which country it was. A
 * tap that missed everything, or landed on something that is not one of the 195
 * (open sea, Greenland), has nothing to name.
 */
export function mapTapFeedback(result: Pick<AnswerResult, 'wasCorrect' | 'matchedCountryName'>) {
  if (result.wasCorrect || !result.matchedCountryName) {
    return null;
  }
  const feedback: TypeInFeedback = {
    kind: 'other',
    parts: [{ text: 'That was ' }, { text: result.matchedCountryName, emphasis: true }],
  };
  return feedback;
}
