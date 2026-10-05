import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeQuizCards } from './HomeQuizCards';

describe('HomeQuizCards (#94, #101)', () => {
  const html = renderToStaticMarkup(<HomeQuizCards />);

  it('has the five cards, each linking where it did', () => {
    for (const href of ['/capitals', '/recall', '/flags', '/map', '/trivia']) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('shows no learned count: the stats strip is where progress lives', () => {
    expect(html).not.toContain('card-number');
    expect(html).not.toMatch(/\d+\s*\/\s*195/);
    expect(html).not.toMatch(/\d+<small/);
  });

  it('uses the plain card, not the tarot styling (#101)', () => {
    expect(html).not.toContain('card--tarot');
    expect(html.match(/class="card"/g)).toHaveLength(5);
  });

  it('gives every card the chevron, the Fun facts one included', () => {
    expect(html.match(/class="card-chevron"/g)).toHaveLength(5);
    expect(html).not.toContain('tabler-icon-sparkles');
  });
});
