import Link from 'next/link';
import type { ReactNode } from 'react';
import { Flag } from './Flag';
import { IconChevronRight } from './icons';

/**
 * One row of a country list: flag, name, and whatever the screen puts after it.
 *
 * Shared by the register (#26) and the learned lists (#33), which want the same
 * shell and different trailing content — a capital, a streak, both, or nothing.
 * Hence `children` rather than a `detail` prop: the alternative was a union of
 * every combination either screen might want on the right.
 *
 * With `href` the row is a link to a country's detail page and grows a chevron
 * to say so (#38); without one it is the plain row the learned lists use, where
 * there is nothing to open.
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
  href,
  children,
}: {
  isoCode: string;
  name: string;
  /** Makes the row a link, with a chevron to match the app's other tap targets. */
  href?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <Flag isoCode={isoCode} label={name} variant="inline" lazy />
      <span>{name}</span>
      {children}
      {href ? <IconChevronRight className="country-row__chevron" size={16} stroke={1.75} /> : null}
    </>
  );

  return href ? (
    <Link className="missed-row country-row country-row--link" href={href}>
      {body}
    </Link>
  ) : (
    <div className="missed-row country-row">{body}</div>
  );
}
