/**
 * Regenerates packages/shared/src/country-details.ts.
 *
 * A refresh tool, never part of a build or a request path: the output is
 * committed, so the detail pages are instant, work whether or not any of these
 * services are up, and every change to a figure shows in a PR diff.
 *
 *   node packages/shared/scripts/fetch-country-details.mjs
 *
 * Sources, all of them cited on the page or in the README:
 *   - mledoze/countries (ODbL) — capitals, subregion, currencies, languages,
 *     calling code, area, TLD. Matched on ISO 3166-1 alpha-2, which is the key
 *     countries.ts already carries.
 *   - datasets/population (World Bank, CC BY 4.0) — the latest population per
 *     country, with the year it is for. A figure without its year ages badly.
 *   - Wikipedia REST summary (CC BY-SA 4.0) — the two-or-three sentence
 *     description and the canonical article URL. This is the one source that is
 *     not always reachable; see NO_WIKIPEDIA below.
 *
 * Nothing here is invented. Where a source has a hole, OVERRIDES fills it with
 * a stated fact and a note saying why, rather than the generator guessing.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COUNTRIES } = require('../dist/countries.js');
const { normalizeAnswer } = require('../dist/matching.js');

const MLEDOZE = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const POPULATION = 'https://raw.githubusercontent.com/datasets/population/main/data/population.csv';
const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

/**
 * Holes in the upstream data, each one a fact rather than a guess. Keep this
 * list short: anything that grows past a handful means the source is wrong for
 * the job.
 */
const OVERRIDES = {
  // mledoze carries an empty currency map for Micronesia. It has used the US
  // dollar since independence and issues no currency of its own.
  FM: { currencies: [{ code: 'USD', name: 'United States dollar' }] },
  // The World Bank does not publish a figure for Vatican City. This one is from
  // samayo/country-json, which gives no year, so the page shows none.
  // Its calling code needs stating too: mledoze splits +379 into root "+3" and
  // suffix "79", and the rule below (root alone when a root is shared) would
  // otherwise print "+3", which is nobody's calling code.
  VA: { population: 825, populationYear: null, callingCode: '+379' },
  // mledoze lists only Sucre. La Paz is the seat of government and the other
  // half of the answer the app already accepts for Bolivia.
  BO: { extraCapitals: ['La Paz'] },
};

/** Wikipedia article titles that are not the country's common name. */
const WIKI_TITLES = {
  CI: 'Ivory Coast',
  CD: 'Democratic Republic of the Congo',
  CG: 'Republic of the Congo',
  KP: 'North Korea',
  KR: 'South Korea',
  VA: 'Vatican City',
  PS: 'State of Palestine',
  TL: 'East Timor',
  CZ: 'Czech Republic',
  SZ: 'Eswatini',
  MK: 'North Macedonia',
  CV: 'Cape Verde',
  MM: 'Myanmar',
  TR: 'Turkey',
  GB: 'United Kingdom',
  US: 'United States',
  AE: 'United Arab Emirates',
  ST: 'São Tomé and Príncipe',
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

/**
 * The description and the canonical article URL. Returns null when Wikipedia
 * cannot be reached, so a refresh behind a restrictive network policy keeps the
 * descriptions already committed instead of blanking all 195.
 */
async function wikipedia(country) {
  const title = WIKI_TITLES[country.isoCode] ?? country.name;
  try {
    const summary = await getJson(WIKI_SUMMARY + encodeURIComponent(title.replace(/ /g, '_')));
    return {
      description: condense(summary.extract ?? ''),
      wikipediaUrl: summary.content_urls?.desktop?.page ?? '',
    };
  } catch {
    return null;
  }
}

/** Wikipedia leads run long; the page wants the first two or three sentences. */
function condense(extract) {
  const sentences = extract.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
  const wanted = [];
  for (const sentence of sentences) {
    wanted.push(sentence.trim());
    if (wanted.length >= 3 || wanted.join(' ').length > 320) break;
  }
  return wanted.join(' ').trim();
}

const [mledoze, populationCsv] = await Promise.all([getJson(MLEDOZE), getText(POPULATION)]);
const byIso2 = new Map(mledoze.map((row) => [row.cca2, row]));
const populations = latestPopulations(populationCsv);

let wikipediaReachable = true;
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

  const page = wikipediaReachable ? await wikipedia(country) : null;
  if (wikipediaReachable && page === null) {
    wikipediaReachable = false;
    console.warn(
      '! Wikipedia is unreachable from here, so descriptions and article URLs are\n' +
        '  left as they are. Every other field is still refreshed. Re-run this with\n' +
        '  en.wikipedia.org allowed to fill them.',
    );
  }

  // The app's own capital leads, then anything more the dataset knows. Taking
  // the dataset's list wholesale would contradict the quizzes: it calls
  // Eswatini's capital Lobamba and Sri Lanka's Colombo, where countries.ts —
  // and therefore every question and answer in the app — says Mbabane and Sri
  // Jayawardenepura Kotte. Both are true of those countries; only one is the
  // answer the app teaches, so that one goes first.
  // Deduplicated with the app's own answer normaliser rather than on the exact
  // string: the two sources spell the same city differently often enough that
  // "Washington, D.C." and "Washington D.C." both came through as capitals of
  // the United States. Whichever spelling countries.ts uses is the one kept,
  // because it is the one the quizzes print.
  const capitals = [];
  const seenCapitals = new Set();
  for (const capital of [country.capital, ...(row.capital ?? []), ...(override.extraCapitals ?? [])]) {
    const key = normalizeAnswer(capital);
    if (key === '' || seenCapitals.has(key)) continue;
    seenCapitals.add(key);
    capitals.push(capital);
  }

  const detail = {
    isoCode: country.isoCode,
    description: page?.description ?? '',
    wikipediaUrl: page?.wikipediaUrl ?? '',
    capitals,
    subregion: row.subregion ?? '',
    population: override.population ?? population?.value ?? 0,
    populationYear:
      'populationYear' in override ? override.populationYear : (population?.year ?? null),
    areaKm2: row.area ?? 0,
    currencies:
      override.currencies ??
      Object.entries(row.currencies ?? {}).map(([code, value]) => ({ code, name: value.name })),
    languages: Object.values(row.languages ?? {}),
    // One suffix means the full code is root + suffix. Several means the root is
    // itself the country code and the suffixes are area codes within it (+1 for
    // the NANP countries, +7 for Russia and Kazakhstan), so the root stands
    // alone. Vatican City is the exception, and is overridden above.
    callingCode:
      override.callingCode ??
      `${row.idd?.root ?? ''}${(row.idd?.suffixes ?? []).length === 1 ? row.idd.suffixes[0] : ''}`,
    tld: (row.tld ?? [])[0] ?? '',
  };

  for (const [field, value] of Object.entries(detail)) {
    const empty = Array.isArray(value) ? value.length === 0 : value === '' || value === 0;
    // description/wikipediaUrl are allowed to be empty when Wikipedia is out of
    // reach; populationYear is legitimately null for Vatican City.
    if (empty && !['description', 'wikipediaUrl', 'populationYear'].includes(field)) {
      gaps.push(`${country.name} (${country.isoCode}): ${field} is empty`);
    }
  }
  details.push(detail);
}

if (gaps.length > 0) {
  console.warn(`\n! ${gaps.length} gap(s) — add an OVERRIDE for each, or fix the source:`);
  for (const gap of gaps) console.warn('   ' + gap);
}

const header = `/**
 * Reference data for the country detail pages (#38). Generated — do not edit by
 * hand; run \`node packages/shared/scripts/fetch-country-details.mjs\` instead,
 * which explains where every field comes from.
 *
 * Sources: mledoze/countries (ODbL), World Bank population via
 * datasets/population (CC BY 4.0), and Wikipedia article leads (CC BY-SA 4.0).
 * The page shows the Wikipedia attribution that licence requires.
 */
import type { CountryDetail } from './api.js';

export const COUNTRY_DETAILS: Readonly<Record<string, CountryDetail>> = {
`;

const body = details
  .map((detail) => `  ${detail.isoCode}: ${JSON.stringify(detail)},`)
  .join('\n');

writeFileSync(
  new URL('../src/country-details.ts', import.meta.url),
  `${header}${body}\n};\n\nexport function countryDetailFor(isoCode: string): CountryDetail | undefined {\n  return COUNTRY_DETAILS[isoCode.toUpperCase()];\n}\n`,
);

console.log(
  `\nWrote ${details.length} countries` +
    (wikipediaReachable ? ' with descriptions.' : ' WITHOUT descriptions (Wikipedia unreachable).'),
);
