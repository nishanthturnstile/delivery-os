'use client';

import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceMembership,
  WorkspaceSummary,
} from '@delivery-os/contracts';
import {
  Button,
  Check,
  CircleAlert,
  Clock3,
  Field,
  GitBranch,
  Input,
  KeyRound,
  LogOut,
  Mail,
  Menu,
  Select,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from '@delivery-os/ui';
import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';

type Section = 'overview' | 'team' | 'workspace' | 'profile' | 'security';

interface ApiError {
  error?: {
    code?: string;
    message?: string;
  };
}

type FormSubmitEvent = SyntheticEvent<HTMLFormElement, SubmitEvent>;

function formValue(form: FormData, name: string, fallback = ''): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const body = (await response.json()) as T & ApiError;
  if (!response.ok) {
    const error = new Error(body.error?.message ?? 'The request could not be completed.');
    error.name = body.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

function LoadingPanel() {
  return (
    <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-8">
      <p className="text-sm text-[var(--content-secondary)]">Loading workspace context…</p>
    </div>
  );
}

export function WorkspaceApp({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    emailNotifications: boolean;
    twoFactorEnabled: boolean;
  };
}) {
  const [currentUser, setCurrentUser] = useState(user);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [members, setMembers] = useState<WorkspaceMembership[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [needsStepUp, setNeedsStepUp] = useState(false);

  const selectedSummary = workspaces.find((item) => item.id === selectedId);

  const loadWorkspaces = useCallback(async () => {
    const response = await requestJson<{ workspaces: WorkspaceSummary[] }>('/api/workspaces');
    setWorkspaces(response.workspaces);
    setSelectedId((current) => current ?? response.workspaces[0]?.id);
    setLoading(false);
  }, []);

  const loadWorkspace = useCallback(async (workspaceId: string, admin: boolean) => {
    const response = await requestJson<{
      workspace: Workspace;
      memberships: WorkspaceMembership[];
    }>(`/api/workspaces/${workspaceId}`);
    setWorkspace(response.workspace);
    setMembers(response.memberships);
    if (admin) {
      const inviteResponse = await requestJson<{ invitations: WorkspaceInvitation[] }>(
        `/api/workspaces/${workspaceId}/invitations`,
      );
      setInvitations(inviteResponse.invitations);
    } else {
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from the server API after mount
    void loadWorkspaces().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not load workspaces.');
      setLoading(false);
    });
  }, [loadWorkspaces]);

  useEffect(() => {
    if (selectedId === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize details after workspace selection
    void loadWorkspace(
      selectedId,
      workspaces.find((item) => item.id === selectedId)?.role === 'ADMIN',
    ).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not load this workspace.');
    });
  }, [loadWorkspace, selectedId, workspaces]);

  function handleError(caught: unknown) {
    const value =
      caught instanceof Error ? caught : new Error('The request could not be completed.');
    if (value.name === 'MFA_REQUIRED') {
      setNeedsStepUp(true);
      setSection('security');
      setError(undefined);
      setNotice(undefined);
      return;
    }
    setError(value.message);
    setNotice(undefined);
  }

  async function switchWorkspace(workspaceId: string) {
    setSelectedId(workspaceId);
    setWorkspace(undefined);
    setMenuOpen(false);
    await requestJson(`/api/workspaces/${workspaceId}/switch`, { method: 'POST' });
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-12">
        <LoadingPanel />
      </main>
    );
  }

  if (workspaces.length === 0) {
    return (
      <Onboarding
        userName={currentUser.name}
        onCreated={async () => {
          await loadWorkspaces();
          setNotice('Workspace created. You are its first Admin.');
        }}
      />
    );
  }

  const navigation: { id: Section; label: string; icon: typeof UserRound }[] = [
    { id: 'overview', label: 'Overview', icon: GitBranch },
    { id: 'team', label: 'People & invites', icon: UsersRound },
    { id: 'workspace', label: 'Workspace profile', icon: Settings2 },
    { id: 'profile', label: 'My profile', icon: UserRound },
    { id: 'security', label: 'Security & sessions', icon: ShieldCheck },
  ];

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r bg-[var(--surface-panel)] p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Workspace navigation"
      >
        <div className="flex items-center justify-between px-2 py-2">
          <a className="flex items-center gap-3" href="/" aria-label="Delivery OS home">
            <span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-[var(--content-primary)] text-[var(--content-inverse)]">
              <GitBranch aria-hidden size={18} />
            </span>
            <span className="font-bold tracking-[-0.02em]">Delivery OS</span>
          </a>
          <Button
            aria-label="Close navigation"
            className="lg:hidden"
            size="icon"
            variant="quiet"
            onClick={() => setMenuOpen(false)}
          >
            <X aria-hidden size={18} />
          </Button>
        </div>

        <div className="mt-6 px-2">
          <label
            className="mb-2 block font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase"
            htmlFor="workspace-switcher"
          >
            Active workspace
          </label>
          <Select
            id="workspace-switcher"
            value={selectedId}
            onChange={(event) => void switchWorkspace(event.target.value).catch(handleError)}
          >
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-[var(--content-muted)]">
            {selectedSummary?.role === 'ADMIN' ? 'Workspace Admin' : 'Workspace Member'}
          </p>
        </div>

        <nav className="mt-7 flex-1 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex min-h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-sm font-semibold transition-colors ${
                  section === item.id
                    ? 'bg-[var(--surface-inset)] text-[var(--content-primary)]'
                    : 'text-[var(--content-secondary)] hover:bg-[var(--surface-inset)]'
                }`}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMenuOpen(false);
                }}
              >
                <Icon aria-hidden size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t px-2 pt-4">
          <p className="truncate text-sm font-semibold">{currentUser.name}</p>
          <p className="truncate text-xs text-[var(--content-muted)]">{currentUser.email}</p>
          <button
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
            type="button"
            onClick={() => void authClient.signOut().then(() => window.location.assign('/'))}
          >
            <LogOut aria-hidden size={16} /> Sign out
          </button>
        </div>
      </aside>

      <section className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b bg-[color-mix(in_oklch,var(--surface-canvas)_88%,transparent)] px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              aria-label="Open navigation"
              className="lg:hidden"
              size="icon"
              variant="quiet"
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden size={19} />
            </Button>
            <div>
              <p className="text-sm font-bold">{workspace?.name ?? 'Loading workspace…'}</p>
              <p className="font-mono text-[0.625rem] tracking-[0.1em] text-[var(--content-muted)] uppercase">
                W1 · Identity control plane
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-2 text-xs text-[var(--content-muted)] sm:flex">
            <span className="size-1.5 rounded-full bg-[var(--state-success)]" />
            Tenant boundary active
          </span>
        </header>

        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <div aria-live="polite" className="mb-5 space-y-3">
            {notice === undefined ? null : (
              <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--state-success-border)] bg-[var(--state-success-soft)] p-3 text-sm text-[var(--state-success-strong)]">
                <Check aria-hidden className="mt-0.5 shrink-0" size={16} />
                {notice}
              </div>
            )}
            {error === undefined ? null : (
              <div
                className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--state-danger-border)] bg-[var(--state-danger-soft)] p-3 text-sm text-[var(--state-danger-strong)]"
                role="alert"
              >
                <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={16} />
                <span>{error}</span>
                <button className="ml-auto" type="button" onClick={() => setError(undefined)}>
                  <span className="sr-only">Dismiss error</span>
                  <X aria-hidden size={16} />
                </button>
              </div>
            )}
          </div>

          {workspace === undefined ? (
            <LoadingPanel />
          ) : section === 'overview' ? (
            <Overview workspace={workspace} members={members} invitations={invitations} />
          ) : section === 'team' ? (
            <TeamPanel
              workspaceId={workspace.id}
              isAdmin={selectedSummary?.role === 'ADMIN'}
              members={members}
              invitations={invitations}
              onChanged={async (message) => {
                await loadWorkspace(workspace.id, selectedSummary?.role === 'ADMIN');
                setNotice(message);
                setError(undefined);
              }}
              onError={handleError}
            />
          ) : section === 'workspace' ? (
            <WorkspaceProfilePanel
              workspace={workspace}
              isAdmin={selectedSummary?.role === 'ADMIN'}
              onChanged={async () => {
                await loadWorkspaces();
                await loadWorkspace(workspace.id, selectedSummary?.role === 'ADMIN');
                setNotice('Workspace profile updated.');
                setError(undefined);
              }}
              onError={handleError}
            />
          ) : section === 'profile' ? (
            <ProfilePanel
              user={currentUser}
              onChanged={(message, profile) => {
                setCurrentUser((value) => ({ ...value, ...profile }));
                setNotice(message);
                setError(undefined);
              }}
              onError={handleError}
            />
          ) : (
            <SecurityPanel
              twoFactorEnabled={currentUser.twoFactorEnabled}
              needsStepUp={needsStepUp}
              onStepUp={() => {
                setNeedsStepUp(false);
                setNotice('Security confirmation is valid for ten minutes.');
                setError(undefined);
              }}
              onError={handleError}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function Onboarding({ userName, onCreated }: { userName: string; onCreated: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormSubmitEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      await requestJson('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          command: {
            name: formValue(form, 'name'),
            logoUrl: null,
            primaryColor: '#5146e5',
            timeZone: formValue(form, 'timeZone', 'UTC'),
            defaultWorkingHours: {
              days: [1, 2, 3, 4, 5],
              start: formValue(form, 'start', '09:00'),
              end: formValue(form, 'end', '17:00'),
            },
          },
        }),
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the workspace.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="onboarding-grid flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-2xl rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-xl sm:p-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-[var(--content-primary)] text-[var(--content-inverse)]">
              <GitBranch aria-hidden size={19} />
            </span>
            <span className="font-bold">Delivery OS</span>
          </div>
          <Button
            size="compact"
            variant="quiet"
            onClick={() => void authClient.signOut().then(() => window.location.assign('/'))}
          >
            <LogOut aria-hidden size={15} /> Sign out
          </Button>
        </div>
        <p className="mt-10 font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
          Explicit tenancy · step 1 of 1
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">
          Build your workspace boundary, {userName.split(' ')[0]}.
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-[var(--content-secondary)]">
          Your company email does not create a tenant. This workspace is explicit, and you become
          its first Admin.
        </p>
        <form className="mt-8 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <div className="sm:col-span-2">
            <Field label="Workspace name">
              <Input id="workspace-name" name="name" autoFocus required minLength={2} />
            </Field>
          </div>
          <Field label="Time zone">
            <Select id="workspace-timezone" name="timeZone" defaultValue="UTC">
              <option value="UTC">UTC</option>
              <option value="America/New_York">America / New York</option>
              <option value="Europe/London">Europe / London</option>
              <option value="Asia/Kolkata">Asia / Kolkata</option>
              <option value="Asia/Singapore">Asia / Singapore</option>
              <option value="Australia/Sydney">Australia / Sydney</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workday starts">
              <Input id="working-start" name="start" type="time" defaultValue="09:00" required />
            </Field>
            <Field label="Workday ends">
              <Input id="working-end" name="end" type="time" defaultValue="17:00" required />
            </Field>
          </div>
          {error === undefined ? null : (
            <p
              className="sm:col-span-2 rounded-[var(--radius-control)] bg-[var(--state-danger-soft)] p-3 text-sm text-[var(--state-danger-strong)]"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <Button disabled={pending} type="submit">
              {pending ? 'Creating…' : 'Create workspace'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Overview({
  workspace,
  members,
  invitations,
}: {
  workspace: Workspace;
  members: WorkspaceMembership[];
  invitations: WorkspaceInvitation[];
}) {
  const cards = [
    { label: 'Active people', value: members.filter((item) => item.state === 'ACTIVE').length },
    {
      label: 'Workspace Admins',
      value: members.filter((item) => item.role === 'ADMIN' && item.state === 'ACTIVE').length,
    },
    {
      label: 'Pending invitations',
      value: invitations.filter((item) => item.state === 'PENDING').length,
    },
  ];
  return (
    <>
      <div className="max-w-3xl">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
          Workspace control plane
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">
          Identity with an explicit boundary.
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--content-secondary)]">
          Membership, role, and session state are evaluated on the server for every workspace
          operation.
        </p>
      </div>
      <div className="mt-9 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5"
          >
            <p className="text-sm text-[var(--content-muted)]">{card.label}</p>
            <p className="mt-5 font-mono text-3xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck aria-hidden className="text-[var(--action-primary)]" size={19} />
            <h2 className="text-lg font-bold">Boundary status</h2>
          </div>
          <ul className="mt-5 space-y-4 text-sm text-[var(--content-secondary)]">
            {[
              'Email domain grants no membership.',
              'Privileged changes require recent TOTP.',
              'The last active Admin is protected transactionally.',
              'Cross-workspace identifiers return a safe not-found response.',
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <Check
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[var(--state-success)]"
                  size={16}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <dl className="rounded-[var(--radius-panel)] bg-[var(--content-primary)] p-6 text-[var(--content-inverse)]">
          <dt className="font-mono text-[0.6875rem] tracking-[0.12em] uppercase opacity-60">
            Workspace profile
          </dt>
          <dd className="mt-5 text-2xl font-bold">{workspace.name}</dd>
          <div className="mt-8 flex justify-between gap-4 border-t border-white/10 pt-5 text-sm">
            <dt className="opacity-60">Time zone</dt>
            <dd className="font-mono">{workspace.timeZone}</dd>
          </div>
          <div className="mt-3 flex justify-between gap-4 text-sm">
            <dt className="opacity-60">Hours</dt>
            <dd className="font-mono">
              {workspace.defaultWorkingHours.start}–{workspace.defaultWorkingHours.end}
            </dd>
          </div>
          <div className="mt-3 flex justify-between gap-4 text-sm">
            <dt className="opacity-60">Revision</dt>
            <dd className="font-mono">r{workspace.revision}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

function TeamPanel({
  workspaceId,
  isAdmin,
  members,
  invitations,
  onChanged,
  onError,
}: {
  workspaceId: string;
  isAdmin: boolean;
  members: WorkspaceMembership[];
  invitations: WorkspaceInvitation[];
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  async function invite(event: FormSubmitEvent) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await requestJson<{ deliveryState: 'SENT' | 'FAILED' }>(
        `/api/workspaces/${workspaceId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({
            command: {
              email: formValue(form, 'email'),
              role: formValue(form, 'role', 'MEMBER'),
            },
          }),
        },
      );
      await onChanged(
        result.deliveryState === 'SENT'
          ? 'Invitation sent. Any previous pending link for that email is now invalid.'
          : 'Invitation saved, but email delivery failed. Reissue it after checking email service.',
      );
      formElement.reset();
    } catch (caught) {
      onError(caught);
    }
  }

  async function change(member: WorkspaceMembership, action: 'promote' | 'demote' | 'deactivate') {
    try {
      await requestJson(`/api/workspaces/${workspaceId}/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: member.revision,
          command:
            action === 'deactivate'
              ? { deactivate: true }
              : { role: action === 'promote' ? 'ADMIN' : 'MEMBER' },
        }),
      });
      await onChanged(
        action === 'deactivate'
          ? 'Membership deactivated and active sessions revoked.'
          : 'Workspace role changed and active sessions rotated.',
      );
    } catch (caught) {
      onError(caught);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
          Membership
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">People & invitations</h1>
      </div>
      {isAdmin ? (
        <form
          className="grid gap-4 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
          onSubmit={(event) => void invite(event)}
        >
          <Field label="Verified email address" description="Personal email addresses are valid.">
            <Input id="invite-email" name="email" type="email" required />
          </Field>
          <Field label="Workspace role">
            <Select id="invite-role" name="role" defaultValue="MEMBER">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          <Button type="submit">
            <Mail aria-hidden size={16} /> Invite
          </Button>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--surface-panel)]">
        <div className="border-b px-5 py-4">
          <h2 className="font-bold">Active and historical members</h2>
        </div>
        <ul className="divide-y">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{member.displayName}</p>
                <p className="truncate text-sm text-[var(--content-muted)]">{member.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--surface-inset)] px-2.5 py-1 font-mono text-[0.6875rem] font-semibold">
                  {member.role}
                </span>
                <span className="rounded-full bg-[var(--surface-inset)] px-2.5 py-1 font-mono text-[0.6875rem]">
                  {member.state}
                </span>
                {isAdmin && member.state === 'ACTIVE' ? (
                  <>
                    <Button
                      size="compact"
                      variant="secondary"
                      onClick={() =>
                        void change(member, member.role === 'ADMIN' ? 'demote' : 'promote')
                      }
                    >
                      {member.role === 'ADMIN' ? 'Make Member' : 'Make Admin'}
                    </Button>
                    <Button
                      size="compact"
                      variant="quiet"
                      onClick={() => void change(member, 'deactivate')}
                    >
                      Deactivate
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isAdmin ? (
        <div className="overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--surface-panel)]">
          <div className="border-b px-5 py-4">
            <h2 className="font-bold">Invitation history</h2>
          </div>
          {invitations.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--content-muted)]">No invitations yet.</p>
          ) : (
            <ul className="divide-y">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{invitation.email}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--content-muted)]">
                      <Clock3 aria-hidden size={13} />
                      Expires {new Date(invitation.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-mono text-xs">{invitation.state}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceProfilePanel({
  workspace,
  isAdmin,
  onChanged,
  onError,
}: {
  workspace: Workspace;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  async function submit(event: FormSubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: workspace.revision,
          command: {
            name: formValue(form, 'name'),
            logoUrl: formValue(form, 'logoUrl').trim() || null,
            primaryColor: formValue(form, 'primaryColor', '#5146e5'),
            timeZone: formValue(form, 'timeZone', 'UTC'),
            defaultWorkingHours: {
              days: [1, 2, 3, 4, 5],
              start: formValue(form, 'start', '09:00'),
              end: formValue(form, 'end', '17:00'),
            },
          },
        }),
      });
      await onChanged();
    } catch (caught) {
      onError(caught);
    }
  }

  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
        Admin settings
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">Workspace profile</h1>
      <form
        className="mt-7 grid gap-5 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 sm:grid-cols-2"
        onSubmit={(event) => void submit(event)}
      >
        <div className="sm:col-span-2">
          <Field label="Company name">
            <Input
              id="profile-company"
              name="name"
              defaultValue={workspace.name}
              disabled={!isAdmin}
              required
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Logo URL"
            description="Use an HTTPS URL. Asset upload arrives with the artifact kernel."
          >
            <Input
              id="profile-logo"
              name="logoUrl"
              type="url"
              defaultValue={workspace.logoUrl ?? ''}
              disabled={!isAdmin}
            />
          </Field>
        </div>
        <Field label="Primary color">
          <Input
            id="profile-color"
            name="primaryColor"
            type="color"
            defaultValue={workspace.primaryColor}
            disabled={!isAdmin}
          />
        </Field>
        <Field label="Time zone">
          <Input
            id="profile-timezone"
            name="timeZone"
            defaultValue={workspace.timeZone}
            disabled={!isAdmin}
            required
          />
        </Field>
        <Field label="Workday starts">
          <Input
            id="profile-start"
            name="start"
            type="time"
            defaultValue={workspace.defaultWorkingHours.start}
            disabled={!isAdmin}
            required
          />
        </Field>
        <Field label="Workday ends">
          <Input
            id="profile-end"
            name="end"
            type="time"
            defaultValue={workspace.defaultWorkingHours.end}
            disabled={!isAdmin}
            required
          />
        </Field>
        {isAdmin ? (
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit">Save workspace</Button>
          </div>
        ) : (
          <p className="sm:col-span-2 text-sm text-[var(--content-muted)]">
            Only an active Admin can edit this profile.
          </p>
        )}
      </form>
    </div>
  );
}

function ProfilePanel({
  user,
  onChanged,
  onError,
}: {
  user: {
    name: string;
    email: string;
    avatarUrl: string | null;
    emailNotifications: boolean;
  };
  onChanged: (
    message: string,
    profile: { name: string; avatarUrl: string | null; emailNotifications: boolean },
  ) => void;
  onError: (error: unknown) => void;
}) {
  async function submit(event: FormSubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = formValue(form, 'displayName');
    const avatarUrl = formValue(form, 'avatarUrl').trim() || null;
    const emailNotifications = form.get('emailNotifications') === 'on';
    try {
      await requestJson('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          command: {
            displayName,
            avatarUrl,
            emailNotifications,
          },
        }),
      });
      onChanged('Your profile and notification preference were updated.', {
        name: displayName,
        avatarUrl,
        emailNotifications,
      });
    } catch (caught) {
      onError(caught);
    }
  }
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
        Personal settings
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">My profile</h1>
      <form
        className="mt-7 space-y-5 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6"
        onSubmit={(event) => void submit(event)}
      >
        <Field label="Display name">
          <Input id="personal-name" name="displayName" defaultValue={user.name} required />
        </Field>
        <Field
          label="Email address"
          description="Email changes require a separate verification flow."
        >
          <Input id="personal-email" value={user.email} disabled />
        </Field>
        <Field label="Avatar URL">
          <Input
            id="personal-avatar"
            name="avatarUrl"
            type="url"
            defaultValue={user.avatarUrl ?? ''}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input
            className="mt-1 size-4"
            name="emailNotifications"
            type="checkbox"
            defaultChecked={user.emailNotifications}
          />
          <span>
            <span className="font-semibold">Email notifications</span>
            <span className="mt-1 block text-[var(--content-muted)]">
              Receive workspace and delivery notifications.
            </span>
          </span>
        </label>
        <div className="flex justify-end">
          <Button type="submit">Save profile</Button>
        </div>
      </form>
    </div>
  );
}

function SecurityPanel({
  twoFactorEnabled,
  needsStepUp,
  onStepUp,
  onError,
}: {
  twoFactorEnabled: boolean;
  needsStepUp: boolean;
  onStepUp: () => void;
  onError: (error: unknown) => void;
}) {
  const [sessions, setSessions] = useState<
    {
      token: string;
      userAgent?: string | null | undefined;
      createdAt: Date;
      expiresAt: Date;
    }[]
  >([]);
  const [totpUri, setTotpUri] = useState<string>();
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [passwordNotice, setPasswordNotice] = useState<string>();

  const loadSessions = useCallback(async () => {
    const response = await authClient.listSessions();
    if (response.error) throw new Error(response.error.message);
    setSessions(response.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate revocable sessions after mount
    void loadSessions().catch(onError);
  }, [loadSessions, onError]);

  async function enableMfa(event: FormSubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.twoFactor.enable({
        password: formValue(form, 'password'),
      });
      if (result.error) throw new Error(result.error.message);
      setTotpUri(result.data?.totpURI);
      setBackupCodes(result.data?.backupCodes ?? []);
    } catch (caught) {
      onError(caught);
    }
  }

  async function verifyEnrollment(event: FormSubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = formValue(form, 'code');
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: false,
      });
      if (result.error) throw new Error(result.error.message);
      await requestJson('/api/security/step-up', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      window.location.reload();
    } catch (caught) {
      onError(caught);
    }
  }

  async function verifyStepUp(event: FormSubmitEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await requestJson('/api/security/step-up', {
        method: 'POST',
        body: JSON.stringify({ code: formValue(form, 'code') }),
      });
      onStepUp();
    } catch (caught) {
      onError(caught);
    }
  }

  async function changePassword(event: FormSubmitEvent) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPasswordNotice(undefined);
    try {
      const result = await authClient.changePassword({
        currentPassword: formValue(form, 'currentPassword'),
        newPassword: formValue(form, 'newPassword'),
        revokeOtherSessions: true,
      });
      if (result.error) throw new Error(result.error.message);
      formElement.reset();
      setPasswordNotice('Password updated and your other sessions were revoked.');
      await loadSessions();
    } catch (caught) {
      onError(caught);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
          Account defense
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">Security & sessions</h1>
      </div>

      {needsStepUp && twoFactorEnabled ? (
        <form
          className="rounded-[var(--radius-panel)] border border-[var(--state-warning-border)] bg-[var(--state-warning-soft)] p-5"
          onSubmit={(event) => void verifyStepUp(event)}
        >
          <div className="flex items-center gap-3">
            <KeyRound aria-hidden size={18} />
            <h2 className="font-bold">Confirm privileged access</h2>
          </div>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Enter a TOTP code. Confirmation remains valid for ten minutes.
          </p>
          <div className="mt-4 flex max-w-sm gap-3">
            <Input
              aria-label="Authenticator code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              required
            />
            <Button type="submit">Verify</Button>
          </div>
        </form>
      ) : needsStepUp ? (
        <section className="rounded-[var(--radius-panel)] border border-[var(--state-warning-border)] bg-[var(--state-warning-soft)] p-5">
          <div className="flex items-center gap-3">
            <KeyRound aria-hidden size={18} />
            <h2 className="font-bold">Set up your authenticator first</h2>
          </div>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            This Admin action requires recent TOTP confirmation. Complete authenticator setup below,
            then return to the action and try again.
          </p>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold">Authenticator app</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--content-muted)]">
              Required for workspace Admin actions, including magic-link sessions.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-xs ${twoFactorEnabled ? 'bg-[var(--state-success-soft)] text-[var(--state-success-strong)]' : 'bg-[var(--surface-inset)]'}`}
          >
            {twoFactorEnabled ? 'ENABLED' : 'NOT SET'}
          </span>
        </div>
        {!twoFactorEnabled && totpUri === undefined ? (
          <form className="mt-5 flex max-w-md gap-3" onSubmit={(event) => void enableMfa(event)}>
            <Input
              aria-label="Current password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              required
            />
            <Button type="submit">Start setup</Button>
          </form>
        ) : null}
        {totpUri === undefined ? null : (
          <div className="mt-5 space-y-4 rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-4">
            <p className="text-sm font-semibold">Add this account to your authenticator</p>
            <p className="break-all font-mono text-xs leading-5">{totpUri}</p>
            <form
              className="flex max-w-sm gap-3"
              onSubmit={(event) => void verifyEnrollment(event)}
            >
              <Input
                aria-label="Enrollment code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                required
              />
              <Button type="submit">Confirm</Button>
            </form>
            {backupCodes.length === 0 ? null : (
              <div>
                <p className="text-sm font-semibold">Save these one-time recovery codes now</p>
                <ul className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
                  {backupCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6">
        <h2 className="font-bold">Password</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--content-muted)]">
          Changing your password revokes every other active session.
        </p>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => void changePassword(event)}
        >
          <Field label="Current password">
            <Input
              id="security-current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password" description="Use at least 12 characters.">
            <Input
              id="security-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--state-success-strong)]" role="status">
              {passwordNotice}
            </p>
            <Button type="submit">Update password</Button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--surface-panel)]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold">Active sessions</h2>
            <p className="mt-1 text-xs text-[var(--content-muted)]">
              Revoke any device you do not recognize.
            </p>
          </div>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => void loadSessions().catch(onError)}
          >
            Refresh
          </Button>
        </div>
        <ul className="divide-y">
          {sessions.map((session) => (
            <li key={session.token} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {session.userAgent ?? 'Unknown device'}
                </p>
                <p className="mt-1 text-xs text-[var(--content-muted)]">
                  Created {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                size="compact"
                variant="quiet"
                onClick={() =>
                  void authClient
                    .revokeSession({ token: session.token })
                    .then(loadSessions)
                    .catch(onError)
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
