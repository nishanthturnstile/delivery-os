import { createHash } from 'node:crypto';

import {
  ApplicationError,
  type IdentityCommandStore,
  type IdentityQueryStore,
} from '@delivery-os/application';
import {
  identityMutationResultSchema,
  identityOutboxJobSchema,
  workspaceInvitationSchema,
  workspaceMembershipSchema,
  workspaceSchema,
  workspaceSummarySchema,
  type AcceptInvitationCommand,
  type ChangeMembershipCommand,
  type CreateWorkspaceCommand,
  type IdentityMutationResult,
  type IssueInvitationCommand,
  type SwitchWorkspaceCommand,
  type UpdateProfileCommand,
  type UpdateWorkspaceCommand,
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceMembership,
  type WorkspaceSummary,
} from '@delivery-os/contracts';
import {
  canAcceptInvitation,
  isValidIanaTimeZone,
  wouldRemoveLastAdmin,
} from '@delivery-os/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

type IdempotencyRow = QueryResultRow & {
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
};

type MembershipRow = QueryResultRow & {
  workspace_id: string;
  user_id: string;
  role: 'ADMIN' | 'MEMBER';
  state: 'ACTIVE' | 'DEACTIVATED';
  revision: number;
  name?: string;
  email?: string;
};

type WorkspaceRow = QueryResultRow & {
  id: string;
  revision: number;
  name: string;
  logo_url: string | null;
  primary_color: string;
  time_zone: string;
  default_working_hours: unknown;
  role?: 'ADMIN' | 'MEMBER';
  membership_revision?: number;
};

type InvitationRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  state: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  token_digest?: string;
  revision: number;
  expires_at: Date;
};

type MutationCommand =
  | CreateWorkspaceCommand
  | UpdateWorkspaceCommand
  | IssueInvitationCommand
  | AcceptInvitationCommand
  | ChangeMembershipCommand;

function commandHash(command: MutationCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        operation:
          'invitationId' in command
            ? 'issue-invitation'
            : 'mfaVerifiedAt' in command
              ? 'privileged-workspace'
              : 'workspace',
        workspaceId: command.workspaceId,
        expectedRevision: command.expectedRevision,
        actorId: command.actorId,
        command: command.command,
      }),
    )
    .digest('hex');
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return workspaceSchema.parse({
    id: row.id,
    revision: row.revision,
    name: row.name,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    timeZone: row.time_zone,
    defaultWorkingHours: row.default_working_hours,
  });
}

function safeNotFound(correlationId: string): ApplicationError {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
    correlationId,
  });
}

export class PostgresIdentityStore implements IdentityCommandStore, IdentityQueryStore {
  constructor(private readonly pool: DatabasePool) {}

  async createWorkspace(command: CreateWorkspaceCommand): Promise<IdentityMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, command);
      if (replay !== undefined) return replay;

      const actor = await client.query<{ email_verified: boolean; deactivated_at: Date | null }>(
        `select email_verified, deactivated_at from auth_users where id = $1 for update`,
        [command.actorId],
      );
      if (actor.rows[0]?.email_verified !== true || actor.rows[0].deactivated_at !== null) {
        throw new ApplicationError({
          code: 'FORBIDDEN',
          message: 'Verify your email before creating a workspace.',
          correlationId: command.correlationId,
        });
      }
      if (!isValidIanaTimeZone(command.command.timeZone)) {
        throw new ApplicationError({
          code: 'VALIDATION_FAILED',
          message: 'Choose a valid IANA time zone.',
          correlationId: command.correlationId,
        });
      }

      await client.query(
        `insert into workspaces
          (id, revision, name, logo_url, primary_color, time_zone, default_working_hours, created_by)
         values ($1, 1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          command.workspaceId,
          command.command.name,
          command.command.logoUrl,
          command.command.primaryColor,
          command.command.timeZone,
          JSON.stringify(command.command.defaultWorkingHours),
          command.actorId,
        ],
      );
      await client.query(
        `insert into workspace_memberships
          (workspace_id, user_id, role, state, revision)
         values ($1, $2, 'ADMIN', 'ACTIVE', 1)`,
        [command.workspaceId, command.actorId],
      );
      await client.query(
        `insert into workspace_selections (user_id, workspace_id)
         values ($1, $2)
         on conflict (user_id) do update
           set workspace_id = excluded.workspace_id, updated_at = now()`,
        [command.actorId, command.workspaceId],
      );

      return this.completeMutation(client, command, {
        action: 'identity.workspace.created',
        targetType: 'Workspace',
        targetId: command.workspaceId,
        aggregateRevision: 1,
        state: 'ACTIVE',
        eventType: 'identity.workspace.created.v1',
        afterSummary: { revision: 1, role: 'ADMIN' },
      });
    });
  }

  async updateWorkspace(command: UpdateWorkspaceCommand): Promise<IdentityMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, command);
      if (replay !== undefined) return replay;
      await this.requireAdmin(client, command.actorId, command.workspaceId, command.correlationId);

      const current = await this.lockWorkspace(client, command.workspaceId, command.correlationId);
      if (current.revision !== command.expectedRevision) {
        throw this.revisionConflict(command.correlationId, current.revision);
      }
      if (!isValidIanaTimeZone(command.command.timeZone)) {
        throw new ApplicationError({
          code: 'VALIDATION_FAILED',
          message: 'Choose a valid IANA time zone.',
          correlationId: command.correlationId,
        });
      }
      const nextRevision = current.revision + 1;
      await client.query(
        `update workspaces
            set revision = $2, name = $3, logo_url = $4, primary_color = $5,
                time_zone = $6, default_working_hours = $7::jsonb, updated_at = now()
          where id = $1`,
        [
          command.workspaceId,
          nextRevision,
          command.command.name,
          command.command.logoUrl,
          command.command.primaryColor,
          command.command.timeZone,
          JSON.stringify(command.command.defaultWorkingHours),
        ],
      );
      return this.completeMutation(client, command, {
        action: 'identity.workspace.updated',
        targetType: 'Workspace',
        targetId: command.workspaceId,
        aggregateRevision: nextRevision,
        state: 'ACTIVE',
        eventType: 'identity.workspace.updated.v1',
        beforeSummary: { revision: current.revision },
        afterSummary: { revision: nextRevision },
      });
    });
  }

  async issueInvitation(command: IssueInvitationCommand): Promise<IdentityMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, command);
      if (replay !== undefined) return replay;
      await this.requireAdmin(client, command.actorId, command.workspaceId, command.correlationId);
      await this.lockWorkspace(client, command.workspaceId, command.correlationId);

      const activeMember = await client.query(
        `select 1
           from workspace_memberships membership
           join auth_users users on users.id = membership.user_id
          where membership.workspace_id = $1 and membership.state = 'ACTIVE'
            and users.email = $2`,
        [command.workspaceId, command.command.email],
      );
      if ((activeMember.rowCount ?? 0) > 0) {
        throw new ApplicationError({
          code: 'VALIDATION_FAILED',
          message: 'This person is already an active workspace member.',
          correlationId: command.correlationId,
        });
      }

      const replaced = await client.query<{ id: string }>(
        `update workspace_invitations
            set state = 'REVOKED', revoked_at = now(), updated_at = now(),
                revision = revision + 1, replaced_by_id = $3
          where workspace_id = $1 and email = $2 and state = 'PENDING'
          returning id`,
        [command.workspaceId, command.command.email, command.invitationId],
      );
      await client.query(
        `insert into workspace_invitations
          (id, workspace_id, email, role, token_digest, revision, invited_by, expires_at)
         values ($1, $2, $3, $4, $5, 1, $6, $7)`,
        [
          command.invitationId,
          command.workspaceId,
          command.command.email,
          command.command.role,
          command.command.tokenDigest,
          command.actorId,
          command.command.expiresAt,
        ],
      );
      return this.completeMutation(client, command, {
        action:
          replaced.rowCount === 0 ? 'identity.invitation.issued' : 'identity.invitation.reissued',
        targetType: 'WorkspaceInvitation',
        targetId: command.invitationId,
        aggregateRevision: 1,
        state: 'PENDING',
        eventType: 'identity.invitation.issued.v1',
        afterSummary: {
          revision: 1,
          role: command.command.role,
          replacedCount: replaced.rowCount ?? 0,
        },
      });
    });
  }

  async acceptInvitation(command: AcceptInvitationCommand): Promise<IdentityMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, command);
      if (replay !== undefined) return replay;

      const actor = await client.query<{ email: string; email_verified: boolean }>(
        `select email, email_verified from auth_users where id = $1 and deactivated_at is null`,
        [command.actorId],
      );
      const user = actor.rows[0];
      if (user?.email_verified !== true || user.email !== command.command.verifiedEmail) {
        throw safeNotFound(command.correlationId);
      }
      const invitation = await client.query<InvitationRow>(
        `select id, workspace_id, email, role, state, token_digest, revision, expires_at
           from workspace_invitations
          where id = $1 and workspace_id = $2
          for update`,
        [command.command.invitationId, command.workspaceId],
      );
      const row = invitation.rows[0];
      if (
        row?.token_digest !== command.command.tokenDigest ||
        row.revision !== command.expectedRevision ||
        !canAcceptInvitation({
          invitationEmail: row.email,
          verifiedEmail: user.email,
          state: row.state,
          expiresAt: row.expires_at,
        })
      ) {
        throw safeNotFound(command.correlationId);
      }

      await client.query(
        `insert into workspace_memberships
          (workspace_id, user_id, role, state, revision, invited_by, activated_at)
         select workspace_id, $2, role, 'ACTIVE', 1, invited_by, now()
           from workspace_invitations
          where id = $1
         on conflict (workspace_id, user_id) do update
           set role = excluded.role, state = 'ACTIVE', revision = workspace_memberships.revision + 1,
               deactivated_at = null, activated_at = now(), updated_at = now()`,
        [row.id, command.actorId],
      );
      const nextRevision = row.revision + 1;
      await client.query(
        `update workspace_invitations
            set state = 'ACCEPTED', accepted_by = $2, accepted_at = now(),
                revision = $3, updated_at = now()
          where id = $1`,
        [row.id, command.actorId, nextRevision],
      );
      await client.query(
        `insert into workspace_selections (user_id, workspace_id)
         values ($1, $2)
         on conflict (user_id) do update
           set workspace_id = excluded.workspace_id, updated_at = now()`,
        [command.actorId, command.workspaceId],
      );

      return this.completeMutation(client, command, {
        action: 'identity.invitation.accepted',
        targetType: 'WorkspaceInvitation',
        targetId: row.id,
        aggregateRevision: nextRevision,
        state: 'ACCEPTED',
        eventType: 'identity.invitation.accepted.v1',
        beforeSummary: { revision: row.revision, state: row.state },
        afterSummary: { revision: nextRevision, state: 'ACCEPTED', role: row.role },
      });
    });
  }

  async changeMembership(command: ChangeMembershipCommand): Promise<IdentityMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, command);
      if (replay !== undefined) return replay;
      await this.requireAdmin(client, command.actorId, command.workspaceId, command.correlationId);
      await client.query(
        `select user_id from workspace_memberships where workspace_id = $1 for update`,
        [command.workspaceId],
      );
      const targetResult = await client.query<MembershipRow>(
        `select workspace_id, user_id, role, state, revision
           from workspace_memberships
          where workspace_id = $1 and user_id = $2`,
        [command.workspaceId, command.command.targetUserId],
      );
      const target = targetResult.rows[0];
      if (target === undefined) throw safeNotFound(command.correlationId);
      if (target.revision !== command.expectedRevision) {
        throw this.revisionConflict(command.correlationId, target.revision);
      }
      const count = await client.query<{ count: string }>(
        `select count(*)::text as count
           from workspace_memberships
          where workspace_id = $1 and role = 'ADMIN' and state = 'ACTIVE'`,
        [command.workspaceId],
      );
      if (
        wouldRemoveLastAdmin({
          activeAdminCount: Number(count.rows[0]?.count ?? '0'),
          targetIsActiveAdmin: target.role === 'ADMIN' && target.state === 'ACTIVE',
          ...(command.command.role === undefined ? {} : { nextRole: command.command.role }),
          ...(command.command.deactivate === undefined
            ? {}
            : { deactivate: command.command.deactivate }),
        })
      ) {
        throw new ApplicationError({
          code: 'INVALID_TRANSITION',
          message: 'Assign another active Admin before changing this membership.',
          correlationId: command.correlationId,
        });
      }
      const nextRevision = target.revision + 1;
      const nextRole = command.command.role ?? target.role;
      const nextState = command.command.deactivate === true ? 'DEACTIVATED' : target.state;
      await client.query(
        `update workspace_memberships
            set role = $3::workspace_role, state = $4::membership_state, revision = $5,
                deactivated_at = case when $4::membership_state = 'DEACTIVATED' then now() else null end,
                updated_at = now()
          where workspace_id = $1 and user_id = $2`,
        [command.workspaceId, command.command.targetUserId, nextRole, nextState, nextRevision],
      );
      if (nextState === 'DEACTIVATED') {
        await client.query(
          `update auth_users
              set deactivated_at = now(), updated_at = now()
            where id = $1
              and not exists (
                select 1
                  from workspace_memberships
                 where user_id = $1 and state = 'ACTIVE'
              )`,
          [command.command.targetUserId],
        );
      }
      await client.query(`delete from auth_sessions where user_id = $1`, [
        command.command.targetUserId,
      ]);

      return this.completeMutation(client, command, {
        action:
          nextState === 'DEACTIVATED'
            ? 'identity.membership.deactivated'
            : 'identity.membership.role_changed',
        targetType: 'WorkspaceMembership',
        targetId: command.command.targetUserId,
        aggregateRevision: nextRevision,
        state: nextState,
        eventType: 'identity.membership.changed.v1',
        beforeSummary: { revision: target.revision, role: target.role, state: target.state },
        afterSummary: { revision: nextRevision, role: nextRole, state: nextState },
      });
    });
  }

  async switchWorkspace(command: SwitchWorkspaceCommand): Promise<void> {
    const active = await this.pool.query(
      `select 1 from workspace_memberships
        where workspace_id = $1 and user_id = $2 and state = 'ACTIVE'`,
      [command.workspaceId, command.actorId],
    );
    if ((active.rowCount ?? 0) === 0) throw safeNotFound(command.correlationId);
    await this.pool.query(
      `insert into workspace_selections (user_id, workspace_id)
       values ($1, $2)
       on conflict (user_id) do update
         set workspace_id = excluded.workspace_id, updated_at = now()`,
      [command.actorId, command.workspaceId],
    );
  }

  async updateProfile(command: UpdateProfileCommand): Promise<void> {
    const result = await this.pool.query(
      `update auth_users
          set name = $2, image = $3, notification_preferences = $4::jsonb, updated_at = now()
        where id = $1 and deactivated_at is null`,
      [
        command.actorId,
        command.command.displayName,
        command.command.avatarUrl,
        JSON.stringify({ email: command.command.emailNotifications }),
      ],
    );
    if ((result.rowCount ?? 0) === 0) throw safeNotFound(command.correlationId);
  }

  async listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
    const result = await this.pool.query<WorkspaceRow>(
      `select workspace.id, workspace.revision, workspace.name, workspace.logo_url,
              workspace.primary_color, workspace.time_zone, workspace.default_working_hours,
              membership.role, membership.revision as membership_revision
         from workspace_memberships membership
         join workspaces workspace on workspace.id = membership.workspace_id
        where membership.user_id = $1 and membership.state = 'ACTIVE'
        order by workspace.name, workspace.id`,
      [userId],
    );
    return result.rows.map((row) =>
      workspaceSummarySchema.parse({
        ...toWorkspace(row),
        role: row.role,
        membershipRevision: row.membership_revision,
      }),
    );
  }

  async getWorkspace(userId: string, workspaceId: string): Promise<Workspace> {
    const result = await this.pool.query<WorkspaceRow>(
      `select workspace.id, workspace.revision, workspace.name, workspace.logo_url,
              workspace.primary_color, workspace.time_zone, workspace.default_working_hours
         from workspaces workspace
         join workspace_memberships membership on membership.workspace_id = workspace.id
        where workspace.id = $1 and membership.user_id = $2 and membership.state = 'ACTIVE'`,
      [workspaceId, userId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound(uuidv7());
    return toWorkspace(row);
  }

  async listMemberships(userId: string, workspaceId: string): Promise<WorkspaceMembership[]> {
    await this.requireActive(this.pool, userId, workspaceId, uuidv7());
    const result = await this.pool.query<MembershipRow>(
      `select membership.workspace_id, membership.user_id, membership.role, membership.state,
              membership.revision, users.name, users.email
         from workspace_memberships membership
         join auth_users users on users.id = membership.user_id
        where membership.workspace_id = $1
        order by case membership.role when 'ADMIN' then 0 else 1 end, users.name`,
      [workspaceId],
    );
    return result.rows.map((row) =>
      workspaceMembershipSchema.parse({
        workspaceId: row.workspace_id,
        userId: row.user_id,
        displayName: row.name,
        email: row.email,
        role: row.role,
        state: row.state,
        revision: row.revision,
      }),
    );
  }

  async listInvitations(userId: string, workspaceId: string): Promise<WorkspaceInvitation[]> {
    await this.requireAdmin(this.pool, userId, workspaceId, uuidv7());
    const result = await this.pool.query<InvitationRow>(
      `select id, workspace_id, email, role,
              case when state = 'PENDING' and expires_at <= now() then 'EXPIRED' else state end as state,
              revision, expires_at
         from workspace_invitations
        where workspace_id = $1
        order by created_at desc`,
      [workspaceId],
    );
    return result.rows.map((row) =>
      workspaceInvitationSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        email: row.email,
        role: row.role,
        state: row.state,
        revision: row.revision,
        expiresAt: row.expires_at.toISOString(),
      }),
    );
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
    command: MutationCommand,
  ): Promise<IdentityMutationResult | undefined> {
    const hash = commandHash(command);
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
    return identityMutationResultSchema.parse({ ...row.result, replayed: true });
  }

  private async completeMutation(
    client: PoolClient,
    command: MutationCommand,
    input: {
      action: string;
      targetType: string;
      targetId: string;
      aggregateRevision: number;
      state: string;
      eventType:
        | 'identity.workspace.created.v1'
        | 'identity.workspace.updated.v1'
        | 'identity.invitation.issued.v1'
        | 'identity.invitation.accepted.v1'
        | 'identity.membership.changed.v1';
      beforeSummary?: Record<string, unknown>;
      afterSummary: Record<string, unknown>;
    },
  ): Promise<IdentityMutationResult> {
    const auditEventId = uuidv7();
    const outboxEventId = uuidv7();
    const occurredAt = new Date().toISOString();
    await client.query(
      `insert into audit_events
        (id, workspace_id, actor_id, action, target_type, target_id, correlation_id,
         before_summary, after_summary, occurred_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        auditEventId,
        command.workspaceId,
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
    const payload = identityOutboxJobSchema.parse({
      schemaVersion: '1',
      eventId: outboxEventId,
      eventType: input.eventType,
      workspaceId: command.workspaceId,
      aggregateId: input.targetId,
      aggregateRevision: input.aggregateRevision,
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
        input.aggregateRevision,
        input.eventType,
        JSON.stringify(payload),
        command.correlationId,
        occurredAt,
      ],
    );
    const result = identityMutationResultSchema.parse({
      schemaVersion: '1',
      entityId: input.targetId,
      revision: input.aggregateRevision,
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

  private async requireActive(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    userId: string,
    workspaceId: string,
    correlationId: string,
  ): Promise<void> {
    const membership = await client.query(
      `select 1 from workspace_memberships
        where workspace_id = $1 and user_id = $2 and state = 'ACTIVE'`,
      [workspaceId, userId],
    );
    if ((membership.rowCount ?? 0) === 0) throw safeNotFound(correlationId);
  }

  private async requireAdmin(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    userId: string,
    workspaceId: string,
    correlationId: string,
  ): Promise<void> {
    const membership = await client.query(
      `select 1 from workspace_memberships
        where workspace_id = $1 and user_id = $2 and state = 'ACTIVE' and role = 'ADMIN'`,
      [workspaceId, userId],
    );
    if ((membership.rowCount ?? 0) === 0) throw safeNotFound(correlationId);
  }

  private async lockWorkspace(
    client: PoolClient,
    workspaceId: string,
    correlationId: string,
  ): Promise<WorkspaceRow> {
    const result = await client.query<WorkspaceRow>(
      `select id, revision, name, logo_url, primary_color, time_zone, default_working_hours
         from workspaces where id = $1 for update`,
      [workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound(correlationId);
    return row;
  }

  private revisionConflict(correlationId: string, currentRevision: number): ApplicationError {
    return new ApplicationError({
      code: 'REVISION_CONFLICT',
      message: 'The resource changed. Reload it and retry.',
      correlationId,
      currentRevision,
    });
  }
}
