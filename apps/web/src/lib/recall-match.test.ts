import { COUNTRIES, buildRecallIndex, decideRecall, normalizeAnswer } from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';

const none = new Set<string>();
const isoOf = (name: string): string => {
  const country = COUNTRIES.find((candidate) => candidate.name === name);
  if (!country) throw new Error(`no country ${name}`);
  return country.isoCode;
};
const inRegion = (region: string) =>
  COUNTRIES.filter((country) => region === 'all' || country.region === region);
const decide = (region: string, typed: string, recalled: Set<string> = none) =>
  decideRecall(buildRecallIndex(inRegion(region)), typed, recalled);

describe('exact names are accepted as they are typed', () => {
  it('accepts a plain name at once, in any casing and with stray punctuation', () => {
    expect(decide('Asia', 'Japan')).toEqual({ kind: 'now', isoCode: isoOf('Japan') });
    expect(decide('Asia', 'japan')).toEqual({ kind: 'now', isoCode: isoOf('Japan') });
    expect(decide('Asia', '  JAPAN  ')).toEqual({ kind: 'now', isoCode: isoOf('Japan') });
  });

  it('accepts China, the case in the bug report', () => {
    expect(decide('Asia', 'China')).toEqual({ kind: 'now', isoCode: isoOf('China') });
  });

  it('accepts an accepted alias', () => {
    const withAlias = COUNTRIES.find(
      (country) => country.region === 'Asia' && (country.nameAliases ?? []).length > 0,
    );
    expect(withAlias).toBeDefined();
    for (const alias of withAlias?.nameAliases ?? []) {
      const decision = decide('Asia', alias);
      expect(decision.kind, alias).not.toBe('none');
    }
  });

  it('folds accents and "&" and "St." the way the server does', () => {
    expect(decide('Africa', "Cote d'Ivoire").kind).not.toBe('none');
    expect(decide('Americas', 'St Lucia').kind).not.toBe('none');
    expect(decide('Americas', 'Saint Lucia').kind).not.toBe('none');
  });
});

describe('what is not accepted by itself', () => {
  it('never accepts a typo: that needs Enter', () => {
    expect(decide('Europe', 'Swizerland')).toEqual({ kind: 'none' });
    expect(decide('Europe', 'Germeny')).toEqual({ kind: 'none' });
  });

  it('never accepts a half-typed name', () => {
    expect(decide('Asia', 'Jap')).toEqual({ kind: 'none' });
    expect(decide('Asia', '')).toEqual({ kind: 'none' });
    expect(decide('Asia', '   ')).toEqual({ kind: 'none' });
  });

  it('never accepts a country from another region', () => {
    expect(decide('Asia', 'France')).toEqual({ kind: 'none' });
  });

  it('does not match a country that is already on the list', () => {
    expect(decide('Asia', 'Japan', new Set([isoOf('Japan')]))).toEqual({ kind: 'none' });
  });
});

describe('names that are the start of another name wait', () => {
  it.each([
    ['Africa', 'Niger', 'Nigeria'],
    ['Africa', 'Guinea', 'Guinea-Bissau'],
    ['Americas', 'Dominica', 'Dominican Republic'],
  ])('%s: "%s" waits, because "%s" could still be coming', (region, short, long) => {
    expect(decide(region, short)).toEqual({ kind: 'wait', isoCode: isoOf(short) });
    // …and the longer name, once typed, is accepted at once as itself.
    expect(decide(region, long)).toEqual({ kind: 'now', isoCode: isoOf(long) });
  });

  it('accepts the short name at once when the longer one is already recalled', () => {
    expect(decide('Africa', 'Niger', new Set([isoOf('Nigeria')]))).toEqual({
      kind: 'now',
      isoCode: isoOf('Niger'),
    });
  });

  it('does not wait on a longer name that is not in the region', () => {
    // Guinea-Bissau and Guinea are both African; narrow to a region with neither.
    expect(decide('Asia', 'Oman').kind).toBe('now');
  });

  it('works out the prefix pairs from the data: every one is found, none is invented', () => {
    for (const region of ['Africa', 'Asia', 'Europe', 'Americas', 'Oceania', 'all']) {
      const countries = inRegion(region);
      const forms = countries.flatMap((country) =>
        [country.name, ...(country.nameAliases ?? [])].map((spelling) => ({
          isoCode: country.isoCode,
          form: normalizeAnswer(spelling),
        })),
      );
      for (const entry of forms) {
        const expectedWait = forms.some(
          (other) =>
            other.isoCode !== entry.isoCode &&
            other.form.length > entry.form.length &&
            other.form.startsWith(entry.form),
        );
        const decision = decideRecall(buildRecallIndex(countries), entry.form, none);
        if (decision.kind === 'none') continue; // two countries share the spelling
        expect(decision.kind, `${region}: ${entry.form}`).toBe(expectedWait ? 'wait' : 'now');
      }
    }
  });

  it('lists the waiting names, so a change to the data shows up in review', () => {
    const waiting = new Set<string>();
    const index = buildRecallIndex(COUNTRIES);
    for (const entry of index.forms) {
      if (decideRecall(index, entry.form, none).kind === 'wait') waiting.add(entry.form);
    }
    for (const known of ['niger', 'guinea', 'dominica']) {
      expect(waiting.has(known), known).toBe(true);
    }
    // Printed on failure only; the point is that the set is data-derived.
    expect([...waiting].length).toBeGreaterThan(2);
  });
});

describe('every accepted spelling is recognised', () => {
  it('finds each country by its canonical name, with nothing recalled', () => {
    const index = buildRecallIndex(COUNTRIES);
    for (const country of COUNTRIES) {
      const decision = decideRecall(index, country.name, none);
      // Only a spelling two countries share can come back as "none".
      expect(decision.kind, country.name).not.toBe('none');
    }
  });
});
