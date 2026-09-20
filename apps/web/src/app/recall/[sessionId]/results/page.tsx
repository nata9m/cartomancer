import { RecallResults } from '@/components/RecallResults';

export const dynamic = 'force-dynamic';

export default async function RecallResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <RecallResults sessionId={sessionId} />;
}
