'use client';

import { Button, Field, Input, KeyRound } from '@delivery-os/ui';
import { type SyntheticEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';

export default function ResetPasswordPage() {
  const [message, setMessage] = useState<string>();
  const [completed, setCompleted] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    const value = new FormData(event.currentTarget).get('password');
    const password = typeof value === 'string' ? value : '';
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    setCompleted(true);
    setMessage('Password updated. Return to sign in with your new password.');
  }

  return (
    <main className="onboarding-grid flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-md rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 sm:p-8">
        <KeyRound aria-hidden className="text-[var(--action-primary)]" size={24} />
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.045em]">Choose a new password</h1>
        {completed ? (
          <div className="mt-6 space-y-5">
            <p className="text-sm" role="status">
              {message}
            </p>
            <Button className="w-full" type="button" onClick={() => window.location.assign('/')}>
              Return to sign in
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)}>
            <Field label="New password" description="Use at least 12 characters.">
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </Field>
            {message === undefined ? null : (
              <p className="text-sm text-[var(--state-danger)]" role="alert">
                {message}
              </p>
            )}
            <Button className="w-full" type="submit">
              Update password
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
