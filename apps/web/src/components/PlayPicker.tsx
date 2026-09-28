'use client';

import Link from 'next/link';
import { FilterChips } from './FilterChips';
import { IconArrowLeft, IconArrowRight } from './icons';
import type { Filters } from '@/lib/filters';

/**
 * The start screen for a game with one mode: back arrow and title, the filter
 * chips it cares about, what the round will be, and one Play button.
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
  showMode = false,
  note,
  pending,
  error,
  onPlay,
}: {
  title: string;
  /** A muted line under the chips, saying what the round will actually be. */
  description: string;
  filters: Filters;
  showDifficulty?: boolean;
  showQuestionCount?: boolean;
  showMode?: boolean;
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
        showMode={showMode}
      />

      <p className="screen-note">{description}</p>

      {note ? <span className="section-label">{note}</span> : null}

      {/* The same button as "Try again" on the results screens, in the place a
          mode picker puts its first card: the screen then reads as one block —
          what this is, how big it is, go — rather than leaving the only action
          stranded at the bottom of an otherwise empty phone screen. */}
      <button
        type="button"
        className="button-primary"
        disabled={pending}
        aria-busy={pending}
        onClick={onPlay}
      >
        {pending ? 'Starting…' : 'Play'}
        <IconArrowRight size={16} stroke={2} />
      </button>

      {error ? <p className="error-note">{error}</p> : null}
    </main>
  );
}
