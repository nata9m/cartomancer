import type { Metadata, Viewport } from 'next';
import { TimeZoneCookie } from '@/components/TimeZoneCookie';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cartomancer',
  description: 'Capitals, countries, and flags',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The palette ships light and dark; let the OS pick.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#17171a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TimeZoneCookie />
        {children}
      </body>
    </html>
  );
}
