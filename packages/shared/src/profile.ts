/**
 * The rule for a display name, shared so the account form and the api cannot
 * disagree about what is allowed (#61): the form can say so before a request
 * goes out, and the api — the one that actually decides — enforces the same
 * thing.
 */
export const DISPLAY_NAME_MAX_LENGTH = 50;

/**
 * What is wrong with an already-trimmed display name, or null if it is fine.
 *
 * Length is counted in characters the player sees, not UTF-16 code units, so a
 * name made of emoji is not cut at half the limit. Control characters (a pasted
 * newline, a tab, a zero-width joiner on its own) are refused: a name is shown
 * on a single line, and an invisible one is a way to look like no name at all.
 */
export function displayNameProblem(trimmed: string): string | null {
  if (trimmed.length === 0) {
    return 'Name cannot be empty';
  }
  if (Array.from(trimmed).length > DISPLAY_NAME_MAX_LENGTH) {
    return `Name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`;
  }
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(trimmed)) {
    return 'Name cannot contain control or invisible characters';
  }
  return null;
}
