'use client';

import type { ReviewSummary } from '@cartomancer/shared';
import { CardShell } from './Cards';
import { IconRefresh } from './icons';
import { pendingKeyFor, useSessionStarter } from '@/lib/use-start';

/**
 * "N countries need review" (#51): a signed-in player's missed countries, one
 * tap from a round of exactly those. Only rendered when there are any, so the
 * home screen does not grow a card that says nothing.
 */
export function ReviewCard({ review }: { review: ReviewSummary }) {
  const { startReview, pendingKey, error } = useSessionStarter({
    region: 'all',
    difficulty: 'all',
    questionCount: '',
  });
  const pending = pendingKey === pendingKeyFor(review.quizTypeKey, review.countryIds.length);
  const noun = review.count === 1 ? 'country needs' : 'countries need';

  return (
    <>
      <button
        type="button"
        className="card"
        onClick={() => void startReview(review.quizTypeKey, review.countryIds)}
        disabled={pendingKey !== null}
        aria-busy={pending}
      >
        <CardShell
          icon={<IconRefresh size={19} stroke={1.75} />}
          title={`${review.count} ${noun} review`}
          description={pending ? 'Starting…' : `${review.quizTypeName} · ${review.directionLabel}`}
        />
      </button>
      {error ? <p className="error-note">{error}</p> : null}
    </>
  );
}
