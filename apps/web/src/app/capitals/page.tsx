import { ModePicker } from '@/components/ModePicker';
import { readFilters } from '@/lib/filters';

export default async function CapitalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  return (
    <ModePicker
      title="Capitals"
      filters={filters}
      groups={[
        {
          label: 'Multiple choice',
          modes: [
            {
              quizTypeKey: 'capitals-c2cap-mc',
              title: 'Country → capital',
              description: 'Pick the capital city of the country shown',
            },
            {
              quizTypeKey: 'capitals-cap2c-mc',
              title: 'Capital → country',
              description: 'Pick the country a capital belongs to',
            },
          ],
        },
        {
          label: 'Type the answer',
          modes: [
            {
              quizTypeKey: 'capitals-c2cap-type',
              title: 'Country → capital',
              description: 'Type the capital city of the country shown',
            },
            {
              quizTypeKey: 'capitals-cap2c-type',
              title: 'Capital → country',
              description: 'Type the country a capital belongs to',
            },
          ],
        },
      ]}
    />
  );
}
