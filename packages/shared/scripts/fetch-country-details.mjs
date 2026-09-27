/**
 * Regenerates packages/shared/src/country-details.ts.
 *
 * A refresh tool, never part of a build or a request path: the output is
 * committed, so the detail pages are instant, work whether or not either
 * service is up, and every change to a figure shows in a PR diff.
 *
 *   node packages/shared/scripts/fetch-country-details.mjs
 *
 * It fetches only what the repo does not already know. Capitals, flags, regions
 * and the trivia clues are all in countries.ts and facts.ts already, so this
 * carries two fields and no more:
 *
 *   - languages, from mledoze/countries (ODbL)
 *   - population and the year it is for, from the World Bank series published
 *     as datasets/population (CC BY 4.0). A figure without its year ages badly.
 *
 * Both licences want attribution, which the detail page carries.
 *
 * Nothing here is invented. Where a source has a hole, OVERRIDES fills it with
 * a stated fact and a note saying why, rather than the generator guessing.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COUNTRIES } = require('../dist/countries.js');

const MLEDOZE = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const POPULATION = 'https://raw.githubusercontent.com/datasets/population/main/data/population.csv';

/**
 * Holes in the upstream data, each one a fact rather than a guess. Keep this
 * list short: anything that grows past a handful means the source is wrong for
 * the job.
 */
const OVERRIDES = {
  // The World Bank publishes no figure for Vatican City. This one is from
  // samayo/country-json, which gives no year, so the page shows none.
  VA: { population: 825, populationYear: null },
};

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

/** The latest year on record for each ISO 3166-1 alpha-3 code. */
function latestPopulations(csv) {
  const latest = new Map();
  for (const line of csv.trim().split('\n').slice(1)) {
    // Country names carry commas ("Korea, Rep."), so the two quoted-or-plain
    // leading fields are matched rather than split on.
    const match = line.match(/^(?:"([^"]*)"|([^,]*)),(?:"([^"]*)"|([^,]*)),([^,]*),([^,]*)$/);
    if (!match) continue;
    const code = (match[3] ?? match[4] ?? '').trim();
    const year = Number(match[5]);
    const value = Number(match[6]);
    if (!code || !Number.isFinite(year) || !Number.isFinite(value)) continue;
    const seen = latest.get(code);
    if (!seen || year > seen.year) latest.set(code, { year, value: Math.round(value) });
  }
  return latest;
}

const [mledoze, populationCsv] = await Promise.all([getJson(MLEDOZE), getText(POPULATION)]);
const byIso2 = new Map(mledoze.map((row) => [row.cca2, row]));
const populations = latestPopulations(populationCsv);

const details = [];
const gaps = [];

for (const country of COUNTRIES) {
  const row = byIso2.get(country.isoCode);
  if (!row) {
    gaps.push(`${country.name}: absent from mledoze/countries`);
    continue;
  }
  const override = OVERRIDES[country.isoCode] ?? {};
  const population = populations.get(row.cca3);

  const detail = {
    isoCode: country.isoCode,
    population: override.population ?? population?.value ?? 0,
    populationYear:
      'populationYear' in override ? override.populationYear : (population?.year ?? null),
    languages: Object.values(row.languages ?? {}),
  };

  if (detail.population === 0) gaps.push(`${country.name} (${country.isoCode}): no population`);
  if (detail.languages.length === 0) gaps.push(`${country.name} (${country.isoCode}): no language`);
  details.push(detail);
}

if (gaps.length > 0) {
  console.warn(`\n! ${gaps.length} gap(s) — add an OVERRIDE for each, or fix the source:`);
  for (const gap of gaps) console.warn('   ' + gap);
  process.exitCode = 1;
}

const header = `/**
 * The two facts the detail pages need that the repo does not already hold.
 * Generated — do not edit by hand; run
 * \`node packages/shared/scripts/fetch-country-details.mjs\`, which says where
 * each field comes from.
 *
 * Sources: languages from mledoze/countries (ODbL), population from the World
 * Bank series published as datasets/population (CC BY 4.0). The detail page
 * carries the attribution both licences ask for.
 */
import type { CountryDetail } from './api.js';

export const COUNTRY_DETAILS: Readonly<Record<string, CountryDetail>> = {
`;

writeFileSync(
  new URL('../src/country-details.ts', import.meta.url),
  `${header}${details.map((detail) => `  ${detail.isoCode}: ${JSON.stringify(detail)},`).join('\n')}\n};\n\nexport function countryDetailFor(isoCode: string): CountryDetail | undefined {\n  return COUNTRY_DETAILS[isoCode.toUpperCase()];\n}\n`,
);

console.log(`Wrote ${details.length} countries.`);
