import { RecallRunner } from '@/components/RecallRunner';

export const dynamic = 'force-dynamic';

export default async function RecallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <RecallRunner sessionId={sessionId} />;
}
