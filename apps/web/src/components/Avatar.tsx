'use client';

import { useEffect, useRef, useState } from 'react';
import { initialFor } from '@/lib/profile';

/**
 * The player's picture, or their initial in a circle (#61).
 *
 * A client component because the provider's picture can fail to load (the avatar
 * host rate-limits, a URL goes stale), and a broken-image icon in the header of
 * the home screen is worse than no picture. Two ways to notice, and both are
 * needed: this renders on the server first, so the browser starts fetching the
 * image before React has hydrated, and a load that fails in that window has
 * already fired its `error` event with nobody listening. `onError` covers the
 * failure that comes after hydration; the effect covers the one that came
 * before, by asking the element whether it already gave up.
 *
 * `no-referrer` because Google's avatar host refuses some referrers, and the
 * image is decorative — the name is always next to it or on the button's label —
 * so `alt` is empty.
 */
export function Avatar({
  image,
  label,
  size,
}: {
  image: string | null;
  /** What to take the initial from: the name the player is shown. */
  label: string;
  size: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const element = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = element.current;
    // `complete` with no width is a load that finished and produced nothing.
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, [image]);

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a provider's avatar URL, not an asset of ours
      <img
        ref={element}
        className={`avatar avatar--${size}`}
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`avatar avatar--${size} avatar--initial`} aria-hidden="true">
      {initialFor(label)}
    </span>
  );
}
