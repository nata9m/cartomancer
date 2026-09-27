'use client';

import Link from 'next/link';
import { FilterChips } from './FilterChips';
import { IconArrowLeft } from './icons';
import type { Filters } from '@/lib/filters';

/**
 * The start screen for a game with one mode: back arrow and title, the filter
 * chips it cares about, and a single Play button.
 *
 * Shared by Fun facts and Countries because #28 asked for it explicitly — the
 * two screens are the same shape, and keeping them one component is what stops
 * the chips drifting to a different place on each. ModePicker is still the
 * separate thing it was: Capitals and Flags have several modes to choose
 * between, and a list of cards is not this.
 *
 * The caller owns starting the round. This knows nothing about sessions.
 */
export function PlayPicker({
  title,
  description,
  filters,
  showDifficulty = false,
  showQuestionCount = false,
  note,
  pending,
  error,
  onPlay,
}: {
  title: string;
  /** The line under "Play", saying what the round will actually be. */
  description: string;
  filters: Filters;
  showDifficulty?: boolean;
  showQuestionCount?: boolean;
  /** Optional muted line under the chips, e.g. how big the pool is. */
  note?: string;
  pending: boolean;
  error: string | null;
  onPlay: () => void;
}) {
  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Back to home">
          <IconArrowLeft size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">{title}</h1>
      </div>

      <FilterChips
        filters={filters}
        showDifficulty={showDifficulty}
        showQuestionCount={showQuestionCount}
      />

      {note ? <span className="section-label">{note}</span> : null}

      <div className="stack">
        <button
          type="button"
          className="card card--primary"
          disabled={pending}
          aria-busy={pending}
          onClick={onPlay}
        >
          <div className="card-body">
            <span className="card-title">{pending ? 'Starting…' : 'Play'}</span>
            <span className="card-description">{description}</span>
          </div>
        </button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
    </main>
  );
}
