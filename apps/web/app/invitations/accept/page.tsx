'use client';

import { Button, Check, CircleAlert, Mail } from '@delivery-os/ui';
import { useEffect, useState } from 'react';

export default function AcceptInvitationPage() {
  const [state, setState] = useState<'working' | 'accepted' | 'signin' | 'error'>('working');
  const [message, setMessage] = useState('Validating your invitation…');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const projectId = query.get('project');
    const isProjectInvitation = projectId !== null;
    void fetch(
      isProjectInvitation ? '/api/project-invitations/accept' : '/api/invitations/accept',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          isProjectInvitation
            ? {
                projectId,
                projectInvitationId: query.get('projectInvitation'),
                projectToken: query.get('projectToken'),
                workspaceId: query.get('workspace'),
                workspaceInvitationId: query.get('workspaceInvitation'),
                workspaceToken: query.get('workspaceToken'),
                projectExpectedRevision: 1,
                workspaceExpectedRevision: 1,
              }
            : {
                invitationId: query.get('id'),
                workspaceId: query.get('workspace'),
                token: query.get('token'),
                expectedRevision: 1,
              },
        ),
      },
    )
      .then(async (response) => {
        const body = (await response.json()) as { error?: { message?: string } };
        if (response.status === 401) {
          setState('signin');
          setMessage(
            'Sign in or create an account with the invited email address, then open this link again.',
          );
        } else if (!response.ok) {
          setState('error');
          setMessage(body.error?.message ?? 'This invitation is invalid or no longer active.');
        } else {
          setState('accepted');
          setMessage(
            isProjectInvitation
              ? 'Invitation accepted. Your project access is ready.'
              : 'Invitation accepted. Your new workspace is ready.',
          );
        }
      })
      .catch(() => {
        setState('error');
        setMessage('The invitation could not be checked. Try again.');
      });
  }, []);

  const Icon = state === 'accepted' ? Check : state === 'working' ? Mail : CircleAlert;
  return (
    <main className="onboarding-grid flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-lg rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-7 text-center sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--surface-inset)]">
          <Icon aria-hidden size={21} />
        </span>
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.045em]">
          {state === 'accepted' ? 'You’re in.' : 'Invitation'}
        </h1>
        <p
          className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--content-secondary)]"
          role="status"
        >
          {message}
        </p>
        {state === 'working' ? null : (
          <Button className="mt-7" onClick={() => window.location.assign('/')}>
            {state === 'accepted' ? 'Open workspace' : 'Go to sign in'}
          </Button>
        )}
      </section>
    </main>
  );
}
