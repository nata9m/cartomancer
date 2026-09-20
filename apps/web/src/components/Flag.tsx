/**
 * Real flag artwork from the flag-icons package (MIT, SVG, ISO 3166-1 alpha-2).
 * Never emoji: they don't render at all on several of the target platforms and
 * can't be sized.
 */
export function Flag({
  isoCode,
  label,
  variant = 'fill',
}: {
  isoCode: string;
  label?: string;
  variant?: 'fill' | 'inline';
}) {
  return (
    <span
      className={`fi fi-${isoCode.toLowerCase()} ${variant === 'fill' ? 'flag-fill' : 'flag-inline'}`}
      role="img"
      aria-label={label ? `Flag of ${label}` : 'Flag'}
    />
  );
}
