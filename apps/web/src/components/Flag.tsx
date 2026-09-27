import { flagSrc } from '@/lib/flag-art';

/**
 * Real flag artwork, served from /flag-art (see scripts/vendor-flags.mjs).
 * Never emoji: they don't render at all on several of the target platforms and
 * can't be sized.
 *
 * Each file keeps the flag's official proportions — 1:2 for Bosnia and
 * Herzegovina, 1:1 for Switzerland, a pennant for Nepal — so the two callers
 * fit the image into their box rather than the other way round: `fill` is
 * `object-fit: contain` inside a tile, `inline` a small fixed-height badge.
 * The icon sets that normalise everything to 4x3 do it by clipping, which is
 * the bug this replaced: it cut the sides off the very flags being guessed.
 */
export function Flag({
  isoCode,
  label,
  variant = 'fill',
  lazy = false,
}: {
  isoCode: string;
  label?: string;
  variant?: 'fill' | 'inline';
  /**
   * Defer the download until the image nears the viewport. Off by default and
   * deliberately so: a quiz flag is the question, it is above the fold, and
   * lib/flag-art has already warmed it a question ahead, so lazy loading there
   * would undo that work. The register is the opposite case — 195 rows, a
   * handful visible.
   */
  lazy?: boolean;
}) {
  return (
    <img
      src={flagSrc(isoCode)}
      // Generic when no label is passed, which is how the answer tiles use it:
      // naming the country would give the answer away to a screen reader.
      alt={label ? `Flag of ${label}` : 'Flag'}
      className={variant === 'fill' ? 'flag-fill' : 'flag-inline'}
      decoding="async"
      {...(lazy ? { loading: 'lazy' as const } : {})}
      draggable={false}
    />
  );
}
