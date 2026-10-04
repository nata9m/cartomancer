'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Tells the server which timezone the player is in, by keeping it in a cookie
 * (#66).
 *
 * The day streak and the week row bucket answers into the player's calendar
 * days, and the home screen is a server component: it cannot see the browser's
 * zone, and UTC is the wrong day for anyone else. A player ahead of UTC who has
 * not played since Monday saw their streak survive Wednesday morning, because
 * their Wednesday was still Tuesday in UTC.
 *
 * It runs on every load, so travelling or a change of zone is picked up. When
 * the cookie was missing or has changed, the page that was just rendered used the
 * old zone (UTC, on a first visit), so it asks the server for it again once; the
 * next load finds the cookie current and does nothing, which is what stops this
 * becoming a refresh loop. Renders nothing.
 */
export function TimeZoneCookie() {
  const router = useRouter();

  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;

    const current = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('tz='))
      ?.slice('tz='.length);
    if (current && decodeURIComponent(current) === zone) return;

    // A year, so it outlives a session; Lax because it is only ever read by this
    // site's own server-side rendering and proxy.
    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
