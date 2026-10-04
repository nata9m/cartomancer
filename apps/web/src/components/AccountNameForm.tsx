'use client';

import { useActionState, useEffect, useState } from 'react';
import { DISPLAY_NAME_MAX_LENGTH, displayNameProblem } from '@cartomancer/shared';
import { IconCheck } from './icons';
import { updateDisplayName } from '@/app/actions';
import type { NameFormState } from '@/lib/profile';

/**
 * The one editable thing on the account page (#61): the display name.
 *
 * Blank is allowed and means "use the fallback" — the api stores null and every
 * screen shows `fallback` in its place — which is also what the placeholder
 * says, so clearing the field is not a leap in the dark.
 *
 * The 16px input is the base `input[type=text]` rule's, kept on purpose: iOS
 * zooms the page in on any field under 16px and does not zoom back (#10).
 */
export function AccountNameForm({
  initialName,
  fallback,
}: {
  initialName: string | null;
  /** What the player is called while the field is blank. */
  fallback: string;
}) {
  const [state, formAction, pending] = useActionState<NameFormState, FormData>(
    updateDisplayName,
    { status: 'idle' },
  );
  const [value, setValue] = useState(initialName ?? '');
  const [saved, setSaved] = useState(initialName ?? '');

  // After a save, show what was actually stored (the api trims it).
  useEffect(() => {
    if (state.status === 'saved') {
      setSaved(state.name ?? '');
      setValue(state.name ?? '');
    }
  }, [state]);

  const trimmed = value.trim();
  const problem = trimmed === '' ? null : displayNameProblem(trimmed);
  const unchanged = trimmed === saved;
  const justSaved = state.status === 'saved' && unchanged && !pending;

  return (
    <form action={formAction} className="account-field" noValidate>
      <label className="field-label" htmlFor="display-name">
        Display name
      </label>
      <div className="field-row">
        <input
          id="display-name"
          name="name"
          type="text"
          className="account-input"
          value={value}
          placeholder={fallback}
          autoComplete="nickname"
          autoCapitalize="words"
          spellCheck={false}
          aria-invalid={problem ? true : undefined}
          aria-describedby="display-name-hint"
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="button-save" disabled={pending || unchanged || problem !== null}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p id="display-name-hint" className="field-hint">
        Up to {DISPLAY_NAME_MAX_LENGTH} characters. Leave it blank to be called {fallback}.
      </p>
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
      {state.status === 'error' && !problem && !unchanged ? (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      ) : null}
      {justSaved ? (
        <p className="field-saved" role="status">
          <IconCheck size={14} stroke={2.2} />
          Saved
        </p>
      ) : null}
    </form>
  );
}
