import { cookies } from 'next/headers';
import { ThemeToggle } from './ThemeToggle';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

/** The theme control with its label, reading the current choice from the cookie. */
export async function ThemeSetting() {
  const choice = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="theme-setting">
      <span className="section-label">Theme</span>
      <ThemeToggle initial={choice} />
    </div>
  );
}
