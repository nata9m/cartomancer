import { RecallModePicker } from '@/components/RecallModePicker';
import { readFilters } from '@/lib/filters';

/**
 * /recall — the Countries start screen, sitting next to /recall/[sessionId],
 * which is a round in progress. Not /countries: that is the register from #26.
 */
export default async function RecallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  return <RecallModePicker filters={filters} />;
}
