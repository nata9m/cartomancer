import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconChevronRight } from './icons';

export function CardShell({
  icon,
  title,
  description,
  trailing,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      {icon ? <span className="card-icon">{icon}</span> : null}
      <span className="card-body">
        <span className="card-title">{title}</span>
        <span className="card-description">{description}</span>
      </span>
      <span className="card-chevron">{trailing ?? <IconChevronRight size={18} stroke={1.75} />}</span>
    </>
  );
}

export function LinkCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link className="card" href={href}>
      <CardShell icon={icon} title={title} description={description} />
    </Link>
  );
}
