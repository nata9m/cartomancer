import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { TimeZoneCookie } from '@/components/TimeZoneCookie';
import { parseTheme, THEME_COLORS, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cartomancer',
  description: 'Capitals, countries, and flags',
};

/** The browser chrome colour is the chosen theme's page background (#57, #92). */
export async function generateViewport(): Promise<Viewport> {
  const choice = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return { width: 'device-width', initialScale: 1, themeColor: THEME_COLORS[choice] };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so the first paint is already the right theme: with the
  // choice in storage, the page would render in the default and then flip.
  const choice = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={choice}>
      <body>
        <TimeZoneCookie />
        {children}
      </body>
    </html>
  );
}
