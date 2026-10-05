import { describe, expect, it } from 'vitest';
import { answerHintFor } from '@cartomancer/shared';

describe('answerHintFor', () => {
  it('shows the first letter and one underscore per other letter', () => {
    expect(answerHintFor('Kyrgyzstan')).toBe('K _ _ _ _ _ _ _ _ _');
  });
  it('separates words with a wider gap', () => {
    expect(answerHintFor('New Zealand')).toBe('N _ _   _ _ _ _ _ _ _');
  });
  it('keeps punctuation as written and counts only letters', () => {
    expect(answerHintFor("Côte d'Ivoire")).toBe("C _ _ _   _ ' _ _ _ _ _ _");
    expect(answerHintFor('Guinea-Bissau')).toBe('G _ _ _ _ _ - _ _ _ _ _ _');
  });
  it('does not blank the first letter when it is accented', () => {
    expect(answerHintFor('Åland')).toBe('Å _ _ _ _');
  });
  it('is empty for nothing', () => {
    expect(answerHintFor('  ')).toBe('');
  });
});
