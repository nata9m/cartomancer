import { describe, expect, it } from 'vitest';
import { parseTheme } from './theme';

describe('parseTheme', () => {
  it('accepts the three choices', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
  });
  it('treats anything else as system', () => {
    expect(parseTheme(undefined)).toBe('system');
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('')).toBe('system');
    expect(parseTheme('Dark')).toBe('system');
    expect(parseTheme('sepia')).toBe('system');
  });
});
