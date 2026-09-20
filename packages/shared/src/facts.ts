import type { CountrySeed } from './countries.js';

export interface CountryFactSeed {
  /** Canonical country name, matched against `countries.name` at seed time. */
  countryName: CountrySeed['name'] | string;
  fact: string;
}

/**
 * TODO(trivia): this is a starter set for testing the trivia quiz end to end,
 * not the finished content. The remaining ~185 countries still need clues
 * authored. Adding them is a data-only change: append rows here and re-run the
 * seed (facts are upserted on (country, fact), so re-seeding is idempotent and
 * safe to run against a populated database).
 *
 * Writing guidance for whoever extends this: a clue should be guessable but not
 * a giveaway, and must never name the country, its capital or its people.
 */
export const COUNTRY_FACTS: readonly CountryFactSeed[] = [
  {
    countryName: 'Japan',
    fact: 'It has more than 6,800 islands, and vending machines outnumber people in some city blocks.',
  },
  {
    countryName: 'Bolivia',
    fact: 'Home to the world’s largest salt flat, which floods into a mirror the size of a small country.',
  },
  {
    countryName: 'Iceland',
    fact: 'It has no mosquitoes, and its parliament — founded in 930 AD — is among the oldest still sitting.',
  },
  {
    countryName: 'Canada',
    fact: 'It has the longest coastline of any country, and more lakes than the rest of the world combined.',
  },
  {
    countryName: 'Vatican City',
    fact: 'The smallest sovereign state on earth, with a population you could seat in a school assembly hall.',
  },
  {
    countryName: 'Bhutan',
    fact: 'It measures national success by Gross National Happiness and is carbon negative.',
  },
  {
    countryName: 'Nauru',
    fact: 'A single raised coral island, once the richest place per person on earth thanks to bird droppings.',
  },
  {
    countryName: 'Chile',
    fact: 'It stretches over 4,300 km north to south but averages only about 180 km wide.',
  },
  {
    countryName: 'Lesotho',
    fact: 'Entirely surrounded by one neighbour, and no part of it sits below 1,400 m above sea level.',
  },
  {
    countryName: 'Mongolia',
    fact: 'The least densely populated sovereign country, where roughly a quarter of people are nomadic.',
  },
];
