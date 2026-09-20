import { QUESTION_COUNT_OPTIONS } from '@cartomancer/shared';
import { ModePicker } from '@/components/ModePicker';
import { readFilters } from '@/lib/filters';

export default async function TriviaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  return (
    <ModePicker
      title="Fun facts"
      filters={filters}
      groups={[
        {
          label: 'How many questions?',
          modes: QUESTION_COUNT_OPTIONS.map((count) => ({
            quizTypeKey: 'trivia-fact2c-type',
            questionCount: count,
            title: `${count} questions`,
            description: 'Read a clue, type the country it describes',
          })),
        },
      ]}
    />
  );
}
