import { TriviaModePicker } from '@/components/TriviaModePicker';
import { readFilters } from '@/lib/filters';
import { loadReviewEntries } from '@/lib/review-server';

export default async function TriviaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  const review = await loadReviewEntries();

  return <TriviaModePicker filters={filters} review={review} />;
}
