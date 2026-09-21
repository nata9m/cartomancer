'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerResult, QuizQuestion, QuizSession } from '@cartomancer/shared';
import { Flag } from './Flag';
import { IconArrowRight, IconBulb, IconCheck, IconX } from './icons';
import {
  checkAnswerAsGuest,
  finishQuizSession,
  loadQuizSession,
  submitAnswer,
} from '@/lib/client-api';
import { isGuestSessionId, loadGuestQuiz, saveGuestQuiz, type GuestAnswer } from '@/lib/guest-store';

type Phase = 'answering' | 'revealed';

/**
 * The shared quiz screen: capitals, flags and trivia in both directions, in
 * multiple-choice and type-in form. It branches on `quizType.category` and
 * `quizType.format` (plus direction for the two-way categories), never on the
 * individual quiz-type key — so a tenth quiz type is a data row plus, at most, a
 * new branch here, not a new screen.
 *
 * Guest and signed-in play share every line of this component. The only
 * difference is where the session comes from (sessionStorage vs the api) and
 * which endpoint checks the answer — and for guests, neither writes anything.
 */
export function QuizRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const isGuest = isGuestSessionId(sessionId);

  const [session, setSession] = useState<QuizSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('answering');
  const [typed, setTyped] = useState('');
  const [chosenLabel, setChosenLabel] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const askedAt = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        if (isGuest) {
          const stored = loadGuestQuiz(sessionId);
          if (!stored) {
            throw new Error(
              'This guest quiz is no longer in this tab’s memory. Guest sessions are never saved to the server — start a new one from the home screen.',
            );
          }
          if (cancelled) return;
          setSession(stored.session);
          setAnsweredCount(stored.answers.length);
          setIndex(Math.min(stored.answers.length, stored.session.questions.length - 1));
        } else {
          const loaded = await loadQuizSession(sessionId);
          if (cancelled) return;
          setSession(loaded);
          setAnsweredCount(loaded.answered.length);
          setIndex(Math.min(loaded.answered.length, loaded.questions.length - 1));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load that quiz');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isGuest, sessionId]);

  const question: QuizQuestion | undefined = session?.questions[index];
  const total = session?.questions.length ?? 0;

  useEffect(() => {
    askedAt.current = Date.now();
    if (session?.quizType.format === 'type_in') {
      inputRef.current?.focus();
    }
  }, [index, session?.quizType.format]);

  const answer = useCallback(
    /**
     * `gaveUp` is the "I don't know" path: it submits an empty answer, which
     * cannot match anything, so it is recorded and scored exactly like a wrong
     * guess — the streak resets and the country goes on the missed list. The
     * only difference is that the empty-input guard doesn't apply.
     */
    async (value: string, gaveUp = false) => {
      if (!session || !question || busy || phase === 'revealed') {
        return;
      }
      if (!gaveUp && value.trim().length === 0) {
        return;
      }
      setBusy(true);
      try {
        const outcome = isGuest
          ? await checkAnswerAsGuest({
              quizTypeKey: session.quizType.key,
              countryId: question.countryId,
              answer: value,
            })
          : await submitAnswer(session.id, {
              sequence: question.sequence,
              answer: value,
              timeTakenMs: Date.now() - askedAt.current,
            });

        setResult(outcome);
        setPhase('revealed');
        setAnsweredCount((count) => count + 1);

        if (isGuest) {
          const stored = loadGuestQuiz(session.id);
          const entry: GuestAnswer = {
            sequence: question.sequence,
            countryId: question.countryId,
            answer: value,
            wasCorrect: outcome.wasCorrect,
            correctAnswer: outcome.correctAnswer,
            correctCountryName: outcome.correctCountryName,
            correctIsoCode: outcome.correctIsoCode,
          };
          saveGuestQuiz({
            session,
            answers: [
              ...(stored?.answers ?? []).filter((a) => a.sequence !== entry.sequence),
              entry,
            ].sort((a, b) => a.sequence - b.sequence),
          });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not check that answer');
      } finally {
        setBusy(false);
      }
    },
    [busy, isGuest, phase, question, session],
  );

  async function next(): Promise<void> {
    if (!session) return;
    const isLast = index >= session.questions.length - 1;
    if (!isLast) {
      setIndex((value) => value + 1);
      setPhase('answering');
      setTyped('');
      setChosenLabel(null);
      setResult(null);
      return;
    }
    setBusy(true);
    try {
      if (!isGuest) {
        await finishQuizSession(session.id);
      }
      router.push(`/quiz/${session.id}/results`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish the quiz');
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

  if (!session || !question) {
    return (
      <main className="app-shell">
        <p className="loading-note">Loading…</p>
      </main>
    );
  }

  const { category, format, direction } = session.quizType;
  const progress = total === 0 ? 0 : Math.round((answeredCount / total) * 100);

  return (
    <main className="app-shell">
      <div className="quiz-header">
        <Link className="icon-button" href="/" aria-label="Leave quiz">
          <IconX size={19} stroke={1.9} />
        </Link>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-counter">
          {index + 1}/{total}
        </span>
      </div>

      {category === 'trivia' ? (
        <div className="clue-card">
          <IconBulb size={18} stroke={1.8} className="clue-icon" />
          <span>{question.promptText}</span>
        </div>
      ) : (
        <div className="prompt">
          <span className="prompt-label">{question.promptLabel}</span>
          {question.promptIsoCode ? (
            <span className="prompt-flag">
              <Flag isoCode={question.promptIsoCode} variant="fill" />
            </span>
          ) : (
            <h2 className="prompt-text">{question.promptText}</h2>
          )}
        </div>
      )}

      {format === 'multiple_choice' ? (
        <div className={category === 'flags' ? 'options-grid' : 'options'}>
          {(question.options ?? []).map((option) => {
            const isCorrect = phase === 'revealed' && option.label === result?.correctAnswer;
            const isWrongPick =
              phase === 'revealed' && option.label === chosenLabel && !result?.wasCorrect;
            const classes = [
              'option',
              option.isoCode ? 'option--flag' : '',
              isCorrect ? 'option--correct' : '',
              isWrongPick ? 'option--wrong' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={option.id}
                type="button"
                className={classes}
                disabled={phase === 'revealed' || busy}
                onClick={() => {
                  setChosenLabel(option.label);
                  void answer(option.label);
                }}
              >
                {option.isoCode ? (
                  <>
                    <span className="option-flag-box">
                      <Flag isoCode={option.isoCode} label={option.label} variant="fill" />
                    </span>
                    <span className="option-caption">{option.label}</span>
                  </>
                ) : (
                  <span>{option.label}</span>
                )}
                {isCorrect ? (
                  <span className="option-mark">
                    <IconCheck size={17} stroke={2} />
                  </span>
                ) : null}
                {isWrongPick ? (
                  <span className="option-mark">
                    <IconX size={17} stroke={2} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="answer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void answer(typed);
          }}
        >
          <input
            ref={inputRef}
            className="answer-input"
            type="text"
            value={typed}
            placeholder={
              direction === 'country_to_attribute' && category === 'capitals'
                ? 'Type the capital'
                : 'Type the country'
            }
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            disabled={phase === 'revealed' || busy}
            onChange={(event) => setTyped(event.target.value)}
          />
          {phase === 'answering' ? (
            <>
              <button
                type="submit"
                className="button-secondary"
                disabled={busy || typed.trim() === ''}
              >
                Check answer
              </button>
              <button
                type="button"
                className="link-underline give-up"
                disabled={busy}
                onClick={() => void answer('', true)}
              >
                I don&rsquo;t know
              </button>
            </>
          ) : null}
        </form>
      )}

      {phase === 'revealed' && result ? (
        <>
          {format === 'type_in' ? (
            <div className={`result-row result-row--${result.wasCorrect ? 'correct' : 'wrong'}`}>
              {result.wasCorrect ? (
                <>
                  <IconCheck size={16} stroke={2} />
                  Correct
                </>
              ) : (
                <>
                  <IconX size={16} stroke={2} />
                  {result.correctAnswer}
                </>
              )}
            </div>
          ) : null}

          {result.newlyLearned ? (
            <p className="inline-note">
              {result.correctCountryName} is now learned — {result.currentStreak} in a row
            </p>
          ) : null}

          <button type="button" className="button-primary" onClick={() => void next()} disabled={busy}>
            {index >= total - 1 ? 'See results' : 'Next'}
            <IconArrowRight size={16} stroke={2} />
          </button>
        </>
      ) : null}
    </main>
  );
}
