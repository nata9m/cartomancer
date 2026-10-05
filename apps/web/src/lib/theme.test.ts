import { describe, expect, it } from 'vitest';
import { THEME_CHOICES, THEME_COLORS, THEME_LABELS, parseTheme } from './theme';

describe('parseTheme', () => {
  it('accepts the two choices', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });
  it('treats anything else as light, including the retired "system"', () => {
    expect(parseTheme('system')).toBe('light');
    expect(parseTheme(undefined)).toBe('light');
    expect(parseTheme(null)).toBe('light');
    expect(parseTheme('')).toBe('light');
    expect(parseTheme('Dark')).toBe('light');
    expect(parseTheme('sepia')).toBe('light');
  });
});

describe('the choices', () => {
  it('are Light and Dark only, in that order', () => {
    expect([...THEME_CHOICES]).toEqual(['light', 'dark']);
    expect(Object.values(THEME_LABELS)).toEqual(['Light', 'Dark']);
  });
  it('have the original browser chrome colours', () => {
    expect(THEME_COLORS).toEqual({ light: '#f7f7f5', dark: '#17171a' });
  });
});
