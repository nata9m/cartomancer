import { normalizeAnswer } from './matching.js';

/**
 * Recognising a typed country as it is typed, in Countries recall (#88, from #68).
 *
 * The valid answers in recall are not secret — naming them is the game — so the
 * browser holds the region's names and judges the box on every change, and only
 * calls the api once something is exactly right. "Exactly" is `normalizeAnswer`
 * equality against the canonical name or an accepted alias, the same fold the
 * server's exact pass uses, so the browser never accepts what the server would
 * not. Anything fuzzy is left to Enter: a typo is never accepted by itself.
 *
 * What the browser must not do is accept a name that is only the start of
 * another: "Niger" is a country, and also the first five letters of Nigeria,
 * Guinea of Guinea-Bissau, Dominica of the Dominican Republic. Those wait a
 * beat for more typing instead of accepting at once. The set of such names is
 * worked out from the data each time, not listed, so it cannot go stale when a
 * country or alias is added.
 */

export interface RecallCountry {
  /** Identifies the country across the recalled list and the region's names (ISO 3166-1 alpha-2). */
  isoCode: string;
  name: string;
  nameAliases?: readonly string[];
}

interface Form {
  isoCode: string;
  /** `normalizeAnswer` of a name or alias. */
  form: string;
}

export interface RecallIndex {
  forms: Form[];
}

/** One entry per accepted spelling, folded the way the server folds it. */
export function buildRecallIndex(countries: readonly RecallCountry[]): RecallIndex {
  const forms: Form[] = [];
  for (const country of countries) {
    const seen = new Set<string>();
    for (const spelling of [country.name, ...(country.nameAliases ?? [])]) {
      const form = normalizeAnswer(spelling);
      if (form !== '' && !seen.has(form)) {
        seen.add(form);
        forms.push({ isoCode: country.isoCode, form });
      }
    }
  }
  return { forms };
}

export type RecallDecision =
  /** Exactly one unrecalled country, and nothing longer could still be meant: accept now. */
  | { kind: 'now'; isoCode: string }
  /** Exactly one, but it is also the start of another unrecalled name: accept if typing stops. */
  | { kind: 'wait'; isoCode: string }
  /** Not an exact match, or already recalled, or ambiguous: leave it to Enter. */
  | { kind: 'none' };

const NONE: RecallDecision = { kind: 'none' };

/**
 * What to do with the box as it stands. `recalled` is the ISO codes already on
 * the list: they never match (typing a country twice is no reason to say so
 * before Enter), and they do not make a name a prefix either, so "Niger" is
 * accepted at once once Nigeria is on the list.
 */
export function decideRecall(
  index: RecallIndex,
  typed: string,
  recalled: ReadonlySet<string>,
): RecallDecision {
  const form = normalizeAnswer(typed);
  if (form === '') return NONE;

  const open = index.forms.filter((entry) => !recalled.has(entry.isoCode));
  const hits = new Set(open.filter((entry) => entry.form === form).map((entry) => entry.isoCode));
  // Two countries answering to the same spelling is for the server to settle.
  if (hits.size !== 1) return NONE;
  const [isoCode] = [...hits] as [string];

  const longerElsewhere = open.some(
    (entry) =>
      entry.isoCode !== isoCode && entry.form.length > form.length && entry.form.startsWith(form),
  );
  return longerElsewhere ? { kind: 'wait', isoCode } : { kind: 'now', isoCode };
}

/** How long typing must pause before a name that is also a prefix is taken. */
export const RECALL_PREFIX_WAIT_MS = 700;
