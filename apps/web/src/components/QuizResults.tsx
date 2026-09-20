'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SessionResults } from '@cartomancer/shared';
import { IconArrowRight, IconCircleCheck, IconFlame } from './icons';
import { loadQuizResults, startQuizSession } from '@/lib/client-api';
import { isGuestSessionId, loadGuestQuiz, saveGuestQuiz } from '@/lib/guest-store';

/**
 * Quiz results.
 *
 * For a signed-in session the api computes everything (including which
 * countries crossed the learned threshold, which it derives from the streaks
 * rather than storing). For a guest the same shape is assembled from the answers
 * held in sessionStorage — minus the streak callout and the newly-learned
 * section, which have no meaning without persisted progress.
 */
export function QuizResults({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const isGuest = isGuestSessionId(sessionId);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        if (isGuest) {
          const stored = loadGuestQuiz(sessionId);
          if (!stored) {
            throw new Error(
              'Those guest results are no longer in this tab’s memory — nothing about a guest session is saved to the server.',
            );
          }
          const total = stored.session.questions.length;
          const score = stored.answers.filter((answer) => answer.wasCorrect).length;
          if (cancelled) return;
          setResults({
            sessionId,
            quizType: stored.session.quizType,
            regionFilter: stored.session.regionFilter,
            difficultyFilter: stored.session.difficultyFilter,
            score,
            total,
            percentCorrect: total === 0 ? 0 : Math.round((score / total) * 100),
            newlyLearned: [],
            missed: stored.answers
              .filter((answer) => !answer.wasCorrect)
              .map((answer) => ({
                countryId: answer.countryId,
                countryName: answer.correctCountryName,
                isoCode: answer.correctIsoCode,
                correctAnswer: answer.correctAnswer,
              })),
            dayStreak: null,
            isGuest: true,
          });
        } else {
          const loaded = await loadQuizResults(sessionId);
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

  async function playAgain(): Promise<void> {
    if (!results) return;
    setBusy(true);
    try {
      const session = await startQuizSession({
        quizTypeKey: results.quizType.key,
        region: results.regionFilter,
        difficulty: results.difficultyFilter,
        questionCount: results.total,
      });
      if (session.isGuest) {
        saveGuestQuiz({ session, answers: [] });
      }
      router.push(`/quiz/${session.id}`);
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

  return (
    <main className="app-shell">
      <div className="results-head">
        <div className="results-kind">
          {results.quizType.displayName} · {results.quizType.directionLabel}
        </div>
        <div className="results-score">
          {results.score}/{results.total}
        </div>
        <div className="results-caption">{results.percentCorrect}% correct</div>
      </div>

      {results.dayStreak !== null && results.dayStreak > 0 ? (
        <div className="callout">
          <IconFlame size={17} stroke={1.9} className="callout-icon" />
          <span>
            {results.dayStreak} day streak — nice work today
          </span>
        </div>
      ) : null}

      {results.newlyLearned.length > 0 ? (
        <div className="callout callout--success">
          <IconCircleCheck size={17} stroke={1.9} className="callout-icon" />
          <span>
            <strong>{results.newlyLearned.length} newly learned</strong>
            <br />
            {results.newlyLearned.map((country) => country.countryName).join(', ')}
          </span>
        </div>
      ) : null}

      {results.missed.length > 0 ? (
        <div className="stack stack--tight">
          <span className="section-label">Missed this round</span>
          <div className="missed-list">
            {results.missed.map((missed) => (
              <div className="missed-row" key={missed.countryId}>
                <span>{missed.countryName}</span>
                <span className="missed-answer">{missed.correctAnswer}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="spacer" />

      <div className="stack">
        <button type="button" className="button-primary" onClick={() => void playAgain()} disabled={busy}>
          Play again
          <IconArrowRight size={16} stroke={2} />
        </button>
        <Link className="button-secondary" href="/" style={{ lineHeight: '40px' }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
