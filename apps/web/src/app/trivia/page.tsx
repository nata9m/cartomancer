import { TriviaModePicker } from '@/components/TriviaModePicker';
import { readFilters } from '@/lib/filters';

export default async function TriviaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  return <TriviaModePicker filters={filters} />;
}
