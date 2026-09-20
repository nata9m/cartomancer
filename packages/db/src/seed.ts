import 'dotenv/config';
/**
 * Seeds reference data: the 9 quiz types, all 195 countries, and the starter
 * trivia clues.
 *
 * Idempotent by design — every write is an upsert keyed on a natural key
 * (quiz_types.key, countries.iso_code, country_facts(country_id, fact)) — so it
 * is safe to re-run against a populated database. That is what makes swapping
 * in the real difficulty tiers a one-file data edit: change the values in
 * @cartomancer/shared's COUNTRIES array and re-run this script. User progress
 * is never touched.
 */
import { COUNTRIES, COUNTRY_FACTS, QUIZ_TYPES, TOTAL_COUNTRIES } from '@cartomancer/shared';
import { createPrismaClient } from './client.js';

const prisma = createPrismaClient();

async function seedQuizTypes(): Promise<void> {
  for (const quizType of QUIZ_TYPES) {
    await prisma.quizType.upsert({
      where: { key: quizType.key },
      create: {
        key: quizType.key,
        category: quizType.category,
        displayName: `${quizType.displayName} · ${quizType.directionLabel}`,
        format: quizType.format,
        isActive: quizType.isActive,
      },
      update: {
        category: quizType.category,
        displayName: `${quizType.displayName} · ${quizType.directionLabel}`,
        format: quizType.format,
        isActive: quizType.isActive,
      },
    });
  }
  console.log(`  quiz_types: ${QUIZ_TYPES.length} rows`);
}

async function seedCountries(): Promise<void> {
  if (COUNTRIES.length !== TOTAL_COUNTRIES) {
    throw new Error(
      `Expected ${TOTAL_COUNTRIES} countries (UN members + observer states), found ${COUNTRIES.length}`,
    );
  }
  for (const country of COUNTRIES) {
    const data = {
      name: country.name,
      capital: country.capital,
      region: country.region,
      difficulty: country.difficulty,
      aliases: country.aliases,
    };
    await prisma.country.upsert({
      where: { isoCode: country.isoCode },
      create: { ...data, isoCode: country.isoCode },
      update: data,
    });
  }
  console.log(`  countries: ${COUNTRIES.length} rows`);
}

async function seedFacts(): Promise<void> {
  let written = 0;
  for (const entry of COUNTRY_FACTS) {
    const country = await prisma.country.findFirst({ where: { name: entry.countryName } });
    if (!country) {
      throw new Error(`Fact references unknown country "${entry.countryName}"`);
    }
    await prisma.countryFact.upsert({
      where: { countryId_fact: { countryId: country.id, fact: entry.fact } },
      create: { countryId: country.id, fact: entry.fact },
      update: {},
    });
    written += 1;
  }
  console.log(`  country_facts: ${written} rows (starter set — see TODO(trivia))`);
}

async function main(): Promise<void> {
  console.log('Seeding Cartomancer reference data…');
  await seedQuizTypes();
  await seedCountries();
  await seedFacts();

  const placeholderTiers = await prisma.country.count({ where: { difficulty: 'Medium' } });
  if (placeholderTiers === TOTAL_COUNTRIES) {
    console.log(
      '\n  NOTE: all 195 countries carry the placeholder difficulty "Medium".\n' +
        '  Difficulty filters therefore behave as no-ops until the approved tier\n' +
        '  draft is pasted into packages/shared/src/countries.ts. See TODO(difficulty).',
    );
  }
  console.log('\nDone.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
