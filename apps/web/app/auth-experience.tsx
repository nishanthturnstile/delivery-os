'use client';

import {
  ArrowRight,
  Button,
  Field,
  GitBranch,
  Input,
  KeyRound,
  Mail,
  ShieldCheck,
} from '@delivery-os/ui';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';

type Mode = 'sign-in' | 'create' | 'magic' | 'reset';

function errorMessage(error: { message?: string | undefined } | null): string {
  return error?.message ?? 'The request could not be completed. Try again.';
}

function formValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function AuthExperience() {
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    // Prevent pre-hydration clicks from being silently dropped on the server-rendered auth form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    const form = new FormData(event.currentTarget);
    const email = formValue(form, 'email').trim().toLowerCase();
    const password = formValue(form, 'password');
    try {
      if (mode === 'create') {
        const result = await authClient.signUp.email({
          name: formValue(form, 'name').trim(),
          email,
          password,
          callbackURL: '/',
        });
        if (result.error) throw new Error(errorMessage(result.error));
        setNotice('Check your inbox to verify your email, then return to sign in.');
      } else if (mode === 'magic') {
        const result = await authClient.signIn.magicLink({
          email,
          callbackURL: '/',
          newUserCallbackURL: '/',
          errorCallbackURL: '/',
        });
        if (result.error) throw new Error(errorMessage(result.error));
        setNotice('If the address can sign in, a one-time link is on its way.');
      } else if (mode === 'reset') {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: '/auth/reset-password',
        });
        if (result.error) throw new Error(errorMessage(result.error));
        setNotice('If the account exists, password reset instructions are on their way.');
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
        });
        if (result.error) throw new Error(errorMessage(result.error));
        if (
          result.data !== null &&
          'twoFactorRedirect' in result.data &&
          result.data.twoFactorRedirect === true
        ) {
          return;
        }
        const authenticatedSession = await authClient.getSession();
        if (authenticatedSession.error !== null || authenticatedSession.data === null) {
          throw new Error('The email or password is incorrect, or this account cannot sign in.');
        }
        window.location.assign('/');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setPending(false);
    }
  }

  const title = {
    'sign-in': 'Welcome back',
    create: 'Create your account',
    magic: 'Use a magic link',
    reset: 'Reset your password',
  }[mode];

  return (
    <main className="auth-grid min-h-screen lg:grid lg:grid-cols-[minmax(28rem,0.92fr)_minmax(32rem,1.08fr)]">
      <section className="relative flex min-h-[26rem] flex-col overflow-hidden bg-[var(--content-primary)] px-6 py-7 text-[var(--content-inverse)] sm:px-10 lg:min-h-screen lg:px-14 lg:py-10">
        <div className="auth-orb absolute -top-32 -left-20 size-[28rem] rounded-full" aria-hidden />
        <a
          className="relative z-10 flex w-fit items-center gap-3"
          href="/"
          aria-label="Delivery OS"
        >
          <span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-white text-[var(--content-primary)]">
            <GitBranch aria-hidden size={18} strokeWidth={2.3} />
          </span>
          <span className="font-bold tracking-[-0.02em]">Delivery OS</span>
        </a>
        <div className="relative z-10 my-auto max-w-xl py-16">
          <p className="font-mono text-xs font-semibold tracking-[0.14em] text-[var(--trace-accent)] uppercase">
            Identity · tenancy · trust
          </p>
          <h1 className="mt-5 text-[clamp(2.8rem,6vw,5.8rem)] leading-[0.92] font-extrabold tracking-[-0.065em]">
            Your delivery context, kept in bounds.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-white/68">
            One identity can move between explicit workspaces. Every role, invitation, and
            privileged action stays attributable.
          </p>
        </div>
        <div className="relative z-10 grid gap-3 border-t border-white/12 pt-6 text-sm text-white/66 sm:grid-cols-3">
          <span className="flex items-center gap-2">
            <ShieldCheck aria-hidden size={16} /> Verified access
          </span>
          <span className="flex items-center gap-2">
            <KeyRound aria-hidden size={16} /> TOTP step-up
          </span>
          <span className="flex items-center gap-2">
            <Mail aria-hidden size={16} /> Domain-neutral invites
          </span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
            Secure workspace access
          </p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.05em]">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--content-secondary)]">
            {mode === 'create'
              ? 'Verify your email before creating your first workspace.'
              : 'Access is granted by invitation and membership—never by email domain.'}
          </p>

          <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
            {mode === 'create' ? (
              <Field label="Display name">
                <Input
                  id="auth-name"
                  name="name"
                  autoComplete="name"
                  disabled={!hydrated}
                  minLength={1}
                  maxLength={120}
                  required
                />
              </Field>
            ) : null}
            <Field label="Email address">
              <Input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                disabled={!hydrated}
                required
              />
            </Field>
            {mode === 'sign-in' || mode === 'create' ? (
              <Field
                label="Password"
                description={mode === 'create' ? 'Use at least 12 characters.' : undefined}
              >
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  disabled={!hydrated}
                  minLength={12}
                  required
                />
              </Field>
            ) : null}

            <div aria-live="polite">
              {notice === undefined ? null : (
                <p className="rounded-[var(--radius-control)] border border-[var(--state-success-border)] bg-[var(--state-success-soft)] p-3 text-sm leading-6 text-[var(--state-success-strong)]">
                  {notice}
                </p>
              )}
              {error === undefined ? null : (
                <p
                  className="rounded-[var(--radius-control)] border border-[var(--state-danger-border)] bg-[var(--state-danger-soft)] p-3 text-sm leading-6 text-[var(--state-danger-strong)]"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
            <Button className="w-full" disabled={!hydrated || pending} type="submit">
              {pending ? 'Working…' : title}
              <ArrowRight aria-hidden size={16} />
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {mode !== 'sign-in' ? (
              <button
                className="auth-link"
                disabled={!hydrated}
                type="button"
                onClick={() => setMode('sign-in')}
              >
                Use password
              </button>
            ) : null}
            {mode !== 'magic' ? (
              <button
                className="auth-link"
                disabled={!hydrated}
                type="button"
                onClick={() => setMode('magic')}
              >
                Email me a magic link
              </button>
            ) : null}
            {mode !== 'create' ? (
              <button
                className="auth-link"
                disabled={!hydrated}
                type="button"
                onClick={() => setMode('create')}
              >
                Create account
              </button>
            ) : null}
            {mode !== 'reset' ? (
              <button
                className="auth-link"
                disabled={!hydrated}
                type="button"
                onClick={() => setMode('reset')}
              >
                Forgot password?
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
