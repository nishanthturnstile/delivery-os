import { createHash } from 'node:crypto';

import {
  ApplicationError,
  assertRecentMfa,
  type ProjectCommandStore,
  type ProjectQueryStore,
} from '@delivery-os/application';
import {
  clientSchema,
  memberAvailabilitySchema,
  projectCalendarExceptionSchema,
  projectLifecycleHistorySchema,
  projectMembershipSchema,
  projectMutationResultSchema,
  projectOutcomeModuleSchema,
  projectOutboxJobSchema,
  projectPortfolioItemSchema,
  projectSchema,
  projectWorkingCalendarSchema,
  type AcceptProjectInvitationCommand,
  type ChangeClientStateCommand,
  type Client,
  type CreateClientCommand,
  type CreateProjectCommand,
  type DeactivateProjectMemberCommand,
  type InviteProjectStakeholderCommand,
  type MemberAvailability,
  type Project,
  type ProjectCalendarException,
  type ProjectLifecycleHistory,
  type ProjectListFilters,
  type ProjectMembership,
  type ProjectMutationResult,
  type ProjectOutcomeModule,
  type ProjectOutboxJob,
  type ProjectPortfolioItem,
  type ProjectReadiness,
  type ProjectRole,
  type ProjectWorkingCalendar,
  type SetCalendarExceptionCommand,
  type SetMemberAvailabilityCommand,
  type SetProjectRolesCommand,
  type TransitionProjectLifecycleCommand,
  type UpdateClientCommand,
  type UpdateProjectCalendarCommand,
  type UpdateProjectCommand,
} from '@delivery-os/contracts';
import {
  allowedLifecycleTransitions,
  canArchiveClient,
  evaluateProjectReadiness,
  isProjectReadOnly,
  isValidIanaTimeZone,
  validateProjectLeadership,
  validateProjectRoles,
  type ProjectReadinessFacts,
} from '@delivery-os/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

type ProjectCommand =
  | CreateClientCommand
  | UpdateClientCommand
  | ChangeClientStateCommand
  | CreateProjectCommand
  | UpdateProjectCommand
  | SetProjectRolesCommand
  | DeactivateProjectMemberCommand
  | InviteProjectStakeholderCommand
  | AcceptProjectInvitationCommand
  | UpdateProjectCalendarCommand
  | SetCalendarExceptionCommand
  | SetMemberAvailabilityCommand
  | TransitionProjectLifecycleCommand;

type IdempotencyRow = QueryResultRow & {
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
};

type ClientRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  revision: number;
  name: string;
  logo_url: string | null;
  primary_contact_name: string;
  primary_contact_email: string;
  industry: string | null;
  notes: string | null;
  state: 'ACTIVE' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
};

type ProjectRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  client_id: string | null;
  revision: number;
  capacity_revision: number;
  type: 'INTERNAL' | 'EXTERNAL';
  lifecycle_state: Project['lifecycleState'];
  pre_hold_state: Project['lifecycleState'] | null;
  pre_archive_state: Project['lifecycleState'] | null;
  name: string;
  short_description: string;
  target_start: string | Date;
  target_end: string | Date;
  completion_summary: string | null;
  hold_reason: string | null;
  hold_owner_id: string | null;
  hold_review_date: string | Date | null;
  created_at: Date;
  updated_at: Date;
};

type MembershipRoleRow = QueryResultRow & {
  user_id: string;
  state: 'PENDING' | 'ACTIVE' | 'DEACTIVATED';
  revision: number;
  client_id: string | null;
  roles: ProjectRole[];
  name?: string;
  email?: string;
};

function dateValue(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function nullableDateValue(value: string | Date | null): string | null {
  return value === null ? null : dateValue(value);
}

function escapedSearchPattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function toClient(row: ClientRow): Client {
  return clientSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    revision: row.revision,
    name: row.name,
    logoUrl: row.logo_url,
    primaryContactName: row.primary_contact_name,
    primaryContactEmail: row.primary_contact_email,
    industry: row.industry,
    notes: row.notes,
    state: row.state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function toProject(row: ProjectRow): Project {
  return projectSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    clientId: row.client_id,
    revision: row.revision,
    capacityRevision: row.capacity_revision,
    type: row.type,
    lifecycleState: row.lifecycle_state,
    name: row.name,
    shortDescription: row.short_description,
    targetStart: dateValue(row.target_start),
    targetEnd: dateValue(row.target_end),
    completionSummary: row.completion_summary,
    holdReason: row.hold_reason,
    holdOwnerId: row.hold_owner_id,
    holdReviewDate: nullableDateValue(row.hold_review_date),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function safeNotFound(correlationId = uuidv7()): ApplicationError {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
    correlationId,
  });
}

function validation(message: string, correlationId: string): ApplicationError {
  return new ApplicationError({ code: 'VALIDATION_FAILED', message, correlationId });
}

function revisionConflict(correlationId: string, currentRevision: number): ApplicationError {
  return new ApplicationError({
    code: 'REVISION_CONFLICT',
    message: 'The resource changed. Reload it and retry.',
    correlationId,
    currentRevision,
  });
}

function commandHash(operation: string, command: ProjectCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        operation,
        workspaceId: command.workspaceId,
        expectedRevision: command.expectedRevision,
        actorId: command.actorId,
        command: command.command,
      }),
    )
    .digest('hex');
}

export class PostgresProjectStore implements ProjectCommandStore, ProjectQueryStore {
  constructor(private readonly pool: DatabasePool) {}

  async markProjectInvitationDeliveryFailed(
    workspaceId: string,
    invitationId: string,
    errorCode: string,
  ): Promise<void> {
    await this.pool.query(
      `update project_invitations
          set state = 'DELIVERY_FAILED', delivery_error_code = $3,
              revision = revision + 1, updated_at = now()
        where workspace_id = $1 and id = $2 and state = 'PENDING'`,
      [workspaceId, invitationId, errorCode.slice(0, 120)],
    );
  }

  async listClients(actorId: string, workspaceId: string): Promise<Client[]> {
    await this.requireInternalWorkspaceAccess(this.pool, actorId, workspaceId);
    const result = await this.pool.query<ClientRow>(
      `select id, workspace_id, revision, name, logo_url, primary_contact_name,
              primary_contact_email, industry, notes, state, created_at, updated_at
         from clients
        where workspace_id = $1
        order by state asc, lower(name) asc, id asc`,
      [workspaceId],
    );
    return result.rows.map(toClient);
  }

  async getClient(actorId: string, workspaceId: string, clientId: string): Promise<Client> {
    await this.requireInternalWorkspaceAccess(this.pool, actorId, workspaceId);
    const result = await this.pool.query<ClientRow>(
      `select id, workspace_id, revision, name, logo_url, primary_contact_name,
              primary_contact_email, industry, notes, state, created_at, updated_at
         from clients
        where workspace_id = $1 and id = $2`,
      [workspaceId, clientId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound();
    return toClient(row);
  }

  async listProjects(
    actorId: string,
    workspaceId: string,
    filters: ProjectListFilters,
  ): Promise<{
    items: ProjectPortfolioItem[];
    nextCursor: { updatedAt: string; id: string } | null;
  }> {
    const access = await this.workspaceAccess(this.pool, actorId, workspaceId);
    if (!access.active) throw safeNotFound();
    const internalRoles = await this.pool.query(
      `select 1
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.user_id = $2
          and membership.state = 'ACTIVE' and role.role <> 'CLIENT_STAKEHOLDER'
        limit 1`,
      [workspaceId, actorId],
    );
    if (!access.admin && (internalRoles.rowCount ?? 0) === 0) {
      return { items: [], nextCursor: null };
    }

    const values: unknown[] = [workspaceId, actorId, filters.limit + 1];
    const where = [
      `project.workspace_id = $1`,
      access.admin
        ? '$2::text is not null'
        : `exists (
             select 1
               from project_memberships visible_membership
               join project_membership_roles visible_role
                 on visible_role.workspace_id = visible_membership.workspace_id
                and visible_role.project_id = visible_membership.project_id
                and visible_role.user_id = visible_membership.user_id
              where visible_membership.workspace_id = project.workspace_id
                and visible_membership.project_id = project.id
                and visible_membership.user_id = $2
                and visible_membership.state = 'ACTIVE'
                and visible_role.role <> 'CLIENT_STAKEHOLDER'
           )`,
    ];
    const add = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filters.search !== '') {
      const parameter = add(escapedSearchPattern(filters.search));
      where.push(
        `(project.name ilike ${parameter} escape '\\' or project.short_description ilike ${parameter} escape '\\')`,
      );
    }
    if (filters.clientId !== undefined) where.push(`project.client_id = ${add(filters.clientId)}`);
    if (filters.lifecycleState !== undefined) {
      where.push(`project.lifecycle_state = ${add(filters.lifecycleState)}`);
    }
    if (filters.projectManagerId !== undefined) {
      where.push(`pm.user_id = ${add(filters.projectManagerId)}`);
    }
    if (filters.targetFrom !== undefined) {
      where.push(`project.target_end >= ${add(filters.targetFrom)}::date`);
    }
    if (filters.targetTo !== undefined) {
      where.push(`project.target_start <= ${add(filters.targetTo)}::date`);
    }
    if (filters.cursorUpdatedAt !== undefined && filters.cursorId !== undefined) {
      const updated = add(filters.cursorUpdatedAt);
      const id = add(filters.cursorId);
      where.push(`(project.updated_at, project.id) < (${updated}::timestamptz, ${id}::uuid)`);
    }

    const result = await this.pool.query<
      ProjectRow & {
        client_name: string | null;
        pm_id: string;
        pm_name: string;
        current_sprint_label: string | null;
        blocker_count: number | null;
        next_milestone_name: string | null;
        next_milestone_date: string | Date | null;
      }
    >(
      `select project.*, client.name as client_name, pm.user_id as pm_id,
              pm_user.name as pm_name, health.current_sprint_label, health.blocker_count,
              health.next_milestone_name, health.next_milestone_date
         from projects project
         left join clients client
           on client.workspace_id = project.workspace_id and client.id = project.client_id
         join project_membership_roles pm
           on pm.workspace_id = project.workspace_id and pm.project_id = project.id
          and pm.role = 'PM'
         join project_memberships pm_membership
           on pm_membership.workspace_id = pm.workspace_id
          and pm_membership.project_id = pm.project_id
          and pm_membership.user_id = pm.user_id
          and pm_membership.state = 'ACTIVE'
         join auth_users pm_user on pm_user.id = pm.user_id
         left join project_health health
           on health.workspace_id = project.workspace_id and health.project_id = project.id
        where ${where.join(' and ')}
        order by project.updated_at desc, project.id desc
        limit $3`,
      values,
    );
    const page = result.rows.slice(0, filters.limit);
    const items = page.map((row) =>
      projectPortfolioItemSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        revision: row.revision,
        type: row.type,
        lifecycleState: row.lifecycle_state,
        name: row.name,
        shortDescription: row.short_description,
        targetStart: dateValue(row.target_start),
        targetEnd: dateValue(row.target_end),
        updatedAt: row.updated_at.toISOString(),
        clientName: row.client_name,
        projectManagerId: row.pm_id,
        projectManagerName: row.pm_name,
        currentSprintLabel: row.current_sprint_label,
        blockerCount: row.blocker_count,
        nextMilestoneName: row.next_milestone_name,
        nextMilestoneDate: nullableDateValue(row.next_milestone_date),
      }),
    );
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        result.rows.length > filters.limit && last !== undefined
          ? { updatedAt: last.updated_at.toISOString(), id: last.id }
          : null,
    };
  }

  async getProject(actorId: string, workspaceId: string, projectId: string): Promise<Project> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    return toProject(await this.loadProject(this.pool, workspaceId, projectId));
  }

  async listProjectMembers(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectMembership[]> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    const result = await this.pool.query<MembershipRoleRow>(
      `select membership.user_id, membership.state, membership.revision,
              membership.client_id, users.name, users.email,
              array_agg(role.role order by role.role)::text[] as roles
         from project_memberships membership
         join auth_users users on users.id = membership.user_id
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.project_id = $2
        group by membership.user_id, membership.state, membership.revision,
                 membership.client_id, users.name, users.email
        order by membership.state asc, lower(users.name) asc`,
      [workspaceId, projectId],
    );
    return result.rows.map((row) =>
      projectMembershipSchema.parse({
        workspaceId,
        projectId,
        userId: row.user_id,
        displayName: row.name,
        email: row.email,
        state: row.state,
        roles: row.roles,
        revision: row.revision,
      }),
    );
  }

  async getProjectCalendar(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<{
    calendar: ProjectWorkingCalendar;
    exceptions: ProjectCalendarException[];
  }> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    const calendarResult = await this.pool.query<{
      revision: number;
      time_zone: string;
      working_weekdays: number[];
      daily_start: string;
      daily_end: string;
    }>(
      `select revision, time_zone, working_weekdays, daily_start::text, daily_end::text
         from project_working_calendars
        where workspace_id = $1 and project_id = $2`,
      [workspaceId, projectId],
    );
    const calendarRow = calendarResult.rows[0];
    if (calendarRow === undefined) throw safeNotFound();
    const exceptionResult = await this.pool.query<{
      date: string | Date;
      kind: 'WORKING' | 'NON_WORKING';
      working_minutes: number | null;
      reason: string;
    }>(
      `select date, kind, working_minutes, reason
         from project_calendar_exceptions
        where workspace_id = $1 and project_id = $2
        order by date asc`,
      [workspaceId, projectId],
    );
    return {
      calendar: projectWorkingCalendarSchema.parse({
        workspaceId,
        projectId,
        revision: calendarRow.revision,
        timeZone: calendarRow.time_zone,
        workingWeekdays: calendarRow.working_weekdays,
        dailyStart: calendarRow.daily_start.slice(0, 5),
        dailyEnd: calendarRow.daily_end.slice(0, 5),
      }),
      exceptions: exceptionResult.rows.map((row) =>
        projectCalendarExceptionSchema.parse({
          workspaceId,
          projectId,
          date: dateValue(row.date),
          kind: row.kind,
          workingMinutes: row.working_minutes,
          reason: row.reason,
        }),
      ),
    };
  }

  async listMemberAvailability(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<MemberAvailability[]> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    const result = await this.pool.query<{
      id: string;
      user_id: string;
      effective_from: string | Date;
      effective_to: string | Date;
      allocation_percent: number;
      revision: number;
    }>(
      `select id, user_id, effective_from, effective_to, allocation_percent, revision
         from member_availability
        where workspace_id = $1 and project_id = $2
        order by user_id, effective_from, id`,
      [workspaceId, projectId],
    );
    return result.rows.map((row) =>
      memberAvailabilitySchema.parse({
        id: row.id,
        workspaceId,
        projectId,
        userId: row.user_id,
        effectiveFrom: dateValue(row.effective_from),
        effectiveTo: dateValue(row.effective_to),
        allocationPercent: row.allocation_percent,
        revision: row.revision,
      }),
    );
  }

  async getProjectReadiness(
    actorId: string,
    workspaceId: string,
    projectId: string,
    requestedState: Project['lifecycleState'],
  ): Promise<ProjectReadiness> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    const project = await this.loadProject(this.pool, workspaceId, projectId);
    const facts = await this.readinessFacts(this.pool, project);
    const unmetCriteria = evaluateProjectReadiness(
      project.lifecycle_state,
      requestedState,
      facts,
      null,
    );
    return {
      projectId,
      currentState: project.lifecycle_state,
      requestedState,
      ready: unmetCriteria.length === 0,
      unmetCriteria,
    };
  }

  async listProjectLifecycleHistory(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectLifecycleHistory[]> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    const result = await this.pool.query<{
      id: string;
      from_state: Project['lifecycleState'];
      to_state: Project['lifecycleState'];
      actor_id: string;
      reason: string | null;
      correlation_id: string;
      occurred_at: Date;
    }>(
      `select id, from_state, to_state, actor_id, reason, correlation_id, occurred_at
         from project_lifecycle_history
        where workspace_id = $1 and project_id = $2
        order by occurred_at desc, id desc`,
      [workspaceId, projectId],
    );
    return result.rows.map((row) =>
      projectLifecycleHistorySchema.parse({
        id: row.id,
        workspaceId,
        projectId,
        fromState: row.from_state,
        toState: row.to_state,
        actorId: row.actor_id,
        reason: row.reason,
        correlationId: row.correlation_id,
        occurredAt: row.occurred_at.toISOString(),
      }),
    );
  }

  async getProjectOutcome(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectOutcomeModule> {
    await this.requireProjectInternalRole(this.pool, actorId, workspaceId, projectId);
    const result = await this.pool.query<{
      id: string;
      name: string;
      description: string;
      target_start: string | Date;
      target_end: string | Date;
      status: string;
      audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
      schema_version: string;
    }>(
      `select id, name, description, target_start, target_end, status, audience, schema_version
         from project_outcome_modules
        where workspace_id = $1 and project_id = $2`,
      [workspaceId, projectId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound();
    return projectOutcomeModuleSchema.parse({
      id: row.id,
      workspaceId,
      projectId,
      name: row.name,
      description: row.description,
      targetStart: dateValue(row.target_start),
      targetEnd: dateValue(row.target_end),
      status: row.status,
      audience: row.audience,
      schemaVersion: row.schema_version,
    });
  }

  async isClientStakeholderOnly(actorId: string, workspaceId: string): Promise<boolean> {
    const access = await this.workspaceAccess(this.pool, actorId, workspaceId);
    if (!access.active || access.admin) return false;
    const roles = await this.pool.query<{ role: ProjectRole }>(
      `select distinct role.role
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.user_id = $2
          and membership.state = 'ACTIVE'`,
      [workspaceId, actorId],
    );
    return roles.rows.length > 0 && roles.rows.every((row) => row.role === 'CLIENT_STAKEHOLDER');
  }

  async createClient(command: CreateClientCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'create-client', command);
      if (replay !== undefined) return replay;
      await this.requireClientCreationAuthority(client, command);
      await client.query(
        `insert into clients
          (id, workspace_id, revision, name, logo_url, primary_contact_name,
           primary_contact_email, industry, notes, state, created_by)
         values ($1, $2, 1, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9)`,
        [
          command.clientId,
          command.workspaceId,
          command.command.name,
          command.command.logoUrl,
          command.command.primaryContactName,
          command.command.primaryContactEmail,
          command.command.industry,
          command.command.notes,
          command.actorId,
        ],
      );
      return this.completeMutation(client, command, {
        operation: 'create-client',
        action: 'projects.client.created',
        targetType: 'Client',
        targetId: command.clientId,
        projectId: null,
        revision: 1,
        state: 'ACTIVE',
        eventType: 'projects.client.created.v1',
        afterSummary: { revision: 1, state: 'ACTIVE' },
        override: false,
      });
    });
  }

  async updateClient(command: UpdateClientCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'update-client', command);
      if (replay !== undefined) return replay;
      const current = await this.lockClient(
        client,
        command.workspaceId,
        command.clientId,
        command.correlationId,
      );
      await this.requireClientMutationAuthority(client, command, command.clientId);
      if (current.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, current.revision);
      }
      const nextRevision = current.revision + 1;
      await client.query(
        `update clients
            set revision = $3, name = $4, logo_url = $5, primary_contact_name = $6,
                primary_contact_email = $7, industry = $8, notes = $9, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [
          command.workspaceId,
          command.clientId,
          nextRevision,
          command.command.name,
          command.command.logoUrl,
          command.command.primaryContactName,
          command.command.primaryContactEmail,
          command.command.industry,
          command.command.notes,
        ],
      );
      return this.completeMutation(client, command, {
        operation: 'update-client',
        action: 'projects.client.updated',
        targetType: 'Client',
        targetId: command.clientId,
        projectId: null,
        revision: nextRevision,
        state: current.state,
        eventType: 'projects.client.updated.v1',
        beforeSummary: { revision: current.revision, state: current.state },
        afterSummary: { revision: nextRevision, state: current.state },
        override: false,
      });
    });
  }

  async changeClientState(command: ChangeClientStateCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'change-client-state', command);
      if (replay !== undefined) return replay;
      const access = await this.workspaceAccess(client, command.actorId, command.workspaceId);
      if (!access.admin) throw safeNotFound(command.correlationId);
      assertRecentMfa(command.mfaVerifiedAt, command.correlationId);
      const current = await this.lockClient(
        client,
        command.workspaceId,
        command.clientId,
        command.correlationId,
      );
      if (current.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, current.revision);
      }
      if (current.state === command.command.state) {
        throw validation('The client is already in that state.', command.correlationId);
      }
      if (command.command.state === 'ARCHIVED') {
        const states = await client.query<{ lifecycle_state: Project['lifecycleState'] }>(
          `select lifecycle_state
             from projects
            where workspace_id = $1 and client_id = $2
            for update`,
          [command.workspaceId, command.clientId],
        );
        if (!canArchiveClient(states.rows.map((row) => row.lifecycle_state))) {
          throw new ApplicationError({
            code: 'INVALID_TRANSITION',
            message: 'Archive or cancel every active client project first.',
            correlationId: command.correlationId,
          });
        }
      }
      const nextRevision = current.revision + 1;
      await client.query(
        `update clients
            set revision = $3, state = $4::client_state,
                archived_by = case when $4::client_state = 'ARCHIVED' then $5 else null end,
                archived_at = case when $4::client_state = 'ARCHIVED' then now() else null end,
                archive_reason = $6, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [
          command.workspaceId,
          command.clientId,
          nextRevision,
          command.command.state,
          command.actorId,
          command.command.reason,
        ],
      );
      return this.completeMutation(client, command, {
        operation: 'change-client-state',
        action:
          command.command.state === 'ARCHIVED'
            ? 'projects.client.archived'
            : 'projects.client.restored',
        targetType: 'Client',
        targetId: command.clientId,
        projectId: null,
        revision: nextRevision,
        state: command.command.state,
        eventType: 'projects.client.state-changed.v1',
        beforeSummary: { revision: current.revision, state: current.state },
        afterSummary: { revision: nextRevision, state: command.command.state },
        override: false,
      });
    });
  }

  async createProject(command: CreateProjectCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'create-project', command);
      if (replay !== undefined) return replay;
      await this.requireProjectCreationAuthority(client, command);
      if (!isValidIanaTimeZone(command.command.calendar.timeZone)) {
        throw validation('Choose a valid IANA time zone.', command.correlationId);
      }
      if (command.command.clientId !== null) {
        const clientRecord = await this.lockClient(
          client,
          command.workspaceId,
          command.command.clientId,
          command.correlationId,
        );
        if (clientRecord.state !== 'ACTIVE') {
          throw validation('Restore the client before creating a project.', command.correlationId);
        }
      }
      const internalIds = [
        command.command.projectManagerId,
        ...(command.command.leadUserId === null ? [] : [command.command.leadUserId]),
        ...command.command.contributorIds,
      ];
      const uniqueInternalIds = [...new Set(internalIds)];
      await this.requireActiveWorkspaceUsers(
        client,
        command.workspaceId,
        uniqueInternalIds,
        command.correlationId,
      );

      await client.query(
        `insert into projects
          (id, workspace_id, client_id, revision, capacity_revision, type, lifecycle_state,
           name, short_description, target_start, target_end, created_by)
         values ($1, $2, $3, 1, 1, $4, 'DRAFT', $5, $6, $7, $8, $9)`,
        [
          command.projectId,
          command.workspaceId,
          command.command.clientId,
          command.command.type,
          command.command.name,
          command.command.shortDescription,
          command.command.targetStart,
          command.command.targetEnd,
          command.actorId,
        ],
      );
      await client.query(
        `insert into project_working_calendars
          (project_id, workspace_id, revision, time_zone, working_weekdays, daily_start, daily_end)
         values ($1, $2, 1, $3, $4::jsonb, $5::time, $6::time)`,
        [
          command.projectId,
          command.workspaceId,
          command.command.calendar.timeZone,
          JSON.stringify(command.command.calendar.workingWeekdays),
          command.command.calendar.dailyStart,
          command.command.calendar.dailyEnd,
        ],
      );
      await client.query(
        `insert into project_readiness_facts (project_id, workspace_id)
         values ($1, $2)`,
        [command.projectId, command.workspaceId],
      );
      await client.query(
        `insert into project_health
          (project_id, workspace_id, lifecycle_state, blocker_count,
           next_milestone_name, next_milestone_date)
         values ($1, $2, 'DRAFT', null, $3, $4)`,
        [command.projectId, command.workspaceId, command.command.name, command.command.targetEnd],
      );
      await client.query(
        `insert into project_outcome_modules
          (id, workspace_id, project_id, name, description, target_start, target_end,
           status, audience, schema_version)
         values ($1, $2, $3, $4, $5, $6, $7, 'OUTLINED', $8, '1')`,
        [
          command.outcomeModuleId,
          command.workspaceId,
          command.projectId,
          command.command.name,
          command.command.shortDescription,
          command.command.targetStart,
          command.command.targetEnd,
          command.command.type === 'EXTERNAL' ? 'CLIENT_VISIBLE' : 'TEAM_ONLY',
        ],
      );
      await this.assignInitialInternalMembers(client, command, uniqueInternalIds);
      if (command.command.type === 'EXTERNAL') {
        await this.createInitialStakeholderInvitation(client, command);
      }

      return this.completeMutation(client, command, {
        operation: 'create-project',
        action: 'projects.project.created',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: 1,
        state: 'DRAFT',
        eventType: 'projects.project.created.v1',
        afterSummary: {
          revision: 1,
          state: 'DRAFT',
          type: command.command.type,
          capacityRevision: 1,
        },
        override: false,
      });
    });
  }

  async updateProject(command: UpdateProjectCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'update-project', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      const nextRevision = project.revision + 1;
      await client.query(
        `update projects
            set revision = $3, name = $4, short_description = $5, target_start = $6,
                target_end = $7, completion_summary = $8, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [
          command.workspaceId,
          command.projectId,
          nextRevision,
          command.command.name,
          command.command.shortDescription,
          command.command.targetStart,
          command.command.targetEnd,
          command.command.completionSummary,
        ],
      );
      await client.query(
        `update project_outcome_modules
            set name = $3, description = $4, target_start = $5, target_end = $6,
                updated_at = now()
          where workspace_id = $1 and project_id = $2`,
        [
          command.workspaceId,
          command.projectId,
          command.command.name,
          command.command.shortDescription,
          command.command.targetStart,
          command.command.targetEnd,
        ],
      );
      return this.completeMutation(client, command, {
        operation: 'update-project',
        action: 'projects.project.updated',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: nextRevision,
        state: project.lifecycle_state,
        eventType: 'projects.project.updated.v1',
        beforeSummary: { revision: project.revision, state: project.lifecycle_state },
        afterSummary: { revision: nextRevision, state: project.lifecycle_state },
        override,
      });
    });
  }

  async setProjectRoles(command: SetProjectRolesCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'set-project-roles', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      const roleError = validateProjectRoles(command.command.roles);
      if (roleError !== null) throw validation(roleError, command.correlationId);
      if (command.command.roles.includes('CLIENT_STAKEHOLDER')) {
        throw validation(
          'Client Stakeholder access must be activated through an accepted project invitation.',
          command.correlationId,
        );
      }
      await this.requireActiveWorkspaceUsers(
        client,
        command.workspaceId,
        [command.command.targetUserId],
        command.correlationId,
      );

      await client.query(
        `select user_id
           from project_memberships
          where workspace_id = $1 and project_id = $2 and user_id = $3
          for update`,
        [command.workspaceId, command.projectId, command.command.targetUserId],
      );
      const target = await client.query<MembershipRoleRow>(
        `select membership.user_id, membership.state, membership.revision,
                membership.client_id,
                coalesce(array_agg(role.role order by role.role)
                  filter (where role.role is not null), '{}')::text[] as roles
           from project_memberships membership
           left join project_membership_roles role
             on role.workspace_id = membership.workspace_id
            and role.project_id = membership.project_id
            and role.user_id = membership.user_id
          where membership.workspace_id = $1 and membership.project_id = $2
            and membership.user_id = $3
          group by membership.user_id, membership.state, membership.revision,
                   membership.client_id`,
        [command.workspaceId, command.projectId, command.command.targetUserId],
      );
      const targetRow = target.rows[0];
      const targetWasManager = targetRow?.roles.includes('PM') ?? false;
      const targetWillManage = command.command.roles.includes('PM');
      if (targetWasManager && !targetWillManage) {
        throw new ApplicationError({
          code: 'INVALID_TRANSITION',
          message: 'Select the replacement Project Manager in the same command.',
          correlationId: command.correlationId,
          details: { allowedStates: ['PM'] },
        });
      }

      if (targetWillManage) {
        const existingManagers = await client.query<{ user_id: string }>(
          `select membership.user_id
             from project_memberships membership
             join project_membership_roles role
               on role.workspace_id = membership.workspace_id
              and role.project_id = membership.project_id
              and role.user_id = membership.user_id
            where membership.workspace_id = $1 and membership.project_id = $2
              and membership.state = 'ACTIVE' and role.role = 'PM'
              and membership.user_id <> $3
            for update of membership`,
          [command.workspaceId, command.projectId, command.command.targetUserId],
        );
        for (const manager of existingManagers.rows) {
          await client.query(
            `delete from project_membership_roles
              where workspace_id = $1 and project_id = $2 and user_id = $3 and role = 'PM'`,
            [command.workspaceId, command.projectId, manager.user_id],
          );
          await client.query(
            `update project_memberships
                set revision = revision + 1, updated_at = now()
              where workspace_id = $1 and project_id = $2 and user_id = $3`,
            [command.workspaceId, command.projectId, manager.user_id],
          );
        }
      }

      const clientId = command.command.roles.includes('CLIENT_STAKEHOLDER')
        ? project.client_id
        : null;
      await client.query(
        `insert into project_memberships
          (workspace_id, project_id, user_id, client_id, state, revision,
           activated_by, activated_at)
         values ($1, $2, $3, $4, 'ACTIVE', 1, $5, now())
         on conflict (project_id, user_id) do update
           set client_id = excluded.client_id, state = 'ACTIVE',
               revision = project_memberships.revision + 1,
               activated_by = excluded.activated_by, activated_at = now(),
               deactivated_by = null, deactivated_at = null,
               deactivation_reason = null, updated_at = now()`,
        [
          command.workspaceId,
          command.projectId,
          command.command.targetUserId,
          clientId,
          command.actorId,
        ],
      );
      await client.query(
        `delete from project_membership_roles
          where workspace_id = $1 and project_id = $2 and user_id = $3`,
        [command.workspaceId, command.projectId, command.command.targetUserId],
      );
      for (const role of command.command.roles) {
        await client.query(
          `insert into project_membership_roles
            (workspace_id, project_id, user_id, role, assigned_by)
           values ($1, $2, $3, $4, $5)`,
          [
            command.workspaceId,
            command.projectId,
            command.command.targetUserId,
            role,
            command.actorId,
          ],
        );
      }
      await this.assertLeadershipInDatabase(client, command);
      const nextRevision = project.revision + 1;
      const nextCapacityRevision = project.capacity_revision + 1;
      await client.query(
        `update projects
            set revision = $3, capacity_revision = $4, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [command.workspaceId, command.projectId, nextRevision, nextCapacityRevision],
      );
      return this.completeMutation(client, command, {
        operation: 'set-project-roles',
        action: 'projects.project.membership-roles-set',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: nextRevision,
        state: project.lifecycle_state,
        eventType: 'projects.project.capacity-recalculation-requested.v1',
        beforeSummary: {
          revision: project.revision,
          capacityRevision: project.capacity_revision,
        },
        afterSummary: {
          revision: nextRevision,
          capacityRevision: nextCapacityRevision,
          targetUserId: command.command.targetUserId,
          roles: command.command.roles,
        },
        override,
      });
    });
  }

  async deactivateProjectMember(
    command: DeactivateProjectMemberCommand,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'deactivate-project-member', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      const target = await client.query<{ role: ProjectRole }>(
        `select role.role
           from project_memberships membership
           join project_membership_roles role
             on role.workspace_id = membership.workspace_id
            and role.project_id = membership.project_id
            and role.user_id = membership.user_id
          where membership.workspace_id = $1 and membership.project_id = $2
            and membership.user_id = $3 and membership.state = 'ACTIVE'
          for update of membership`,
        [command.workspaceId, command.projectId, command.command.targetUserId],
      );
      if (target.rows.length === 0) throw safeNotFound(command.correlationId);
      if (target.rows.some((row) => row.role === 'PM')) {
        const replacement = command.command.replacementProjectManagerId;
        if (replacement === null || replacement === command.command.targetUserId) {
          throw new ApplicationError({
            code: 'INVALID_TRANSITION',
            message: 'Assign a different active Project Manager in the same action.',
            correlationId: command.correlationId,
          });
        }
        await this.requireActiveWorkspaceUsers(
          client,
          command.workspaceId,
          [replacement],
          command.correlationId,
        );
        await client.query(
          `insert into project_memberships
            (workspace_id, project_id, user_id, state, revision, activated_by, activated_at)
           values ($1, $2, $3, 'ACTIVE', 1, $4, now())
           on conflict (project_id, user_id) do update
             set state = 'ACTIVE', revision = project_memberships.revision + 1,
                 activated_by = excluded.activated_by, activated_at = now(),
                 deactivated_by = null, deactivated_at = null,
                 deactivation_reason = null, updated_at = now()`,
          [command.workspaceId, command.projectId, replacement, command.actorId],
        );
        await client.query(
          `insert into project_membership_roles
            (workspace_id, project_id, user_id, role, assigned_by)
           values ($1, $2, $3, 'PM', $4)
           on conflict do nothing`,
          [command.workspaceId, command.projectId, replacement, command.actorId],
        );
      }
      await client.query(
        `delete from project_membership_roles
          where workspace_id = $1 and project_id = $2 and user_id = $3`,
        [command.workspaceId, command.projectId, command.command.targetUserId],
      );
      await client.query(
        `update project_memberships
            set state = 'DEACTIVATED', revision = revision + 1,
                deactivated_by = $4, deactivated_at = now(), deactivation_reason = $5,
                updated_at = now()
          where workspace_id = $1 and project_id = $2 and user_id = $3`,
        [
          command.workspaceId,
          command.projectId,
          command.command.targetUserId,
          command.actorId,
          command.command.reason,
        ],
      );
      await this.assertLeadershipInDatabase(client, command);
      const nextRevision = project.revision + 1;
      const nextCapacityRevision = project.capacity_revision + 1;
      await client.query(
        `update projects
            set revision = $3, capacity_revision = $4, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [command.workspaceId, command.projectId, nextRevision, nextCapacityRevision],
      );
      return this.completeMutation(client, command, {
        operation: 'deactivate-project-member',
        action: 'projects.project.member-deactivated',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: nextRevision,
        state: project.lifecycle_state,
        eventType: 'projects.project.capacity-recalculation-requested.v1',
        beforeSummary: {
          revision: project.revision,
          capacityRevision: project.capacity_revision,
        },
        afterSummary: {
          revision: nextRevision,
          capacityRevision: nextCapacityRevision,
          targetUserId: command.command.targetUserId,
          replacementProjectManagerId: command.command.replacementProjectManagerId,
        },
        override,
      });
    });
  }

  async inviteProjectStakeholder(
    command: InviteProjectStakeholderCommand,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'invite-project-stakeholder', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      if (project.type !== 'EXTERNAL' || project.client_id === null) {
        throw validation(
          'Only external projects can invite a Client Stakeholder.',
          command.correlationId,
        );
      }
      const activeWorkspaceUser = await client.query<{ id: string }>(
        `select users.id
           from auth_users users
           join workspace_memberships membership on membership.user_id = users.id
          where membership.workspace_id = $1 and membership.state = 'ACTIVE'
            and users.email = $2 and users.email_verified = true
            and users.deactivated_at is null`,
        [command.workspaceId, command.command.email],
      );
      const workspaceInvitationId =
        activeWorkspaceUser.rows[0] === undefined ? command.workspaceInvitationId : null;
      if (workspaceInvitationId !== null) {
        await client.query(
          `update workspace_invitations
              set state = 'REVOKED', revoked_at = now(), replaced_by_id = $3,
                  revision = revision + 1, updated_at = now()
            where workspace_id = $1 and email = $2 and state = 'PENDING'`,
          [command.workspaceId, command.command.email, workspaceInvitationId],
        );
        await client.query(
          `insert into workspace_invitations
            (id, workspace_id, email, role, state, token_digest, revision,
             invited_by, expires_at)
           values ($1, $2, $3, 'MEMBER', 'PENDING', $4, 1, $5, $6)`,
          [
            workspaceInvitationId,
            command.workspaceId,
            command.command.email,
            command.command.workspaceTokenDigest,
            command.actorId,
            command.command.expiresAt,
          ],
        );
      }
      await client.query(
        `update project_invitations
            set state = 'REVOKED', revoked_at = now(), replaced_by_id = $4,
                revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and email = $3
            and state in ('PENDING', 'DELIVERY_FAILED')`,
        [command.workspaceId, command.projectId, command.command.email, command.invitationId],
      );
      await client.query(
        `insert into project_invitations
          (id, workspace_id, project_id, client_id, email, state, token_digest,
           revision, workspace_invitation_id, invited_by, expires_at)
         values ($1, $2, $3, $4, $5, 'PENDING', $6, 1, $7, $8, $9)`,
        [
          command.invitationId,
          command.workspaceId,
          command.projectId,
          project.client_id,
          command.command.email,
          command.command.tokenDigest,
          workspaceInvitationId,
          command.actorId,
          command.command.expiresAt,
        ],
      );
      const nextRevision = project.revision + 1;
      await client.query(
        `update projects set revision = $3, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [command.workspaceId, command.projectId, nextRevision],
      );
      return this.completeMutation(client, command, {
        operation: 'invite-project-stakeholder',
        action: 'projects.project.invitation-issued',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: nextRevision,
        state: project.lifecycle_state,
        eventType: 'projects.project.invitation-issued.v1',
        beforeSummary: { revision: project.revision },
        afterSummary: { revision: nextRevision, invitationId: command.invitationId },
        override,
      });
    });
  }

  async acceptProjectInvitation(
    command: AcceptProjectInvitationCommand,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'accept-project-invitation', command);
      if (replay !== undefined) return replay;
      const actor = await client.query<{ email: string; email_verified: boolean }>(
        `select email, email_verified
           from auth_users
          where id = $1 and deactivated_at is null`,
        [command.actorId],
      );
      const user = actor.rows[0];
      if (user?.email_verified !== true || user.email !== command.command.verifiedEmail) {
        throw safeNotFound(command.correlationId);
      }
      const workspaceMembership = await this.workspaceAccess(
        client,
        command.actorId,
        command.workspaceId,
      );
      if (!workspaceMembership.active) throw safeNotFound(command.correlationId);
      const invitation = await client.query<{
        id: string;
        client_id: string;
        email: string;
        state: string;
        token_digest: string;
        revision: number;
        expires_at: Date;
      }>(
        `select id, client_id, email, state, token_digest, revision, expires_at
           from project_invitations
          where id = $1 and workspace_id = $2 and project_id = $3
          for update`,
        [command.command.invitationId, command.workspaceId, command.projectId],
      );
      const row = invitation.rows[0];
      if (
        row?.email !== user.email ||
        row.state !== 'PENDING' ||
        row.token_digest !== command.command.tokenDigest ||
        row.revision !== command.expectedRevision ||
        row.expires_at.getTime() <= Date.now()
      ) {
        throw safeNotFound(command.correlationId);
      }
      await this.activateStakeholder(
        client,
        command.workspaceId,
        command.projectId,
        row.client_id,
        command.actorId,
        command.actorId,
      );
      const nextInvitationRevision = row.revision + 1;
      await client.query(
        `update project_invitations
            set state = 'ACCEPTED', revision = $2, accepted_by = $3,
                accepted_at = now(), updated_at = now()
          where id = $1`,
        [row.id, nextInvitationRevision, command.actorId],
      );
      const project = await this.loadProject(
        client,
        command.workspaceId,
        command.projectId,
        command.correlationId,
        true,
      );
      const nextRevision = project.revision + 1;
      await client.query(
        `update projects set revision = $3, updated_at = now()
          where workspace_id = $1 and id = $2`,
        [command.workspaceId, command.projectId, nextRevision],
      );
      return this.completeMutation(client, command, {
        operation: 'accept-project-invitation',
        action: 'projects.project.invitation-accepted',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: nextRevision,
        state: project.lifecycle_state,
        eventType: 'projects.project.invitation-accepted.v1',
        beforeSummary: { revision: project.revision },
        afterSummary: {
          revision: nextRevision,
          invitationId: command.command.invitationId,
        },
        override: false,
      });
    });
  }

  async updateProjectCalendar(
    command: UpdateProjectCalendarCommand,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'update-project-calendar', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      if (!isValidIanaTimeZone(command.command.timeZone)) {
        throw validation('Choose a valid IANA time zone.', command.correlationId);
      }
      await client.query(
        `update project_working_calendars
            set revision = revision + 1, time_zone = $3,
                working_weekdays = $4::jsonb, daily_start = $5::time,
                daily_end = $6::time, updated_at = now()
          where workspace_id = $1 and project_id = $2`,
        [
          command.workspaceId,
          command.projectId,
          command.command.timeZone,
          JSON.stringify(command.command.workingWeekdays),
          command.command.dailyStart,
          command.command.dailyEnd,
        ],
      );
      return this.completeCapacityMutation(
        client,
        command,
        project,
        'update-project-calendar',
        'projects.project.calendar-updated',
        override,
      );
    });
  }

  async setCalendarException(command: SetCalendarExceptionCommand): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'set-calendar-exception', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      if (command.command.kind === 'NON_WORKING' && command.command.workingMinutes !== null) {
        throw validation(
          'A non-working exception cannot include working minutes.',
          command.correlationId,
        );
      }
      await client.query(
        `insert into project_calendar_exceptions
          (workspace_id, project_id, date, kind, working_minutes, reason, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (project_id, date) do update
           set kind = excluded.kind, working_minutes = excluded.working_minutes,
               reason = excluded.reason, updated_at = now()`,
        [
          command.workspaceId,
          command.projectId,
          command.command.date,
          command.command.kind,
          command.command.workingMinutes,
          command.command.reason,
          command.actorId,
        ],
      );
      return this.completeCapacityMutation(
        client,
        command,
        project,
        'set-calendar-exception',
        'projects.project.calendar-exception-set',
        override,
      );
    });
  }

  async setMemberAvailability(
    command: SetMemberAvailabilityCommand,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'set-member-availability', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      this.assertMutable(project, command.correlationId);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      const member = await client.query<{ role: ProjectRole }>(
        `select role.role
           from project_memberships membership
           join project_membership_roles role
             on role.workspace_id = membership.workspace_id
            and role.project_id = membership.project_id
            and role.user_id = membership.user_id
          where membership.workspace_id = $1 and membership.project_id = $2
            and membership.user_id = $3 and membership.state = 'ACTIVE'
          for update of membership`,
        [command.workspaceId, command.projectId, command.command.userId],
      );
      if (
        member.rows.length === 0 ||
        member.rows.every((row) => row.role === 'CLIENT_STAKEHOLDER')
      ) {
        throw safeNotFound(command.correlationId);
      }
      const overlap = await client.query(
        `select 1
           from member_availability
          where workspace_id = $1 and project_id = $2 and user_id = $3
            and id <> $4
            and effective_from <= $6::date and effective_to >= $5::date
          for update`,
        [
          command.workspaceId,
          command.projectId,
          command.command.userId,
          command.availabilityId,
          command.command.effectiveFrom,
          command.command.effectiveTo,
        ],
      );
      if ((overlap.rowCount ?? 0) > 0) {
        throw validation(
          'Availability periods for a project member cannot overlap.',
          command.correlationId,
        );
      }
      await client.query(
        `insert into member_availability
          (id, workspace_id, project_id, user_id, effective_from, effective_to,
           allocation_percent, revision, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, 1, $8)
         on conflict (id) do update
           set effective_from = excluded.effective_from,
               effective_to = excluded.effective_to,
               allocation_percent = excluded.allocation_percent,
               revision = member_availability.revision + 1,
               updated_at = now()
         where member_availability.workspace_id = excluded.workspace_id
           and member_availability.project_id = excluded.project_id
           and member_availability.user_id = excluded.user_id`,
        [
          command.availabilityId,
          command.workspaceId,
          command.projectId,
          command.command.userId,
          command.command.effectiveFrom,
          command.command.effectiveTo,
          command.command.allocationPercent,
          command.actorId,
        ],
      );
      return this.completeCapacityMutation(
        client,
        command,
        project,
        'set-member-availability',
        'projects.project.availability-set',
        override,
      );
    });
  }

  async transitionProjectLifecycle(
    command: TransitionProjectLifecycleCommand,
  ): Promise<ProjectMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'transition-project-lifecycle', command);
      if (replay !== undefined) return replay;
      const project = await this.lockProject(client, command);
      const override = await this.requireProjectMutationAuthority(client, command, project.id);
      if (project.revision !== command.expectedRevision) {
        throw revisionConflict(command.correlationId, project.revision);
      }
      const allowed = allowedLifecycleTransitions(
        project.lifecycle_state,
        project.pre_hold_state,
        project.pre_archive_state,
      );
      if (!allowed.includes(command.command.toState)) {
        throw new ApplicationError({
          code: 'INVALID_TRANSITION',
          message: 'That lifecycle transition is not available from the current state.',
          correlationId: command.correlationId,
          details: { allowedStates: allowed },
        });
      }
      if (command.command.toState === 'ON_HOLD') {
        if (
          command.command.reason === null ||
          command.command.holdOwnerId === null ||
          command.command.holdReviewDate === null
        ) {
          throw validation(
            'On hold requires a reason, owner, and review date.',
            command.correlationId,
          );
        }
        await this.requireActiveWorkspaceUsers(
          client,
          command.workspaceId,
          [command.command.holdOwnerId],
          command.correlationId,
        );
      }
      const facts = await this.readinessFacts(client, project);
      const unmet = evaluateProjectReadiness(
        project.lifecycle_state,
        command.command.toState,
        facts,
        command.command.reason,
      );
      if (unmet.length > 0) {
        throw new ApplicationError({
          code: 'READINESS_FAILED',
          message: 'Complete the listed readiness criteria before changing lifecycle state.',
          correlationId: command.correlationId,
          details: { unmetCriteria: unmet },
        });
      }

      const nextRevision = project.revision + 1;
      const toState = command.command.toState;
      const preHoldState =
        toState === 'ON_HOLD'
          ? project.lifecycle_state
          : project.lifecycle_state === 'ON_HOLD'
            ? null
            : project.pre_hold_state;
      const preArchiveState =
        toState === 'ARCHIVED'
          ? project.lifecycle_state
          : project.lifecycle_state === 'ARCHIVED'
            ? null
            : project.pre_archive_state;
      await client.query(
        `update projects
            set revision = $3, lifecycle_state = $4::project_lifecycle_state,
                pre_hold_state = $5::project_lifecycle_state,
                pre_archive_state = $6::project_lifecycle_state,
                hold_reason = case when $4::project_lifecycle_state = 'ON_HOLD' then $7 else null end,
                hold_owner_id = case when $4::project_lifecycle_state = 'ON_HOLD' then $8 else null end,
                hold_review_date = case when $4::project_lifecycle_state = 'ON_HOLD' then $9::date else null end,
                updated_at = now()
          where workspace_id = $1 and id = $2`,
        [
          command.workspaceId,
          command.projectId,
          nextRevision,
          toState,
          preHoldState,
          preArchiveState,
          command.command.reason,
          command.command.holdOwnerId,
          command.command.holdReviewDate,
        ],
      );
      const historyId = uuidv7();
      await client.query(
        `insert into project_lifecycle_history
          (id, workspace_id, project_id, from_state, to_state, actor_id,
           reason, hold_owner_id, hold_review_date, correlation_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          historyId,
          command.workspaceId,
          command.projectId,
          project.lifecycle_state,
          toState,
          command.actorId,
          command.command.reason,
          command.command.holdOwnerId,
          command.command.holdReviewDate,
          command.correlationId,
        ],
      );
      await client.query(
        `update project_health
            set lifecycle_state = $3, refreshed_at = now()
          where workspace_id = $1 and project_id = $2`,
        [command.workspaceId, command.projectId, toState],
      );
      return this.completeMutation(client, command, {
        operation: 'transition-project-lifecycle',
        action: 'projects.project.lifecycle-changed',
        targetType: 'Project',
        targetId: command.projectId,
        projectId: command.projectId,
        revision: nextRevision,
        state: toState,
        eventType: 'projects.project.lifecycle-changed.v1',
        beforeSummary: { revision: project.revision, state: project.lifecycle_state },
        afterSummary: { revision: nextRevision, state: toState, historyId },
        override,
      });
    });
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await operation(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async beginIdempotent(
    client: PoolClient,
    operation: string,
    command: ProjectCommand,
  ): Promise<ProjectMutationResult | undefined> {
    const hash = commandHash(operation, command);
    const inserted = await client.query(
      `insert into idempotency_records
        (workspace_id, idempotency_key, request_hash, status, correlation_id)
       values ($1, $2, $3, 'PROCESSING', $4)
       on conflict do nothing
       returning idempotency_key`,
      [command.workspaceId, command.idempotencyKey, hash, command.correlationId],
    );
    if ((inserted.rowCount ?? 0) > 0) return undefined;
    const existing = await client.query<IdempotencyRow>(
      `select request_hash, status, result
         from idempotency_records
        where workspace_id = $1 and idempotency_key = $2
        for update`,
      [command.workspaceId, command.idempotencyKey],
    );
    const row = existing.rows[0];
    if (row?.request_hash !== hash) {
      throw new ApplicationError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'The idempotency key was already used for another request.',
        correlationId: command.correlationId,
      });
    }
    if (row.status !== 'COMPLETED' || row.result === null) {
      throw new ApplicationError({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'The command is already being processed. Retry shortly.',
        correlationId: command.correlationId,
      });
    }
    return projectMutationResultSchema.parse({ ...row.result, replayed: true });
  }

  private async completeMutation(
    client: PoolClient,
    command: ProjectCommand,
    input: {
      operation: string;
      action: string;
      targetType: 'Client' | 'Project';
      targetId: string;
      projectId: string | null;
      revision: number;
      state: string;
      eventType: ProjectOutboxJob['eventType'];
      beforeSummary?: Record<string, unknown>;
      afterSummary: Record<string, unknown>;
      override: boolean;
    },
  ): Promise<ProjectMutationResult> {
    if (input.override) {
      await client.query(
        `insert into audit_events
          (id, workspace_id, project_id, actor_id, action, target_type, target_id,
           correlation_id, reason, before_summary, after_summary)
         values ($1, $2, $3, $4, 'projects.admin-override.used', $5, $6, $7, $8,
                 '{}'::jsonb, $9::jsonb)`,
        [
          uuidv7(),
          command.workspaceId,
          input.projectId,
          command.actorId,
          input.targetType,
          input.targetId,
          command.correlationId,
          command.overrideReason,
          JSON.stringify({ operation: input.operation }),
        ],
      );
    }
    const auditEventId = uuidv7();
    const outboxEventId = uuidv7();
    const occurredAt = new Date().toISOString();
    await client.query(
      `insert into audit_events
        (id, workspace_id, project_id, actor_id, action, target_type, target_id,
         correlation_id, before_summary, after_summary, occurred_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
      [
        auditEventId,
        command.workspaceId,
        input.projectId,
        command.actorId,
        input.action,
        input.targetType,
        input.targetId,
        command.correlationId,
        input.beforeSummary === undefined ? null : JSON.stringify(input.beforeSummary),
        JSON.stringify(input.afterSummary),
        occurredAt,
      ],
    );
    const payload = projectOutboxJobSchema.parse({
      schemaVersion: '1',
      eventId: outboxEventId,
      eventType: input.eventType,
      workspaceId: command.workspaceId,
      projectId: input.projectId,
      aggregateId: input.targetId,
      aggregateRevision: input.revision,
      correlationId: command.correlationId,
      occurredAt,
    });
    await client.query(
      `insert into outbox_events
        (id, workspace_id, aggregate_type, aggregate_id, aggregate_revision,
         event_type, schema_version, payload, correlation_id, occurred_at)
       values ($1, $2, $3, $4, $5, $6, '1', $7::jsonb, $8, $9)`,
      [
        outboxEventId,
        command.workspaceId,
        input.targetType,
        input.targetId,
        input.revision,
        input.eventType,
        JSON.stringify(payload),
        command.correlationId,
        occurredAt,
      ],
    );
    const result = projectMutationResultSchema.parse({
      schemaVersion: '1',
      entityId: input.targetId,
      revision: input.revision,
      state: input.state,
      auditEventId,
      outboxEventId,
      correlationId: command.correlationId,
      replayed: false,
    });
    await client.query(
      `update idempotency_records
          set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
        where workspace_id = $1 and idempotency_key = $2`,
      [command.workspaceId, command.idempotencyKey, JSON.stringify(result)],
    );
    return result;
  }

  private async completeCapacityMutation(
    client: PoolClient,
    command:
      UpdateProjectCalendarCommand | SetCalendarExceptionCommand | SetMemberAvailabilityCommand,
    project: ProjectRow,
    operation: string,
    action: string,
    override: boolean,
  ): Promise<ProjectMutationResult> {
    const nextRevision = project.revision + 1;
    const nextCapacityRevision = project.capacity_revision + 1;
    await client.query(
      `update projects
          set revision = $3, capacity_revision = $4, updated_at = now()
        where workspace_id = $1 and id = $2`,
      [command.workspaceId, command.projectId, nextRevision, nextCapacityRevision],
    );
    return this.completeMutation(client, command, {
      operation,
      action,
      targetType: 'Project',
      targetId: command.projectId,
      projectId: command.projectId,
      revision: nextRevision,
      state: project.lifecycle_state,
      eventType: 'projects.project.capacity-recalculation-requested.v1',
      beforeSummary: {
        revision: project.revision,
        capacityRevision: project.capacity_revision,
      },
      afterSummary: {
        revision: nextRevision,
        capacityRevision: nextCapacityRevision,
      },
      override,
    });
  }

  private async workspaceAccess(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    actorId: string,
    workspaceId: string,
  ): Promise<{ active: boolean; admin: boolean }> {
    const result = await client.query<{ role: 'ADMIN' | 'MEMBER' }>(
      `select role
         from workspace_memberships
        where workspace_id = $1 and user_id = $2 and state = 'ACTIVE'`,
      [workspaceId, actorId],
    );
    return {
      active: result.rows[0] !== undefined,
      admin: result.rows[0]?.role === 'ADMIN',
    };
  }

  private async requireInternalWorkspaceAccess(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    actorId: string,
    workspaceId: string,
  ): Promise<void> {
    const access = await this.workspaceAccess(client, actorId, workspaceId);
    if (!access.active) throw safeNotFound();
    if (access.admin) return;
    const result = await client.query(
      `select 1
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.user_id = $2
          and membership.state = 'ACTIVE' and role.role <> 'CLIENT_STAKEHOLDER'
        limit 1`,
      [workspaceId, actorId],
    );
    if ((result.rowCount ?? 0) === 0) throw safeNotFound();
  }

  private async requireProjectInternalRole(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const access = await this.workspaceAccess(client, actorId, workspaceId);
    if (access.admin) return;
    const result = await client.query(
      `select 1
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.project_id = $2
          and membership.user_id = $3 and membership.state = 'ACTIVE'
          and role.role <> 'CLIENT_STAKEHOLDER'
        limit 1`,
      [workspaceId, projectId, actorId],
    );
    if ((result.rowCount ?? 0) === 0) throw safeNotFound();
  }

  private async requireClientCreationAuthority(
    client: PoolClient,
    command: CreateClientCommand,
  ): Promise<'ADMIN' | 'PM'> {
    const access = await this.workspaceAccess(client, command.actorId, command.workspaceId);
    if (!access.active) throw safeNotFound(command.correlationId);
    if (access.admin) {
      assertRecentMfa(command.mfaVerifiedAt, command.correlationId);
      return 'ADMIN';
    }
    const result = await client.query(
      `select 1
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.user_id = $2
          and membership.state = 'ACTIVE' and role.role = 'PM'
        limit 1`,
      [command.workspaceId, command.actorId],
    );
    if ((result.rowCount ?? 0) === 0) throw safeNotFound(command.correlationId);
    return 'PM';
  }

  private async requireClientMutationAuthority(
    client: PoolClient,
    command: UpdateClientCommand,
    clientId: string,
  ): Promise<'ADMIN' | 'PM'> {
    const access = await this.workspaceAccess(client, command.actorId, command.workspaceId);
    if (!access.active) throw safeNotFound(command.correlationId);
    if (access.admin) {
      assertRecentMfa(command.mfaVerifiedAt, command.correlationId);
      return 'ADMIN';
    }
    const result = await client.query(
      `select 1
         from projects project
         join project_memberships membership
           on membership.workspace_id = project.workspace_id
          and membership.project_id = project.id
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where project.workspace_id = $1 and project.client_id = $2
          and membership.user_id = $3 and membership.state = 'ACTIVE'
          and role.role = 'PM'
        limit 1`,
      [command.workspaceId, clientId, command.actorId],
    );
    if ((result.rowCount ?? 0) === 0) throw safeNotFound(command.correlationId);
    return 'PM';
  }

  private async requireProjectCreationAuthority(
    client: PoolClient,
    command: CreateProjectCommand,
  ): Promise<'ADMIN' | 'PM'> {
    const access = await this.workspaceAccess(client, command.actorId, command.workspaceId);
    if (!access.active) throw safeNotFound(command.correlationId);
    if (access.admin) {
      assertRecentMfa(command.mfaVerifiedAt, command.correlationId);
      return 'ADMIN';
    }
    const result = await client.query(
      `select 1
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.user_id = $2
          and membership.state = 'ACTIVE' and role.role = 'PM'
        limit 1`,
      [command.workspaceId, command.actorId],
    );
    if ((result.rowCount ?? 0) === 0) throw safeNotFound(command.correlationId);
    return 'PM';
  }

  private async requireProjectMutationAuthority(
    client: PoolClient,
    command: {
      actorId: string;
      workspaceId: string;
      correlationId: string;
      mfaVerifiedAt: string | null;
      overrideReason: string | null;
    },
    projectId: string,
  ): Promise<boolean> {
    const manager = await client.query(
      `select 1
         from project_memberships membership
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.project_id = $2
          and membership.user_id = $3 and membership.state = 'ACTIVE'
          and role.role = 'PM'
        limit 1`,
      [command.workspaceId, projectId, command.actorId],
    );
    if ((manager.rowCount ?? 0) > 0) return false;
    const access = await this.workspaceAccess(client, command.actorId, command.workspaceId);
    if (!access.admin || command.overrideReason === null) {
      throw safeNotFound(command.correlationId);
    }
    assertRecentMfa(command.mfaVerifiedAt, command.correlationId);
    return true;
  }

  private async requireActiveWorkspaceUsers(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    workspaceId: string,
    userIds: string[],
    correlationId: string,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const result = await client.query<{ user_id: string }>(
      `select membership.user_id
         from workspace_memberships membership
         join auth_users users on users.id = membership.user_id
        where membership.workspace_id = $1
          and membership.user_id = any($2::text[])
          and membership.state = 'ACTIVE'
          and users.deactivated_at is null`,
      [workspaceId, userIds],
    );
    if (new Set(result.rows.map((row) => row.user_id)).size !== new Set(userIds).size) {
      throw safeNotFound(correlationId);
    }
  }

  private async loadProject(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    workspaceId: string,
    projectId: string,
    correlationId = uuidv7(),
    forUpdate = false,
  ): Promise<ProjectRow> {
    const result = await client.query<ProjectRow>(
      `select id, workspace_id, client_id, revision, capacity_revision, type,
              lifecycle_state, pre_hold_state, pre_archive_state, name,
              short_description, target_start, target_end, completion_summary,
              hold_reason, hold_owner_id, hold_review_date, created_at, updated_at
         from projects
        where workspace_id = $1 and id = $2
        ${forUpdate ? 'for update' : ''}`,
      [workspaceId, projectId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound(correlationId);
    return row;
  }

  private async lockProject(
    client: PoolClient,
    command: {
      workspaceId: string;
      projectId: string;
      correlationId: string;
    },
  ): Promise<ProjectRow> {
    return this.loadProject(
      client,
      command.workspaceId,
      command.projectId,
      command.correlationId,
      true,
    );
  }

  private async lockClient(
    client: PoolClient,
    workspaceId: string,
    clientId: string,
    correlationId: string,
  ): Promise<ClientRow> {
    const result = await client.query<ClientRow>(
      `select id, workspace_id, revision, name, logo_url, primary_contact_name,
              primary_contact_email, industry, notes, state, created_at, updated_at
         from clients
        where workspace_id = $1 and id = $2
        for update`,
      [workspaceId, clientId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound(correlationId);
    return row;
  }

  private assertMutable(project: ProjectRow, correlationId: string): void {
    if (isProjectReadOnly(project.lifecycle_state)) {
      throw new ApplicationError({
        code: 'INVALID_TRANSITION',
        message: 'Archived projects are read-only. Unarchive the project before editing it.',
        correlationId,
        details: {
          allowedStates: project.pre_archive_state === null ? [] : [project.pre_archive_state],
        },
      });
    }
  }

  private async assignInitialInternalMembers(
    client: PoolClient,
    command: CreateProjectCommand,
    userIds: string[],
  ): Promise<void> {
    for (const userId of userIds) {
      await client.query(
        `insert into project_memberships
          (workspace_id, project_id, user_id, state, revision, activated_by, activated_at)
         values ($1, $2, $3, 'ACTIVE', 1, $4, now())`,
        [command.workspaceId, command.projectId, userId, command.actorId],
      );
      const roles: ProjectRole[] = [];
      if (userId === command.command.projectManagerId) roles.push('PM');
      if (userId === command.command.leadUserId) roles.push('LEAD');
      if (command.command.contributorIds.includes(userId)) roles.push('CONTRIBUTOR');
      for (const role of roles) {
        await client.query(
          `insert into project_membership_roles
            (workspace_id, project_id, user_id, role, assigned_by)
           values ($1, $2, $3, $4, $5)`,
          [command.workspaceId, command.projectId, userId, role, command.actorId],
        );
      }
    }
    await this.assertLeadershipInDatabase(client, command);
  }

  private async createInitialStakeholderInvitation(
    client: PoolClient,
    command: CreateProjectCommand,
  ): Promise<void> {
    const { stakeholderEmail, stakeholderTokenDigest, workspaceTokenDigest, stakeholderExpiresAt } =
      command.command;
    if (
      command.projectInvitationId === null ||
      command.workspaceInvitationId === null ||
      command.command.clientId === null ||
      stakeholderEmail === null ||
      stakeholderTokenDigest === null ||
      workspaceTokenDigest === null ||
      stakeholderExpiresAt === null
    ) {
      throw validation(
        'External projects require complete stakeholder invitation data.',
        command.correlationId,
      );
    }
    const activeWorkspaceUser = await client.query<{ id: string }>(
      `select users.id
         from auth_users users
         join workspace_memberships membership on membership.user_id = users.id
        where membership.workspace_id = $1 and membership.state = 'ACTIVE'
          and users.email = $2 and users.email_verified = true
          and users.deactivated_at is null`,
      [command.workspaceId, stakeholderEmail],
    );
    const workspaceInvitationId =
      activeWorkspaceUser.rows[0] === undefined ? command.workspaceInvitationId : null;
    if (workspaceInvitationId !== null) {
      await client.query(
        `update workspace_invitations
            set state = 'REVOKED', revoked_at = now(), replaced_by_id = $3,
                revision = revision + 1, updated_at = now()
          where workspace_id = $1 and email = $2 and state = 'PENDING'`,
        [command.workspaceId, stakeholderEmail, workspaceInvitationId],
      );
      await client.query(
        `insert into workspace_invitations
          (id, workspace_id, email, role, state, token_digest, revision,
           invited_by, expires_at)
         values ($1, $2, $3, 'MEMBER', 'PENDING', $4, 1, $5, $6)`,
        [
          workspaceInvitationId,
          command.workspaceId,
          stakeholderEmail,
          workspaceTokenDigest,
          command.actorId,
          stakeholderExpiresAt,
        ],
      );
    }
    await client.query(
      `insert into project_invitations
        (id, workspace_id, project_id, client_id, email, state, token_digest,
         revision, workspace_invitation_id, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, 'PENDING', $6, 1, $7, $8, $9)`,
      [
        command.projectInvitationId,
        command.workspaceId,
        command.projectId,
        command.command.clientId,
        stakeholderEmail,
        stakeholderTokenDigest,
        workspaceInvitationId,
        command.actorId,
        stakeholderExpiresAt,
      ],
    );
  }

  private async activateStakeholder(
    client: PoolClient,
    workspaceId: string,
    projectId: string,
    clientId: string,
    userId: string,
    actorId: string,
  ): Promise<void> {
    await client.query(
      `insert into project_memberships
        (workspace_id, project_id, user_id, client_id, state, revision,
         activated_by, activated_at)
       values ($1, $2, $3, $4, 'ACTIVE', 1, $5, now())
       on conflict (project_id, user_id) do update
         set client_id = excluded.client_id, state = 'ACTIVE',
             revision = project_memberships.revision + 1,
             activated_by = excluded.activated_by, activated_at = now(),
             deactivated_by = null, deactivated_at = null,
             deactivation_reason = null, updated_at = now()`,
      [workspaceId, projectId, userId, clientId, actorId],
    );
    await client.query(
      `delete from project_membership_roles
        where workspace_id = $1 and project_id = $2 and user_id = $3`,
      [workspaceId, projectId, userId],
    );
    await client.query(
      `insert into project_membership_roles
        (workspace_id, project_id, user_id, role, assigned_by)
       values ($1, $2, $3, 'CLIENT_STAKEHOLDER', $4)`,
      [workspaceId, projectId, userId, actorId],
    );
  }

  private async assertLeadershipInDatabase(
    client: PoolClient,
    command: { workspaceId: string; projectId: string; correlationId: string },
  ): Promise<void> {
    const result = await client.query<MembershipRoleRow>(
      `select membership.user_id, membership.state, membership.revision,
              membership.client_id,
              coalesce(array_agg(role.role order by role.role)
                filter (where role.role is not null), '{}')::text[] as roles
         from project_memberships membership
         left join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.project_id = $2
        group by membership.user_id, membership.state, membership.revision,
                 membership.client_id`,
      [command.workspaceId, command.projectId],
    );
    const leadershipError = validateProjectLeadership(
      result.rows.map((row) => ({
        active: row.state === 'ACTIVE',
        roles: row.roles,
      })),
    );
    if (leadershipError !== null) {
      throw validation(leadershipError, command.correlationId);
    }
  }

  private async readinessFacts(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    project: ProjectRow,
  ): Promise<ProjectReadinessFacts> {
    const calendar = await client.query(
      `select 1
         from project_working_calendars
        where workspace_id = $1 and project_id = $2`,
      [project.workspace_id, project.id],
    );
    const memberships = await client.query<{
      active_project_manager_count: number;
      active_internal_member_count: number;
      active_client_stakeholder_count: number;
    }>(
      `select
         count(distinct membership.user_id)
           filter (where membership.state = 'ACTIVE' and role.role = 'PM')::int
             as active_project_manager_count,
         count(distinct membership.user_id)
           filter (where membership.state = 'ACTIVE'
             and role.role <> 'CLIENT_STAKEHOLDER')::int
             as active_internal_member_count,
         count(distinct membership.user_id)
           filter (where membership.state = 'ACTIVE'
             and role.role = 'CLIENT_STAKEHOLDER')::int
             as active_client_stakeholder_count
       from project_memberships membership
       join project_membership_roles role
         on role.workspace_id = membership.workspace_id
        and role.project_id = membership.project_id
        and role.user_id = membership.user_id
      where membership.workspace_id = $1 and membership.project_id = $2`,
      [project.workspace_id, project.id],
    );
    const downstream = await client.query<{
      requirements_baseline_approved: boolean;
      technical_baseline_approved_or_waived: boolean;
      ux_baseline_approved_or_waived: boolean;
      module_map_approved: boolean;
      ready_work_item_count: number;
      active_sprint_count: number;
      active_work_count: number;
    }>(
      `select requirements_baseline_approved,
              technical_baseline_approved_or_waived,
              ux_baseline_approved_or_waived, module_map_approved,
              ready_work_item_count, active_sprint_count, active_work_count
         from project_readiness_facts
        where workspace_id = $1 and project_id = $2`,
      [project.workspace_id, project.id],
    );
    const memberFacts = memberships.rows[0];
    const downstreamFacts = downstream.rows[0];
    return {
      profileComplete:
        project.name.trim().length >= 2 &&
        project.short_description.trim().length > 0 &&
        dateValue(project.target_start) <= dateValue(project.target_end),
      activeProjectManagerCount: memberFacts?.active_project_manager_count ?? 0,
      calendarConfigured: (calendar.rowCount ?? 0) === 1,
      activeInternalMemberCount: memberFacts?.active_internal_member_count ?? 0,
      external: project.type === 'EXTERNAL',
      clientAssigned: project.client_id !== null,
      activeClientStakeholderCount: memberFacts?.active_client_stakeholder_count ?? 0,
      requirementsBaselineApproved: downstreamFacts?.requirements_baseline_approved ?? false,
      technicalBaselineApprovedOrWaived:
        downstreamFacts?.technical_baseline_approved_or_waived ?? false,
      uxBaselineApprovedOrWaived: downstreamFacts?.ux_baseline_approved_or_waived ?? false,
      moduleMapApproved: downstreamFacts?.module_map_approved ?? false,
      readyWorkItemCount: downstreamFacts?.ready_work_item_count ?? 0,
      activeSprintCount: downstreamFacts?.active_sprint_count ?? 0,
      activeWorkCount: downstreamFacts?.active_work_count ?? 0,
      completionSummaryPresent:
        project.completion_summary !== null && project.completion_summary.trim().length > 0,
    };
  }
}
