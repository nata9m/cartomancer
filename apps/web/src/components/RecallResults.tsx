'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RecallResults as RecallResultsPayload } from '@cartomancer/shared';
import { IconArrowRight, IconCheck, IconX } from './icons';
import {
  loadCountries,
  loadRecallResults,
  startRecallSession,
} from '@/lib/client-api';
import { isGuestSessionId, loadGuestRecall, saveGuestRecall } from '@/lib/guest-store';

/** Long lists are truncated with a "+N more" pill, as in the mockup. */
const PILL_LIMIT = 8;

/**
 * A list of countries, truncated to PILL_LIMIT with a pill that expands it.
 *
 * The overflow pill is a real button: an "All regions" round leaves up to 187
 * countries behind the "+N more", and a pill that looks tappable and isn't is
 * worse than no pill at all.
 */
function PillList({
  countries,
  tone,
  noun,
}: {
  countries: { id: number; name: string }[];
  tone: 'success' | 'danger';
  noun: 'recalled' | 'missed';
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? countries : countries.slice(0, PILL_LIMIT);
  const remaining = countries.length - shown.length;
  return (
    <div className="pill-list">
      {shown.map((country) => (
        <span className={`pill pill--${tone}`} key={country.id}>
          {tone === 'success' ? <IconCheck size={13} stroke={2.2} /> : <IconX size={13} stroke={2.2} />}
          {country.name}
        </span>
      ))}
      {countries.length > PILL_LIMIT ? (
        <button
          type="button"
          className="pill pill--more"
          aria-expanded={expanded}
          // Both lists can carry this button, so the visible "+185 more" is
          // named for whichever list it belongs to.
          aria-label={
            expanded
              ? `Show fewer ${noun} countries`
              : `Show all ${countries.length} ${noun} countries`
          }
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? 'Show less' : `+${remaining} more`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Recall results. A guest's missed list can't come from the server (nothing was
 * stored), so it is the region's countries minus what the client recalled.
 */
export function RecallResults({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const isGuest = isGuestSessionId(sessionId);
  const [results, setResults] = useState<RecallResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        if (isGuest) {
          const stored = loadGuestRecall(sessionId);
          if (!stored) {
            throw new Error(
              'Those guest results are no longer in this tab’s memory — nothing about a guest round is saved to the server.',
            );
          }
          const { countries } = await loadCountries(stored.session.region);
          const recalledIds = new Set(stored.recalled.map((country) => country.id));
          if (cancelled) return;
          setResults({
            sessionId,
            region: stored.session.region,
            totalInRegion: stored.session.totalInRegion,
            recalled: stored.recalled,
            missed: countries
              .filter((country) => !recalledIds.has(country.id))
              .map((country) => ({ id: country.id, name: country.name, isoCode: country.isoCode })),
            isGuest: true,
          });
        } else {
          const loaded = await loadRecallResults(sessionId);
          if (!cancelled) setResults(loaded);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load those results');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isGuest, sessionId]);

  async function tryAgain(): Promise<void> {
    if (!results) return;
    setBusy(true);
    try {
      const session = await startRecallSession(results.region);
      if (session.isGuest) {
        saveGuestRecall({ session, recalled: [] });
      }
      router.push(`/recall/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start another round');
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

  if (!results) {
    return (
      <main className="app-shell">
        <p className="loading-note">Loading…</p>
      </main>
    );
  }

  const regionLabel = results.region === 'all' ? 'All regions' : results.region;

  return (
    <main className="app-shell">
      <div className="results-head">
        <div className="results-kind">Recall · {regionLabel}</div>
        <div className="results-score">
          {results.recalled.length}/{results.totalInRegion}
        </div>
        <div className="results-caption">recalled from memory</div>
      </div>

      {results.recalled.length > 0 ? (
        <div className="stack stack--tight">
          <span className="section-label">You recalled</span>
          <PillList countries={results.recalled} tone="success" noun="recalled" />
        </div>
      ) : null}

      {results.missed.length > 0 ? (
        <div className="stack stack--tight">
          <span className="section-label">Missed this round</span>
          <PillList countries={results.missed} tone="danger" noun="missed" />
        </div>
      ) : null}

      <div className="spacer" />

      <div className="stack">
        <button type="button" className="button-primary" onClick={() => void tryAgain()} disabled={busy}>
          Try again
          <IconArrowRight size={16} stroke={2} />
        </button>
        <Link className="button-secondary" href="/" style={{ lineHeight: '40px' }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
