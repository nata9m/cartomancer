import { ModePicker } from '@/components/ModePicker';
import { readFilters } from '@/lib/filters';

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  return (
    <ModePicker
      title="Flags"
      filters={filters}
      groups={[
        {
          label: 'Multiple choice',
          modes: [
            {
              quizTypeKey: 'flags-flag2c-mc',
              title: 'Flag → country',
              description: 'Pick the country a flag belongs to',
            },
            {
              quizTypeKey: 'flags-c2flag-mc',
              title: 'Country → flag',
              description: 'Pick the flag of the country shown',
            },
          ],
        },
        {
          label: 'Type the answer',
          modes: [
            {
              quizTypeKey: 'flags-flag2c-type',
              title: 'Flag → country',
              description: 'Type the country a flag belongs to',
            },
          ],
        },
      ]}
    />
  );
}
