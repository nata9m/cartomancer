'use client';

import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { IconTrash } from './icons';
import { deleteAccount } from '@/app/actions';

/** What the player types. Any casing counts; the api is sent the exact word. */
const CONFIRM_WORD = 'DELETE';

/**
 * Delete account, behind a confirmation (#64): a button that opens a panel, and
 * a final button that stays disabled until the word is typed. Never one tap.
 *
 * The word rather than the email, because on a phone retyping a long address —
 * or an Apple relay address, which is a string of random characters — is a worse
 * confirmation than a short word the player has just been told to type.
 *
 * Failure keeps the panel open with the reason and changes nothing: the server
 * action only returns when it did not succeed, and on success the page is already
 * on its way to /login. The 16px input is the base `input[type=text]` rule's,
 * kept on purpose for iOS (#10).
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  // Into the field on opening; back to the button that opened it on closing, so
  // a keyboard or screen-reader user is not dropped at the top of the page.
  useEffect(() => {
    if (open) {
      input.current?.focus();
    } else if (wasOpen.current) {
      trigger.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount(typed);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        ref={trigger}
        type="button"
        className="button-secondary button-danger"
        onClick={() => setOpen(true)}
      >
        <IconTrash size={16} stroke={1.9} />
        Delete account
      </button>
    );
  }

  return (
    <form
      className="danger-panel"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
      aria-labelledby="delete-title"
    >
      <h2 id="delete-title" className="danger-title">
        Delete your account?
      </h2>
      <p className="danger-text">
        This permanently deletes your account, your streak and everything you&rsquo;ve learned. This
        can&rsquo;t be undone.
      </p>
      <label className="field-label" htmlFor="delete-confirm">
        Type {CONFIRM_WORD} to confirm
      </label>
      <input
        ref={input}
        id="delete-confirm"
        type="text"
        className="account-input"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={pending}
        aria-describedby={error ? 'delete-error' : undefined}
      />
      {error ? (
        <p id="delete-error" className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="danger-actions">
        <button type="submit" className="button-danger-solid" disabled={!confirmed || pending}>
          {pending ? 'Deleting…' : 'Delete my account'}
        </button>
        <button type="button" className="button-secondary" onClick={close} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
