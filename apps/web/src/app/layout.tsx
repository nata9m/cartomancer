import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { TimeZoneCookie } from '@/components/TimeZoneCookie';
import { parseTheme, THEME_COLORS, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cartomancer',
  description: 'Capitals, countries, and flags',
};

/**
 * The browser chrome colour follows the chosen theme (#57). A pinned theme gets
 * one colour; "system" gets both, keyed to the OS preference, as before.
 */
export async function generateViewport(): Promise<Viewport> {
  const choice = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor:
      choice === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
            { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
          ]
        : THEME_COLORS[choice],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so the first paint is already the right theme: with the
  // choice in storage, the page would render in the OS theme and then flip.
  const choice = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={choice === 'system' ? undefined : choice}>
      <body>
        <TimeZoneCookie />
        {children}
      </body>
    </html>
  );
}
