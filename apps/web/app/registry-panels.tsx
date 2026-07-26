'use client';

import type {
  Client,
  MemberAvailability,
  Project,
  ProjectCalendarException,
  ProjectLifecycleHistory,
  ProjectMembership,
  ProjectOutcomeModule,
  ProjectPortfolioItem,
  ProjectWorkingCalendar,
  WorkspaceMembership,
} from '@delivery-os/contracts';
import {
  Button,
  Building2,
  CalendarDays,
  Check,
  Field,
  FolderKanban,
  Input,
  Mail,
  Plus,
  Search,
  Select,
  UsersRound,
} from '@delivery-os/ui';
import { type SyntheticEvent, useCallback, useEffect, useEffectEvent, useState } from 'react';

type FormSubmitEvent = SyntheticEvent<HTMLFormElement, SubmitEvent>;

interface ApiError {
  error?: {
    code?: string;
    message?: string;
    details?: {
      unmetCriteria?: { code: string; message: string }[];
    };
  };
}

interface ProjectDetail {
  project: Project;
  members: ProjectMembership[];
  calendar: ProjectWorkingCalendar;
  exceptions: ProjectCalendarException[];
  availability: MemberAvailability[];
  history: ProjectLifecycleHistory[];
  outcome: ProjectOutcomeModule;
}

function formValue(form: FormData, name: string, fallback = ''): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let body: T & ApiError;
  try {
    body = JSON.parse(text) as T & ApiError;
  } catch {
    throw new Error(
      response.ok
        ? 'The server returned an unreadable response.'
        : `The server could not complete the request (${response.status}).`,
    );
  }
  if (!response.ok) {
    const criteria = body.error?.details?.unmetCriteria;
    const message =
      criteria === undefined || criteria.length === 0
        ? (body.error?.message ?? 'The request could not be completed.')
        : criteria.map((item) => item.message).join(' ');
    const error = new Error(message);
    error.name = body.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

export function ClientsPanel({
  workspaceId,
  isAdmin,
  onNotice,
  onError,
}: {
  workspaceId: string;
  isAdmin: boolean;
  onNotice: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const reportError = useEffectEvent(onError);

  const load = useCallback(async () => {
    const response = await requestJson<{ clients: Client[] }>(
      `/api/workspaces/${workspaceId}/clients`,
    );
    setClients(response.clients);
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate registry data from the server after mount
    void load().catch(reportError);
  }, [load]);

  async function create(event: FormSubmitEvent) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setPending(true);
    try {
      await requestJson(`/api/workspaces/${workspaceId}/clients`, {
        method: 'POST',
        body: JSON.stringify({
          command: {
            name: formValue(form, 'name'),
            logoUrl: null,
            primaryContactName: formValue(form, 'primaryContactName'),
            primaryContactEmail: formValue(form, 'primaryContactEmail'),
            industry: formValue(form, 'industry').trim() || null,
            notes: formValue(form, 'notes').trim() || null,
          },
        }),
      });
      element.reset();
      await load();
      onNotice('Client created and added to the registry.');
    } catch (error) {
      onError(error);
    } finally {
      setPending(false);
    }
  }

  async function changeState(client: Client) {
    const restoring = client.state === 'ARCHIVED';
    const reason =
      window
        .prompt(
          restoring ? 'Why is this client being restored?' : 'Why is this client being archived?',
        )
        ?.trim() ?? '';
    if (reason.length < 8) return;
    try {
      await requestJson(`/api/workspaces/${workspaceId}/clients/${client.id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: client.revision,
          command: { state: restoring ? 'ACTIVE' : 'ARCHIVED', reason },
        }),
      });
      await load();
      onNotice(restoring ? 'Client restored.' : 'Client archived.');
    } catch (error) {
      onError(error);
    }
  }

  async function update(event: FormSubmitEvent, client: Client) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await requestJson(`/api/workspaces/${workspaceId}/clients/${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: client.revision,
          command: {
            name: formValue(form, 'name'),
            logoUrl: formValue(form, 'logoUrl').trim() || null,
            primaryContactName: formValue(form, 'primaryContactName'),
            primaryContactEmail: formValue(form, 'primaryContactEmail'),
            industry: formValue(form, 'industry').trim() || null,
            notes: formValue(form, 'notes').trim() || null,
          },
        }),
      });
      setEditingId(undefined);
      await load();
      onNotice('Client details updated.');
    } catch (error) {
      onError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
          M2 registry
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">Clients</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--content-secondary)]">
          Govern client identity and contact context without deleting historical delivery records.
        </p>
      </header>

      <form
        className="grid gap-4 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5 sm:grid-cols-2"
        onSubmit={(event) => void create(event)}
      >
        <Field label="Client name">
          <Input id="client-name" name="name" required minLength={2} />
        </Field>
        <Field label="Industry">
          <Input id="client-industry" name="industry" />
        </Field>
        <Field label="Primary contact">
          <Input id="client-contact-name" name="primaryContactName" required />
        </Field>
        <Field label="Primary contact email">
          <Input id="client-contact-email" name="primaryContactEmail" type="email" required />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Input id="client-notes" name="notes" />
          </Field>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button disabled={pending} type="submit">
            <Plus aria-hidden size={16} />
            {pending ? 'Creating…' : 'Create client'}
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--surface-panel)]">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <Building2 aria-hidden size={18} />
          <h2 className="font-bold">Client registry</h2>
          <span className="ml-auto font-mono text-xs text-[var(--content-muted)]">
            {clients.length}
          </span>
        </div>
        {clients.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[var(--content-muted)]">
            No clients yet. Create the first one above.
          </p>
        ) : (
          <ul className="divide-y">
            {clients.map((client) => (
              <li
                key={client.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{client.name}</p>
                  <p className="truncate text-sm text-[var(--content-muted)]">
                    {client.primaryContactName} · {client.primaryContactEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--surface-inset)] px-2.5 py-1 font-mono text-[0.6875rem]">
                    {client.state}
                  </span>
                  {isAdmin ? (
                    <>
                      <Button
                        size="compact"
                        variant="secondary"
                        onClick={() =>
                          setEditingId((current) => (current === client.id ? undefined : client.id))
                        }
                      >
                        {editingId === client.id ? 'Close edit' : 'Edit'}
                      </Button>
                      <Button
                        size="compact"
                        variant="quiet"
                        onClick={() => void changeState(client)}
                      >
                        {client.state === 'ACTIVE' ? 'Archive' : 'Restore'}
                      </Button>
                    </>
                  ) : null}
                </div>
                {editingId === client.id ? (
                  <form
                    className="grid w-full gap-3 border-t pt-4 sm:col-span-2 sm:grid-cols-2"
                    onSubmit={(event) => void update(event, client)}
                  >
                    <Field label="Client name">
                      <Input name="name" defaultValue={client.name} required />
                    </Field>
                    <Field label="Logo URL">
                      <Input name="logoUrl" type="url" defaultValue={client.logoUrl ?? ''} />
                    </Field>
                    <Field label="Primary contact">
                      <Input
                        name="primaryContactName"
                        defaultValue={client.primaryContactName}
                        required
                      />
                    </Field>
                    <Field label="Primary contact email">
                      <Input
                        name="primaryContactEmail"
                        type="email"
                        defaultValue={client.primaryContactEmail}
                        required
                      />
                    </Field>
                    <Field label="Industry">
                      <Input name="industry" defaultValue={client.industry ?? ''} />
                    </Field>
                    <Field label="Notes">
                      <Input name="notes" defaultValue={client.notes ?? ''} />
                    </Field>
                    <div className="flex justify-end sm:col-span-2">
                      <Button disabled={pending} size="compact" type="submit">
                        Save client
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProjectsPanel({
  workspaceId,
  members,
  isAdmin,
  onNotice,
  onError,
}: {
  workspaceId: string;
  members: WorkspaceMembership[];
  isAdmin: boolean;
  onNotice: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<ProjectPortfolioItem[]>([]);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [selectedId, setSelectedId] = useState<string>();
  const [projectType, setProjectType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [targetFrom, setTargetFrom] = useState('');
  const [targetTo, setTargetTo] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const reportError = useEffectEvent(onError);
  const activeMembers = members.filter((member) => member.state === 'ACTIVE');

  const load = useCallback(async () => {
    const parameters = new URLSearchParams();
    if (search.trim() !== '') parameters.set('search', search);
    if (clientFilter !== '') parameters.set('clientId', clientFilter);
    if (stateFilter !== '') parameters.set('lifecycleState', stateFilter);
    if (pmFilter !== '') parameters.set('projectManagerId', pmFilter);
    if (targetFrom !== '') parameters.set('targetFrom', targetFrom);
    if (targetTo !== '') parameters.set('targetTo', targetTo);
    const [clientResponse, projectResponse] = await Promise.all([
      requestJson<{ clients: Client[] }>(`/api/workspaces/${workspaceId}/clients`),
      requestJson<{ items: ProjectPortfolioItem[] }>(
        `/api/workspaces/${workspaceId}/projects?${parameters.toString()}`,
      ),
    ]);
    setClients(clientResponse.clients.filter((client) => client.state === 'ACTIVE'));
    setProjects(projectResponse.items);
  }, [clientFilter, pmFilter, search, stateFilter, targetFrom, targetTo, workspaceId]);

  function mutationEnvelope(expectedRevision: number) {
    return {
      expectedRevision,
      overrideReason: overrideReason.trim() === '' ? null : overrideReason.trim(),
    };
  }

  const loadDetail = useCallback(
    async (projectId: string) => {
      const response = await requestJson<ProjectDetail>(
        `/api/workspaces/${workspaceId}/projects/${projectId}`,
      );
      setDetail(response);
    },
    [workspaceId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate registry data from the server after mount
    void load().catch(reportError);
  }, [load]);

  useEffect(() => {
    if (selectedId === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize detail after the user selects a project
    void loadDetail(selectedId).catch(reportError);
  }, [loadDetail, selectedId]);

  async function create(event: FormSubmitEvent) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      const response = await requestJson<{
        entityId: string;
        deliveryState: 'NOT_REQUIRED' | 'SENT' | 'FAILED';
      }>(`/api/workspaces/${workspaceId}/projects`, {
        method: 'POST',
        body: JSON.stringify({
          command: {
            type: projectType,
            clientId: projectType === 'EXTERNAL' ? formValue(form, 'clientId') : null,
            name: formValue(form, 'name'),
            shortDescription: formValue(form, 'shortDescription'),
            targetStart: formValue(form, 'targetStart'),
            targetEnd: formValue(form, 'targetEnd'),
            projectManagerId: formValue(form, 'projectManagerId'),
            leadUserId: null,
            contributorIds: [],
            stakeholderEmail:
              projectType === 'EXTERNAL' ? formValue(form, 'stakeholderEmail') : null,
            calendar: {
              timeZone: formValue(form, 'timeZone', 'UTC'),
              workingWeekdays: [1, 2, 3, 4, 5],
              dailyStart: formValue(form, 'dailyStart', '09:00'),
              dailyEnd: formValue(form, 'dailyEnd', '17:00'),
            },
          },
        }),
      });
      element.reset();
      setProjectType('INTERNAL');
      await load();
      setSelectedId(response.entityId);
      onNotice(
        response.deliveryState === 'FAILED'
          ? 'Project created, but stakeholder email delivery failed. Reissue the invitation.'
          : 'Project created with its initial Outcome module.',
      );
    } catch (error) {
      onError(error);
    }
  }

  async function transition(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = new FormData(event.currentTarget);
    const toState = formValue(form, 'toState');
    try {
      await requestJson(`/api/workspaces/${workspaceId}/projects/${detail.project.id}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({
          ...mutationEnvelope(detail.project.revision),
          command: {
            toState,
            reason: formValue(form, 'reason').trim() || null,
            holdOwnerId: toState === 'ON_HOLD' ? formValue(form, 'holdOwnerId') || null : null,
            holdReviewDate:
              toState === 'ON_HOLD' ? formValue(form, 'holdReviewDate') || null : null,
          },
        }),
      });
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice(`Project moved to ${toState.replaceAll('_', ' ')}.`);
    } catch (error) {
      onError(error);
    }
  }

  async function updateCalendar(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/workspaces/${workspaceId}/projects/${detail.project.id}/calendar`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...mutationEnvelope(detail.project.revision),
          command: {
            timeZone: formValue(form, 'timeZone'),
            workingWeekdays: [1, 2, 3, 4, 5],
            dailyStart: formValue(form, 'dailyStart'),
            dailyEnd: formValue(form, 'dailyEnd'),
          },
        }),
      });
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice('Working calendar updated; capacity recalculation was queued.');
    } catch (error) {
      onError(error);
    }
  }

  async function inviteStakeholder(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      const response = await requestJson<{ deliveryState: 'SENT' | 'FAILED' }>(
        `/api/workspaces/${workspaceId}/projects/${detail.project.id}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...mutationEnvelope(detail.project.revision),
            command: { email: formValue(form, 'email') },
          }),
        },
      );
      element.reset();
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice(
        response.deliveryState === 'SENT'
          ? 'Project invitation sent; earlier pending links for this email were revoked.'
          : 'Invitation recorded, but email delivery failed.',
      );
    } catch (error) {
      onError(error);
    }
  }

  async function updateProfile(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/workspaces/${workspaceId}/projects/${detail.project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...mutationEnvelope(detail.project.revision),
          command: {
            name: formValue(form, 'name'),
            shortDescription: formValue(form, 'shortDescription'),
            targetStart: formValue(form, 'targetStart'),
            targetEnd: formValue(form, 'targetEnd'),
            completionSummary: formValue(form, 'completionSummary').trim() || null,
          },
        }),
      });
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice('Project profile updated.');
    } catch (error) {
      onError(error);
    }
  }

  async function setRoles(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = new FormData(event.currentTarget);
    const targetUserId = formValue(form, 'targetUserId');
    const role = formValue(form, 'role');
    try {
      if (role === 'PM') {
        const currentManager = detail.members.find(
          (member) => member.state === 'ACTIVE' && member.roles.includes('PM'),
        );
        if (currentManager === undefined) throw new Error('The active Project Manager is missing.');
        await requestJson(
          `/api/workspaces/${workspaceId}/projects/${detail.project.id}/members/${currentManager.userId}`,
          {
            method: 'DELETE',
            body: JSON.stringify({
              ...mutationEnvelope(detail.project.revision),
              command: {
                replacementProjectManagerId: targetUserId,
                reason: formValue(form, 'reason'),
              },
            }),
          },
        );
      } else {
        await requestJson(
          `/api/workspaces/${workspaceId}/projects/${detail.project.id}/members/${targetUserId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...mutationEnvelope(detail.project.revision),
              command: { roles: [role] },
            }),
          },
        );
      }
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice('Project role updated; capacity recalculation was queued.');
    } catch (error) {
      onError(error);
    }
  }

  async function setAvailability(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(
        `/api/workspaces/${workspaceId}/projects/${detail.project.id}/availability`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...mutationEnvelope(detail.project.revision),
            command: {
              userId: formValue(form, 'userId'),
              effectiveFrom: formValue(form, 'effectiveFrom'),
              effectiveTo: formValue(form, 'effectiveTo'),
              allocationPercent: Number(formValue(form, 'allocationPercent')),
            },
          }),
        },
      );
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice('Member availability saved; capacity recalculation was queued.');
    } catch (error) {
      onError(error);
    }
  }

  async function setException(event: FormSubmitEvent) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = new FormData(event.currentTarget);
    const kind = formValue(form, 'kind');
    try {
      await requestJson(
        `/api/workspaces/${workspaceId}/projects/${detail.project.id}/calendar/exceptions`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...mutationEnvelope(detail.project.revision),
            command: {
              date: formValue(form, 'date'),
              kind,
              workingMinutes: kind === 'WORKING' ? Number(formValue(form, 'workingMinutes')) : null,
              reason: formValue(form, 'reason'),
            },
          }),
        },
      );
      await Promise.all([load(), loadDetail(detail.project.id)]);
      onNotice('Calendar exception saved; capacity recalculation was queued.');
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
          M2 portfolio
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">Projects</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--content-secondary)]">
          One governed portfolio for internal and client delivery, with explicit leadership,
          calendar, readiness, and lifecycle state.
        </p>
      </header>

      <form
        className="grid gap-4 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => void create(event)}
      >
        <Field label="Project type">
          <Select
            id="project-type"
            name="type"
            value={projectType}
            onChange={(event) => setProjectType(event.target.value as 'INTERNAL' | 'EXTERNAL')}
          >
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </Select>
        </Field>
        <Field label="Project name">
          <Input id="project-name" name="name" required minLength={2} />
        </Field>
        <Field label="Project Manager">
          <Select id="project-manager" name="projectManagerId" required>
            <option value="">Select a person</option>
            {activeMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Short description">
            <Input id="project-description" name="shortDescription" required />
          </Field>
        </div>
        {projectType === 'EXTERNAL' ? (
          <>
            <Field label="Client">
              <Select id="project-client" name="clientId" required>
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Client stakeholder email">
              <Input id="stakeholder-email" name="stakeholderEmail" type="email" required />
            </Field>
          </>
        ) : null}
        <Field label="Target start">
          <Input id="project-start" name="targetStart" type="date" required />
        </Field>
        <Field label="Target end">
          <Input id="project-end" name="targetEnd" type="date" required />
        </Field>
        <Field label="Time zone">
          <Input id="project-timezone" name="timeZone" defaultValue="UTC" required />
        </Field>
        <Field label="Workday starts">
          <Input
            id="project-day-start"
            name="dailyStart"
            type="time"
            defaultValue="09:00"
            required
          />
        </Field>
        <Field label="Workday ends">
          <Input id="project-day-end" name="dailyEnd" type="time" defaultValue="17:00" required />
        </Field>
        <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
          <Button type="submit">
            <Plus aria-hidden size={16} /> Create project
          </Button>
        </div>
      </form>

      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <section className="overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--surface-panel)]">
          <div className="border-b p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-semibold" htmlFor="project-search">
                  Search portfolio
                </label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--content-muted)]"
                    size={16}
                  />
                  <Input
                    id="project-search"
                    className="pl-9"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
              <Field label="Client">
                <Select
                  id="portfolio-client"
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                >
                  <option value="">All clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lifecycle">
                <Select
                  id="portfolio-state"
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value)}
                >
                  <option value="">All states</option>
                  {[
                    'DRAFT',
                    'INTAKE',
                    'PLANNING',
                    'EXECUTION',
                    'ON_HOLD',
                    'COMPLETED',
                    'CANCELLED',
                    'ARCHIVED',
                  ].map((state) => (
                    <option key={state} value={state}>
                      {state.replaceAll('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project Manager">
                <Select
                  id="portfolio-pm"
                  value={pmFilter}
                  onChange={(event) => setPmFilter(event.target.value)}
                >
                  <option value="">All visible PMs</option>
                  {activeMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Target from">
                  <Input
                    id="portfolio-target-from"
                    type="date"
                    value={targetFrom}
                    onChange={(event) => setTargetFrom(event.target.value)}
                  />
                </Field>
                <Field label="Target to">
                  <Input
                    id="portfolio-target-to"
                    type="date"
                    value={targetTo}
                    onChange={(event) => setTargetTo(event.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>
          {projects.length === 0 ? (
            <p className="p-8 text-sm text-[var(--content-muted)]">
              No visible projects match this view.
            </p>
          ) : (
            <ul className="divide-y">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={`w-full p-4 text-left transition-colors hover:bg-[var(--surface-inset)] ${
                      selectedId === project.id ? 'bg-[var(--surface-inset)]' : ''
                    }`}
                    onClick={() => setSelectedId(project.id)}
                  >
                    <div className="flex items-center gap-2">
                      <FolderKanban aria-hidden size={16} />
                      <span className="truncate font-semibold">{project.name}</span>
                      <span className="ml-auto rounded-full bg-[var(--surface-canvas)] px-2 py-1 font-mono text-[0.625rem]">
                        {project.lifecycleState}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--content-secondary)]">
                      {project.shortDescription}
                    </p>
                    <p className="mt-3 text-xs text-[var(--content-secondary)]">
                      PM {project.projectManagerName}
                      {project.clientName === null ? '' : ` · ${project.clientName}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {detail === undefined ? (
          <section className="grid min-h-64 place-items-center rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-8 text-center text-sm text-[var(--content-muted)]">
            Select a project to inspect its governed record.
          </section>
        ) : (
          <section className="space-y-5">
            <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-[var(--content-muted)]">
                    {detail.project.type} · r{detail.project.revision}
                  </p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.04em]">
                    {detail.project.name}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--content-secondary)]">
                    {detail.project.shortDescription}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--surface-inset)] px-3 py-1.5 font-mono text-xs">
                  {detail.project.lifecycleState}
                </span>
              </div>
              <dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--content-muted)]">Target</dt>
                  <dd className="mt-1 font-mono text-xs">
                    {detail.project.targetStart} → {detail.project.targetEnd}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--content-muted)]">Outcome</dt>
                  <dd className="mt-1">{detail.outcome.status}</dd>
                </div>
                <div>
                  <dt className="text-[var(--content-muted)]">Capacity revision</dt>
                  <dd className="mt-1">r{detail.project.capacityRevision}</dd>
                </div>
              </dl>
            </div>

            {isAdmin ? (
              <div className="rounded-[var(--radius-control)] border border-[var(--state-warning-border)] bg-[var(--surface-panel)] p-4">
                <Field
                  label="Admin override reason"
                  description="Required only when acting on a project where you are not the PM. This action is step-up protected and audited."
                >
                  <Input
                    id="project-override-reason"
                    value={overrideReason}
                    minLength={8}
                    onChange={(event) => setOverrideReason(event.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            <form
              className="grid gap-4 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5 sm:grid-cols-2"
              onSubmit={(event) => void updateProfile(event)}
            >
              <h3 className="font-bold sm:col-span-2">Project profile</h3>
              <Field label="Name">
                <Input
                  id="detail-project-name"
                  name="name"
                  defaultValue={detail.project.name}
                  required
                />
              </Field>
              <Field label="Completion summary">
                <Input
                  id="detail-completion-summary"
                  name="completionSummary"
                  defaultValue={detail.project.completionSummary ?? ''}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Short description">
                  <Input
                    id="detail-project-description"
                    name="shortDescription"
                    defaultValue={detail.project.shortDescription}
                    required
                  />
                </Field>
              </div>
              <Field label="Target start">
                <Input
                  id="detail-project-start"
                  name="targetStart"
                  type="date"
                  defaultValue={detail.project.targetStart}
                  required
                />
              </Field>
              <Field label="Target end">
                <Input
                  id="detail-project-end"
                  name="targetEnd"
                  type="date"
                  defaultValue={detail.project.targetEnd}
                  required
                />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button size="compact" variant="secondary" type="submit">
                  Save profile
                </Button>
              </div>
            </form>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5">
                <div className="flex items-center gap-2">
                  <UsersRound aria-hidden size={17} />
                  <h3 className="font-bold">Project team</h3>
                </div>
                <ul className="mt-4 space-y-3">
                  {detail.members.map((member) => (
                    <li key={member.userId} className="text-sm">
                      <p className="font-semibold">{member.displayName}</p>
                      <p className="text-xs text-[var(--content-muted)]">
                        {member.roles.join(' · ')} · {member.state}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5">
                <div className="flex items-center gap-2">
                  <CalendarDays aria-hidden size={17} />
                  <h3 className="font-bold">Working calendar</h3>
                </div>
                <form className="mt-4 grid gap-3" onSubmit={(event) => void updateCalendar(event)}>
                  <Field label="Time zone">
                    <Input
                      id="detail-calendar-timezone"
                      name="timeZone"
                      defaultValue={detail.calendar.timeZone}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Starts">
                      <Input
                        id="detail-calendar-start"
                        name="dailyStart"
                        type="time"
                        defaultValue={detail.calendar.dailyStart}
                        required
                      />
                    </Field>
                    <Field label="Ends">
                      <Input
                        id="detail-calendar-end"
                        name="dailyEnd"
                        type="time"
                        defaultValue={detail.calendar.dailyEnd}
                        required
                      />
                    </Field>
                  </div>
                  <Button size="compact" variant="secondary" type="submit">
                    Save calendar
                  </Button>
                </form>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <form
                className="grid content-start gap-3 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5"
                onSubmit={(event) => void setRoles(event)}
              >
                <h3 className="font-bold">Team role</h3>
                <Field label="Workspace member">
                  <Select id="project-role-member" name="targetUserId" required>
                    <option value="">Select a person</option>
                    {activeMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Project role">
                  <Select id="project-role" name="role" required defaultValue="CONTRIBUTOR">
                    <option value="PM">Project Manager</option>
                    <option value="LEAD">Lead</option>
                    <option value="CONTRIBUTOR">Contributor</option>
                    <option value="VIEWER">Viewer</option>
                  </Select>
                </Field>
                <Field
                  label="Change reason"
                  description="Required when replacing the Project Manager."
                >
                  <Input
                    id="project-role-reason"
                    name="reason"
                    defaultValue="Project leadership reassignment"
                    minLength={8}
                  />
                </Field>
                <Button size="compact" variant="secondary" type="submit">
                  Save role
                </Button>
              </form>

              <form
                className="grid content-start gap-3 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5"
                onSubmit={(event) => void setAvailability(event)}
              >
                <h3 className="font-bold">Member availability</h3>
                <Field label="Project member">
                  <Select id="availability-member" name="userId" required>
                    <option value="">Select a person</option>
                    {detail.members
                      .filter(
                        (member) =>
                          member.state === 'ACTIVE' && !member.roles.includes('CLIENT_STAKEHOLDER'),
                      )
                      .map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From">
                    <Input id="availability-from" name="effectiveFrom" type="date" required />
                  </Field>
                  <Field label="To">
                    <Input id="availability-to" name="effectiveTo" type="date" required />
                  </Field>
                </div>
                <Field label="Allocation percent">
                  <Input
                    id="availability-percent"
                    name="allocationPercent"
                    type="number"
                    min={0}
                    max={100}
                    required
                  />
                </Field>
                <Button size="compact" variant="secondary" type="submit">
                  Save availability
                </Button>
                {detail.availability.length === 0 ? null : (
                  <ul className="space-y-1 text-xs text-[var(--content-secondary)]">
                    {detail.availability.map((item) => (
                      <li key={item.id}>
                        {item.effectiveFrom}–{item.effectiveTo}: {item.allocationPercent}%
                      </li>
                    ))}
                  </ul>
                )}
              </form>

              <form
                className="grid content-start gap-3 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5"
                onSubmit={(event) => void setException(event)}
              >
                <h3 className="font-bold">Calendar exception</h3>
                <Field label="Date">
                  <Input id="exception-date" name="date" type="date" required />
                </Field>
                <Field label="Kind">
                  <Select id="exception-kind" name="kind" defaultValue="NON_WORKING">
                    <option value="NON_WORKING">Non-working</option>
                    <option value="WORKING">Working</option>
                  </Select>
                </Field>
                <Field label="Working minutes" description="Required only for a working exception.">
                  <Input
                    id="exception-minutes"
                    name="workingMinutes"
                    type="number"
                    min={1}
                    max={1440}
                    defaultValue={480}
                  />
                </Field>
                <Field label="Reason">
                  <Input id="exception-reason" name="reason" required />
                </Field>
                <Button size="compact" variant="secondary" type="submit">
                  Save exception
                </Button>
                {detail.exceptions.length === 0 ? null : (
                  <ul className="space-y-1 text-xs text-[var(--content-secondary)]">
                    {detail.exceptions.map((item) => (
                      <li key={item.date}>
                        {item.date}: {item.kind.replaceAll('_', ' ')} · {item.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </form>
            </div>

            <form
              className="grid gap-4 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5 sm:grid-cols-2"
              onSubmit={(event) => void transition(event)}
            >
              <div className="sm:col-span-2 flex items-center gap-2">
                <Check aria-hidden size={17} />
                <h3 className="font-bold">Lifecycle transition</h3>
              </div>
              <Field label="Requested state">
                <Select id="lifecycle-state" name="toState" required>
                  {[
                    'DRAFT',
                    'INTAKE',
                    'PLANNING',
                    'EXECUTION',
                    'ON_HOLD',
                    'COMPLETED',
                    'CANCELLED',
                    'ARCHIVED',
                  ]
                    .filter((state) => state !== detail.project.lifecycleState)
                    .map((state) => (
                      <option key={state} value={state}>
                        {state.replaceAll('_', ' ')}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field
                label="Reason"
                description="Required for backward, cancellation, and archive transitions."
              >
                <Input id="lifecycle-reason" name="reason" />
              </Field>
              <Field label="Hold owner">
                <Select id="lifecycle-hold-owner" name="holdOwnerId">
                  <option value="">Not applicable</option>
                  {activeMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hold review date">
                <Input id="lifecycle-hold-review" name="holdReviewDate" type="date" />
              </Field>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit">Evaluate and transition</Button>
              </div>
            </form>

            {detail.project.type === 'EXTERNAL' ? (
              <form
                className="flex flex-col gap-4 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5 sm:flex-row sm:items-end"
                onSubmit={(event) => void inviteStakeholder(event)}
              >
                <div className="flex-1">
                  <Field label="Invite another client stakeholder">
                    <Input id="additional-stakeholder-email" name="email" type="email" required />
                  </Field>
                </div>
                <Button type="submit">
                  <Mail aria-hidden size={16} /> Send invitation
                </Button>
              </form>
            ) : null}

            <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-5">
              <h3 className="font-bold">Lifecycle history</h3>
              {detail.history.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--content-muted)]">
                  No transitions recorded yet.
                </p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {detail.history.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <p className="font-semibold">
                        {entry.fromState} → {entry.toState}
                      </p>
                      <p className="text-xs text-[var(--content-muted)]">
                        {new Date(entry.occurredAt).toLocaleString()}
                        {entry.reason === null ? '' : ` · ${entry.reason}`}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
