import type { ReactNode } from 'react';
import { Flag } from './Flag';

/**
 * One row of a country list: flag, name, and whatever the screen puts after it.
 *
 * Shared by the register (#26) and the learned lists (#33), which want the same
 * shell and different trailing content — a capital, a streak, both, or nothing.
 * Hence `children` rather than a `detail` prop: the alternative was a union of
 * every combination either screen might want on the right.
 *
 * The flag is lazy in both places by design: these are 195-row lists where a
 * handful are on screen, which is the case lib/flag-art's warming is not for.
 *
 * No 'use client' marker, like Flag itself — the register is a client component
 * and the learned lists are server components, and this renders in both.
 */
export function CountryRow({
  isoCode,
  name,
  children,
}: {
  isoCode: string;
  name: string;
  children?: ReactNode;
}) {
  return (
    <div className="missed-row country-row">
      <Flag isoCode={isoCode} label={name} variant="inline" lazy />
      <span>{name}</span>
      {children}
    </div>
  );
}
