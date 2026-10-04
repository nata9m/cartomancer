'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { RecallSession } from '@cartomancer/shared';
import { IconCheck, IconX } from './icons';
import {
  checkRecallGuessAsGuest,
  finishRecallSession,
  loadRecallSession,
  submitRecallGuess,
} from '@/lib/client-api';
import { isGuestSessionId, loadGuestRecall, saveGuestRecall } from '@/lib/guest-store';

interface Recalled {
  id: number;
  name: string;
  isoCode: string;
}

/** How long "Region complete!" shows before the jump to results (#67). */
const COMPLETION_MOMENT_MS = 1200;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Countries active recall.
 *
 * No progress bar and no fixed question count: the round ends when the user says
 * so — or when there is nothing left to name. A correct, novel guess is appended
 * to the list and the counter ticks up; a duplicate or unrecognised guess just
 * clears the input, with a one-line inline note so the input doesn't silently
 * swallow the attempt. Naming the last country in the region finishes the round
 * by itself (#67), after a moment to see that it is complete.
 */
export function RecallRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const isGuest = isGuestSessionId(sessionId);

  const [session, setSession] = useState<RecallSession | null>(null);
  const [recalled, setRecalled] = useState<Recalled[]>([]);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  /** Fatal: there is no round to show. */
  const [error, setError] = useState<string | null>(null);
  /** Recoverable: the list of recalled countries is intact, one call failed (#58). */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** What Try again does: whichever call just failed, with its arguments. */
  const retry = useRef<(() => Promise<void>) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /**
   * True from the moment a finish starts until it fails. A ref, not `busy`,
   * because it has to hold the instant it is set: the automatic finish and a tap
   * on "I'm done" can land in the same tick, and `busy` is a render behind.
   */
  const finishing = useRef(false);

  useEffect(() => {
    if (!isGuest) {
      void (async () => {
        try {
          const loaded = await loadRecallSession(sessionId);
          setSession(loaded);
          setRecalled(loaded.recalled);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not load that recall round');
        }
      })();
      return;
    }

    const stored = loadGuestRecall(sessionId);
    if (!stored) {
      // sessionStorage does not exist while rendering on the server, so a guest
      // round can only be looked for after mount — an effect reading an external
      // store, which is what this rule's own guidance allows. Reading it in the
      // state initialiser instead would render differently on the server and in
      // the browser, which is a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        'This guest round is no longer in this tab’s memory. Guest sessions are never saved to the server — start a new one from the home screen.',
      );
      return;
    }
    setSession(stored.session);
    setRecalled(stored.recalled);
  }, [isGuest, sessionId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [session]);

  async function guess(value: string): Promise<void> {
    if (!session || busy || value.trim() === '') {
      return;
    }
    setBusy(true);
    setSubmitError(null);
    let completed = false;
    try {
      const outcome = isGuest
        ? await checkRecallGuessAsGuest({
            region: session.region,
            guess: value,
            alreadyRecalledCountryIds: recalled.map((country) => country.id),
          })
        : await submitRecallGuess(session.id, value);

      if (outcome.accepted && outcome.country) {
        const next = [...recalled, outcome.country];
        setRecalled(next);
        setNote(null);
        if (isGuest) {
          saveGuestRecall({ session, recalled: next });
        }
        completed = next.length >= session.totalInRegion;
      } else if (outcome.duplicate && outcome.country) {
        setNote({ text: `${outcome.country.name} is already on your list`, kind: 'info' });
      } else {
        setNote({ text: 'No match in this region', kind: 'error' });
      }
      setTyped('');
    } catch (cause) {
      // The typed guess stays in the box, so Try again sends the same word.
      retry.current = () => guess(value);
      setSubmitError(cause instanceof Error ? cause.message : 'Could not check that guess');
    } finally {
      // Busy stays up when that was the last country: the input must not take
      // another guess while the round finishes itself.
      if (!completed) {
        setBusy(false);
        inputRef.current?.focus();
      }
    }
    if (completed) {
      await finish(true);
    }
  }

  /**
   * Ends the round. `celebrate` is the automatic path: it holds the screen on
   * "Region complete!" for a moment, in parallel with the request so the wait is
   * never longer than the moment itself. Idempotent — the api stamps a finish
   * once, and `finishing` stops a second call getting that far.
   */
  async function finish(celebrate = false): Promise<void> {
    if (!session || finishing.current) return;
    finishing.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      await Promise.all([
        isGuest ? Promise.resolve() : finishRecallSession(session.id),
        celebrate ? sleep(COMPLETION_MOMENT_MS) : Promise.resolve(),
      ]);
      router.push(`/recall/${session.id}/results`);
    } catch (cause) {
      // Try again skips the celebration: it has been seen. The list is complete
      // and the input stays disabled, so the only way forward is this.
      finishing.current = false;
      retry.current = () => finish(false);
      setSubmitError(cause instanceof Error ? cause.message : 'Could not finish the round');
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="app-shell">
        <p className="error-note">{error}</p>
        <Link className="button-secondary" href="/" style={{ lineHeight: '40px' }}>
          Back to home
        </Link>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell">
        <p className="loading-note">Loading…</p>
      </main>
    );
  }

  const regionLabel = session.region === 'all' ? 'all regions' : session.region;
  // Derived, so a round that is already complete when it loads (a refresh after
  // a failed finish) looks complete too and offers the way out. It is not
  // finished on load: that would bounce anyone who pressed Back from the
  // results straight back to them.
  const complete = session.totalInRegion > 0 && recalled.length >= session.totalInRegion;

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Leave round">
          <IconX size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">Recall: {regionLabel}</h1>
      </div>

      <div className={`recall-counter${complete ? ' recall-counter--complete' : ''}`}>
        <span className="recall-count">{recalled.length}</span>
        <span className="recall-total"> / {session.totalInRegion}</span>
        <div className="recall-caption" role={complete ? 'status' : undefined}>
          {complete
            ? session.region === 'all'
              ? `All ${session.totalInRegion} countries! 🎉`
              : `All ${session.totalInRegion} countries of ${session.region}! 🎉`
            : 'countries recalled'}
        </div>
      </div>

      <form
        className="answer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void guess(typed);
        }}
      >
        <input
          ref={inputRef}
          className="answer-input"
          type="text"
          value={typed}
          placeholder="Type a country name"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          disabled={busy || complete}
          onChange={(event) => setTyped(event.target.value)}
        />
        {/*
          Submitting with Enter alone leaves no visible way to add a country on
          a touch keyboard. The button runs the same path, so a guess that
          doesn't match a country in this region is still refused — the counter
          and the list don't move, and the note below says why.
        */}
        <button
          type="submit"
          className="button-secondary"
          disabled={busy || complete || typed.trim() === ''}
        >
          Add country
        </button>
      </form>
      <p className={`inline-note${note?.kind === 'error' ? ' inline-note--error' : ''}`}>
        {note?.text ?? ''}
      </p>

      {submitError ? (
        <div className="retry-note">
          <p className="error-note">{submitError}</p>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => {
              const again = retry.current;
              if (again) void again();
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {recalled.length > 0 ? (
        <div className="stack stack--tight">
          <span className="section-label">Recalled so far</span>
          <div className="pill-list">
            {recalled.map((country) => (
              <span className="pill pill--success" key={country.id}>
                <IconCheck size={13} stroke={2.2} />
                {country.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="spacer" />

      {/* Sticky, so a long round (44 countries in Europe, 195 in all) does not
          bury the way out below the list it is growing (#67). */}
      <div className="recall-finish">
        <button
          type="button"
          className="button-primary"
          onClick={() => void finish()}
          disabled={busy}
        >
          {complete ? 'Show results' : 'I\u2019m done \u2014 show results'}
        </button>
      </div>
    </main>
  );
}
