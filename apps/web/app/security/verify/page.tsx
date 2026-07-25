'use client';

import { Button, Field, Input, KeyRound } from '@delivery-os/ui';
import { type SyntheticEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';

export default function VerifyTwoFactorPage() {
  const [error, setError] = useState<string>();
  const [useRecovery, setUseRecovery] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const value = form.get('code');
    const code = typeof value === 'string' ? value : '';
    const result = useRecovery
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    window.location.assign('/');
  }

  return (
    <main className="onboarding-grid flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-md rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--content-primary)] text-[var(--content-inverse)]">
          <KeyRound aria-hidden size={20} />
        </span>
        <h1 className="mt-7 text-3xl font-extrabold tracking-[-0.045em]">Verify it’s you</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--content-secondary)]">
          {useRecovery
            ? 'Enter one unused recovery code.'
            : 'Enter the six-digit code from your authenticator app.'}
        </p>
        <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)}>
          <Field label={useRecovery ? 'Recovery code' : 'Authenticator code'}>
            <Input
              id="two-factor-code"
              name="code"
              autoComplete="one-time-code"
              inputMode={useRecovery ? 'text' : 'numeric'}
              pattern={useRecovery ? undefined : '[0-9]{6}'}
              required
              autoFocus
            />
          </Field>
          {error === undefined ? null : (
            <p className="text-sm text-[var(--state-danger-strong)]" role="alert">
              {error}
            </p>
          )}
          <Button className="w-full" type="submit">
            Continue
          </Button>
        </form>
        <button
          className="auth-link mt-5 text-sm"
          type="button"
          onClick={() => setUseRecovery(!useRecovery)}
        >
          {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
      </section>
    </main>
  );
}
