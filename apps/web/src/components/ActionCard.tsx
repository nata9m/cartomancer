'use client';

import type { ReactNode } from 'react';
import { CardShell } from './Cards';

export function ActionCard({
  icon,
  title,
  description,
  onClick,
  pending = false,
  disabled = false,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="card"
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      <CardShell
        icon={icon}
        title={title}
        description={pending ? 'Starting…' : description}
      />
    </button>
  );
}
