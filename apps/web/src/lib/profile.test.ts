import { describe, expect, it } from 'vitest';
import { displayNameFor, formatMemberSince, initialFor, providerLabel } from './profile';

describe('displayNameFor', () => {
  it('prefers the name', () => {
    expect(displayNameFor({ name: 'Zoë', email: 'zoe@example.com' })).toBe('Zoë');
  });

  it('falls back to the part of the email before the @, so no screen shows a blank', () => {
    expect(displayNameFor({ name: null, email: 'zoe@example.com' })).toBe('zoe');
    expect(displayNameFor({ name: '', email: 'zoe@example.com' })).toBe('zoe');
    expect(displayNameFor({ name: '   ', email: 'zoe@example.com' })).toBe('zoe');
  });

  it('trims the name', () => {
    expect(displayNameFor({ name: '  Zoë ', email: 'z@example.com' })).toBe('Zoë');
  });

  it('uses the whole address when there is nothing before the @', () => {
    expect(displayNameFor({ name: null, email: '@example.com' })).toBe('@example.com');
  });
});

describe('initialFor', () => {
  it('is the first letter, upper-cased', () => {
    expect(initialFor('zoë')).toBe('Z');
    expect(initialFor('  natalia')).toBe('N');
  });

  it('takes a whole character, not half a surrogate pair', () => {
    expect(initialFor('🌍 Earth')).toBe('🌍');
  });

  it('is a question mark when there is nothing to take it from', () => {
    expect(initialFor('')).toBe('?');
    expect(initialFor('   ')).toBe('?');
  });
});

describe('providerLabel', () => {
  it('names the two providers', () => {
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('apple')).toBe('Apple');
  });

  it('says nothing for "pending" or anything it does not know', () => {
    for (const value of ['pending', '', 'github', 'GOOGLE']) {
      expect(providerLabel(value)).toBeNull();
    }
  });
});

describe('formatMemberSince', () => {
  it('formats the date, in UTC whatever the machine’s zone', () => {
    expect(formatMemberSince('2026-10-04T23:30:00Z')).toBe('4 October 2026');
    // 00:30 on the 5th at +02:00 is still the 4th in UTC.
    expect(formatMemberSince('2026-10-05T00:30:00+02:00')).toBe('4 October 2026');
  });

  it('is null when there is no date or it is not one', () => {
    expect(formatMemberSince(null)).toBeNull();
    expect(formatMemberSince('')).toBeNull();
    expect(formatMemberSince('yesterday')).toBeNull();
  });
});
