import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, haptic, hapticFor } from './haptics';

function stub(vibrate: unknown, reduce = false) {
  vi.stubGlobal('navigator', { vibrate });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) });
}

afterEach(() => vi.unstubAllGlobals());

describe('haptic', () => {
  it('vibrates with the pattern for the kind', () => {
    const vibrate = vi.fn(() => true);
    stub(vibrate);
    expect(haptic('wrong')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.wrong]);
  });
  it('does nothing where the API is missing', () => {
    stub(undefined);
    expect(haptic('correct')).toBe(false);
  });
  it('stays quiet under reduced motion', () => {
    const vibrate = vi.fn(() => true);
    stub(vibrate, true);
    expect(haptic('correct')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it('swallows a throwing vibrate', () => {
    stub(() => {
      throw new Error('blocked');
    });
    expect(haptic('correct')).toBe(false);
  });
});

describe('hapticFor', () => {
  it('ranks learned above correct above wrong', () => {
    expect(hapticFor({ wasCorrect: true, newlyLearned: true })).toBe('learned');
    expect(hapticFor({ wasCorrect: true, newlyLearned: false })).toBe('correct');
    expect(hapticFor({ wasCorrect: false, newlyLearned: false })).toBe('wrong');
  });
});
