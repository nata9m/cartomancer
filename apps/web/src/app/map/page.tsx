import { ModePicker } from '@/components/ModePicker';
import { readFilters } from '@/lib/filters';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilters(await searchParams);

  return (
    <ModePicker
      title="Map"
      filters={filters}
      groups={[
        {
          label: 'Find it on the map',
          modes: [
            {
              quizTypeKey: 'map-c2loc',
              title: 'Country → location',
              description: 'Tap the country on a world map',
            },
            {
              quizTypeKey: 'map-cap2loc',
              title: 'Capital → location',
              description: 'Tap the country that has the capital shown',
            },
          ],
        },
      ]}
    />
  );
}
