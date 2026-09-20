import { QuizRunner } from '@/components/QuizRunner';

export const dynamic = 'force-dynamic';

export default async function QuizPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <QuizRunner sessionId={sessionId} />;
}
