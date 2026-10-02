/**
 * Salted hashes of a type-in question's accepted answers (#69).
 *
 * The type-in quizzes accept a correct answer the moment it is typed, with no
 * Enter and no request per keystroke. That means the browser has to recognise
 * the answer on its own — but unlike active recall (#68), where the valid names
 * are the whole point of the question, here the answer is the secret. So the
 * question carries `sha256(salt + ':' + normalizeAnswer(form))` for the
 * canonical answer and each accepted alias, and the client hashes what the
 * player typed and compares. The salt is new for every question set, so the
 * hashes in one payload say nothing about any other.
 *
 * This is a deterrent, not a security boundary, and it is not sold as one:
 * anyone willing to open DevTools can hash the 195 capitals against the salt
 * and find the match, and the number of hashes hints at how many spellings are
 * accepted. That is fine for a learning game with no leaderboards — it is no
 * easier than looking the answer up — and the trade it buys is real: the answer
 * is not sitting in the page source for anyone who glances at it.
 *
 * What this never does is decide anything. A local match submits through the
 * ordinary answer path and the **server stays the judge**: it re-matches,
 * scores, and owns streaks and `is_learned`. A tampered client can only make
 * itself send an answer, which is what typing already does.
 */
import { normalizeAnswer } from './matching.js';

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * A fresh salt for one question set. 16 bytes: this only has to be unguessable
 * before the payload arrives, and it travels next to the hashes it salts.
 */
export function createAnswerSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * The hash a given spelling of the answer gets under this salt, or null when
 * the input normalises to nothing (an empty box, or punctuation alone) and so
 * cannot match anything.
 *
 * Web Crypto rather than `node:crypto` deliberately: one implementation that
 * the api and the browser both run, so "exactly right" cannot mean two
 * different things on the two sides. The normaliser is already shared for the
 * same reason.
 */
export async function hashAnswer(salt: string, answer: string): Promise<string | null> {
  const normalized = normalizeAnswer(answer);
  if (normalized.length === 0) {
    return null;
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${normalized}`),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * Is what the player typed exactly one of the accepted answers? Only exact
 * (normalised) spellings can match — a typo hashes to something else entirely,
 * which is the point: a near miss is never auto-accepted mid-word, it waits for
 * Enter and the server's fuzzy pass.
 *
 * Returns false rather than throwing when Web Crypto is unavailable — an http
 * origin that isn't localhost, a browser with it switched off. Auto-accept is
 * then simply off, and Enter / Check answer work as they always have.
 */
export async function matchesAcceptedAnswer(
  salt: string,
  answerHashes: readonly string[],
  typed: string,
): Promise<boolean> {
  if (answerHashes.length === 0) {
    return false;
  }
  try {
    const hash = await hashAnswer(salt, typed);
    return hash !== null && answerHashes.includes(hash);
  } catch {
    return false;
  }
}
