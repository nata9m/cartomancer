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

/**
 * Countries active recall.
 *
 * No progress bar and no fixed question count: the round ends when the user says
 * so. A correct, novel guess is appended to the list and the counter ticks up; a
 * duplicate or unrecognised guess just clears the input, with a one-line inline
 * note so the input doesn't silently swallow the attempt.
 */
export function RecallRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const isGuest = isGuestSessionId(sessionId);

  const [session, setSession] = useState<RecallSession | null>(null);
  const [recalled, setRecalled] = useState<Recalled[]>([]);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      } else if (outcome.duplicate && outcome.country) {
        setNote({ text: `${outcome.country.name} is already on your list`, kind: 'info' });
      } else {
        setNote({ text: 'No match in this region', kind: 'error' });
      }
      setTyped('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check that guess');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function finish(): Promise<void> {
    if (!session) return;
    setBusy(true);
    try {
      if (!isGuest) {
        await finishRecallSession(session.id);
      }
      router.push(`/recall/${session.id}/results`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish the round');
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

  return (
    <main className="app-shell">
      <div className="screen-header">
        <Link className="icon-button" href="/" aria-label="Leave round">
          <IconX size={19} stroke={1.9} />
        </Link>
        <h1 className="screen-title">Recall: {regionLabel}</h1>
      </div>

      <div className="recall-counter">
        <span className="recall-count">{recalled.length}</span>
        <span className="recall-total"> / {session.totalInRegion}</span>
        <div className="recall-caption">countries recalled</div>
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
          disabled={busy}
          onChange={(event) => setTyped(event.target.value)}
        />
      </form>
      <p className={`inline-note${note?.kind === 'error' ? ' inline-note--error' : ''}`}>
        {note?.text ?? ''}
      </p>

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

      <button type="button" className="button-primary" onClick={() => void finish()} disabled={busy}>
        I&rsquo;m done — show results
      </button>
    </main>
  );
}
