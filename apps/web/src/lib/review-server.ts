import 'server-only';
import type { ReviewByQuizType } from '@cartomancer/shared';
import { apiFetch, currentUserId } from './server-api';

/**
 * What the signed-in player has missed, by quiz type, for a game's start screen
 * to offer a review round under its own modes (#108).
 *
 * A guest has no progress, and a failure is not worth a screen: both are an empty
 * object, so the start screen simply shows no review entry and everything else on
 * it works.
 */
export async function loadReviewEntries(): Promise<ReviewByQuizType> {
  const userId = await currentUserId();
  if (!userId) return {};
  try {
    const response = await apiFetch<{ review: ReviewByQuizType }>('/api/review', { userId });
    return response.review ?? {};
  } catch {
    return {};
  }
}
