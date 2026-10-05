'use client';

import { useState, useTransition } from 'react';
import { setThemeAction } from '@/app/actions';
import { THEME_CHOICES, THEME_LABELS, type ThemeChoice } from '@/lib/theme';

/**
 * System / Light / Dark (#57).
 *
 * The attribute is set straight away so the page changes under the finger, and
 * the server action stores the cookie, which is what makes it stick and what the
 * server renders from next time. Its response re-renders the page, which is also
 * how the browser chrome colour — a <meta> the server writes from the same
 * cookie — gets rewritten.
 *
 * `initial` is what the server rendered from, so the control opens on the right
 * choice with no flash and nothing read from the browser.
 */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [, startTransition] = useTransition();
  const [choice, setChoice] = useState<ThemeChoice>(initial);

  function choose(next: ThemeChoice): void {
    setChoice(next);
    const root = document.documentElement;
    if (next === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
    startTransition(() => setThemeAction(next));
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {THEME_CHOICES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={choice === option}
          className={`theme-option${choice === option ? ' theme-option--active' : ''}`}
          onClick={() => choose(option)}
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
