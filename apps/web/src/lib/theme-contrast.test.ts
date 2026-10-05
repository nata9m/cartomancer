import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The palette's contrast, checked against the stylesheet itself (#57): the
 * issue asks for WCAG AA in both themes, and a colour tweak that quietly breaks
 * it is the likeliest way for that to stop being true.
 */
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');

function block(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  if (start === -1) throw new Error(`no block for ${selectorStart}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const tokens: Record<string, string> = {};
  for (const match of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[match[1] as string] = (match[2] as string).toLowerCase();
  }
  return tokens;
}

const light = block(':root {');
const dark = block(":root[data-theme='dark']");

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['--surface-0', '--surface-1', '--surface-2', '--surface-3'];
const TEXT = ['--text-primary', '--text-secondary', '--text-muted', '--text-accent'];

const pairs: [string, string, number][] = [
  ...SURFACES.flatMap((surface) =>
    TEXT.map((text): [string, string, number] => [text, surface, 4.5]),
  ),
  ['--text-accent', '--bg-accent', 4.5],
  ['--text-success', '--bg-success', 4.5],
  ['--text-danger', '--bg-danger', 4.5],
  // The primary button: surface-2 text on a text-primary fill.
  ['--surface-2', '--text-primary', 4.5],
  // Focus rings and the progress bar are not text, but WCAG asks 3:1 of them.
  ['--border-accent', '--surface-0', 3],
  ['--border-accent', '--surface-2', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast (WCAG AA)', (_name, tokens) => {
  it.each(pairs)('%s on %s is at least %s:1', (foreground, background, minimum) => {
    const fg = tokens[foreground];
    const bg = tokens[background];
    expect(fg, foreground).toBeDefined();
    expect(bg, background).toBeDefined();
    expect(contrast(fg as string, bg as string), `${fg} on ${bg}`).toBeGreaterThanOrEqual(minimum);
  });
});

describe('the stylesheet', () => {
  it('overrides every colour token the light theme defines in dark', () => {
    for (const token of Object.keys(light)) {
      if (token === '--radius') continue;
      expect(dark[token], token).toBeDefined();
    }
  });
  it('does not consult the OS colour preference: the theme is chosen, not followed (#92)', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });
  it("uses no serif: every title is the app's own sans-serif (#92)", () => {
    expect(css.replace(/sans-serif/g, '')).not.toMatch(/serif/i);
    expect(css).not.toContain('--font-display');
  });
  it('has the original neutral palettes', () => {
    expect(light['--surface-0']).toBe('#f7f7f5');
    expect(dark['--surface-0']).toBe('#17171a');
  });
});
