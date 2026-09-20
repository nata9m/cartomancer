import { QuizResults } from '@/components/QuizResults';

export const dynamic = 'force-dynamic';

export default async function QuizResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <QuizResults sessionId={sessionId} />;
}
