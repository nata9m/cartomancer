import { describe, expect, it } from 'vitest';
import type { AnswerResult } from '@cartomancer/shared';
import { feedbackText, mapTapFeedback, typeInFeedback } from './type-in-feedback';

const result = {
  wasCorrect: true,
  matchedBy: 'exact' as AnswerResult['matchedBy'],
  correctAnswer: 'Kyrgyzstan',
  matchedCountryName: undefined as string | undefined,
};

const feedback = (
  overrides: Partial<typeof result>,
  options: { typed?: string; capitalAnswer?: boolean; hintUsed?: boolean } = {},
) =>
  typeInFeedback({
    result: { ...result, ...overrides },
    typed: options.typed ?? 'Kyrgistan',
    capitalAnswer: options.capitalAnswer ?? false,
    hintUsed: options.hintUsed ?? false,
  });

describe('typeInFeedback', () => {
  it('says nothing for an exact or alias answer', () => {
    expect(feedback({})).toBeNull();
    expect(feedback({ matchedBy: 'alias' })).toBeNull();
  });

  it('notes a fuzzy accept with what was typed and the spelling', () => {
    const note = feedback({ matchedBy: 'fuzzy' });
    expect(note?.kind).toBe('close');
    expect(feedbackText(note)).toBe('Close — you typed Kyrgistan, it’s spelled Kyrgyzstan.');
    expect(note?.parts.filter((part) => part.emphasis).map((part) => part.text)).toEqual([
      'Kyrgistan',
      'Kyrgyzstan',
    ]);
  });

  it('says nothing when a wrong answer is another country (#93)', () => {
    const wrong = {
      wasCorrect: false,
      matchedBy: 'none' as const,
      correctAnswer: 'Australia',
      matchedCountryName: 'Austria',
    };
    const note = feedback(wrong, { typed: 'austria' });
    expect(note).toBeNull();
    // Nothing for the live region to read either.
    expect(feedbackText(note)).toBe('');
  });

  it('says whose capital it was for a capital question', () => {
    const note = feedback(
      {
        wasCorrect: false,
        matchedBy: 'none',
        correctAnswer: 'Canberra',
        matchedCountryName: 'Austria',
      },
      { typed: 'Vienna', capitalAnswer: true },
    );
    expect(feedbackText(note)).toBe('Vienna is the capital of Austria — the answer was Canberra.');
  });

  it('says nothing for a plain wrong answer or giving up', () => {
    expect(feedback({ wasCorrect: false, matchedBy: 'none' })).toBeNull();
    expect(
      feedback(
        { wasCorrect: false, matchedBy: 'none', matchedCountryName: 'Austria' },
        { typed: '' },
      ),
    ).toBeNull();
  });

  it('reminds a hinted correct answer it did not count, ahead of a fuzzy note', () => {
    const note = feedback({ matchedBy: 'fuzzy' }, { hintUsed: true });
    expect(note?.kind).toBe('hinted');
  });

  it('does not mention the hint when the answer was wrong anyway', () => {
    expect(feedback({ wasCorrect: false, matchedBy: 'none' }, { hintUsed: true })).toBeNull();
  });

  it('has no text for no note', () => {
    expect(feedbackText(null)).toBe('');
  });
});

describe('mapTapFeedback', () => {
  it('names the country a wrong tap landed on', () => {
    const note = mapTapFeedback({ wasCorrect: false, matchedCountryName: 'Argentina' });
    expect(feedbackText(note)).toBe('That was Argentina.');
    expect(note?.parts.filter((part) => part.emphasis)).toHaveLength(1);
  });
  it('says nothing for a right tap, or a tap on nothing', () => {
    expect(mapTapFeedback({ wasCorrect: true, matchedCountryName: undefined })).toBeNull();
    expect(mapTapFeedback({ wasCorrect: false, matchedCountryName: undefined })).toBeNull();
  });
});
