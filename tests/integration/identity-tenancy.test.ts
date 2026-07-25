import { createHash } from 'node:crypto';

import {
  AcceptWorkspaceInvitation,
  ChangeWorkspaceMembership,
  CreateWorkspace,
  IssueWorkspaceInvitation,
} from '@delivery-os/application';
import {
  acceptInvitationCommandSchema,
  changeMembershipCommandSchema,
  createWorkspaceCommandSchema,
  issueInvitationCommandSchema,
} from '@delivery-os/contracts';
import { PostgresIdentityStore } from '@delivery-os/database';
import { invitationExpiresAt } from '@delivery-os/domain';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { migrateDatabase, withTemporaryDatabase } from '../helpers/database';

async function insertUser(
  pool: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  input: { id?: string; email: string; name?: string },
): Promise<string> {
  const id = input.id ?? uuidv7();
  await pool.query(
    `insert into auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [id, input.name ?? input.email.split('@')[0], input.email.toLowerCase()],
  );
  return id;
}

function createWorkspaceCommand(actorId: string, workspaceId = uuidv7()) {
  return createWorkspaceCommandSchema.parse({
    schemaVersion: '1',
    actorId,
    workspaceId,
    expectedRevision: 0,
    idempotencyKey: uuidv7(),
    correlationId: uuidv7(),
    command: { name: `Workspace ${workspaceId.slice(-5)}` },
  });
}

describe('M1 identity tenancy repository', () => {
  it('supports explicit multi-workspace membership without domain-derived access', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const userId = await insertUser(pool, { email: 'admin@shared-domain.example' });
      const outsiderId = await insertUser(pool, { email: 'outsider@shared-domain.example' });
      const store = new PostgresIdentityStore(pool);
      const first = createWorkspaceCommand(userId);
      const second = createWorkspaceCommand(userId);

      const firstResult = await new CreateWorkspace(store).execute(first);
      await new CreateWorkspace(store).execute(second);
      const replay = await new CreateWorkspace(store).execute(first);

      expect(replay.replayed).toBe(true);
      expect(replay.entityId).toBe(firstResult.entityId);
      expect(await store.listWorkspaces(userId)).toHaveLength(2);
      expect(await store.listWorkspaces(outsiderId)).toEqual([]);
      await expect(store.getWorkspace(outsiderId, first.workspaceId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      });

      const evidence = await pool.query<{ audit_count: string; outbox_count: string }>(
        `select
           (select count(*) from audit_events where workspace_id in ($1, $2))::text as audit_count,
           (select count(*) from outbox_events where workspace_id in ($1, $2))::text as outbox_count`,
        [first.workspaceId, second.workspaceId],
      );
      expect(evidence.rows[0]).toEqual({ audit_count: '2', outbox_count: '2' });
    });
  });

  it('accepts a personal-email invitation and invalidates the previous token on reissue', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const adminId = await insertUser(pool, { email: 'admin@company.example' });
      const clientId = await insertUser(pool, { email: 'client@personal.example' });
      const store = new PostgresIdentityStore(pool);
      const workspace = createWorkspaceCommand(adminId);
      await new CreateWorkspace(store).execute(workspace);
      const issuedAt = new Date();
      const firstToken = 'first-secret-token';
      const firstInvitationId = uuidv7();
      const first = issueInvitationCommandSchema.parse({
        schemaVersion: '1',
        actorId: adminId,
        invitationId: firstInvitationId,
        workspaceId: workspace.workspaceId,
        expectedRevision: 0,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        mfaVerifiedAt: issuedAt.toISOString(),
        command: {
          email: 'Client@Personal.Example',
          role: 'MEMBER',
          tokenDigest: createHash('sha256').update(firstToken).digest('hex'),
          expiresAt: invitationExpiresAt(issuedAt).toISOString(),
        },
      });
      await new IssueWorkspaceInvitation(store).execute(first);

      const secondToken = 'second-secret-token';
      const secondInvitationId = uuidv7();
      const second = issueInvitationCommandSchema.parse({
        ...first,
        invitationId: secondInvitationId,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        command: {
          ...first.command,
          tokenDigest: createHash('sha256').update(secondToken).digest('hex'),
        },
      });
      await new IssueWorkspaceInvitation(store).execute(second);

      const oldState = await pool.query<{ state: string; replaced_by_id: string | null }>(
        `select state, replaced_by_id from workspace_invitations where id = $1`,
        [firstInvitationId],
      );
      expect(oldState.rows[0]).toEqual({
        state: 'REVOKED',
        replaced_by_id: secondInvitationId,
      });
      expect(JSON.stringify(oldState.rows)).not.toContain(firstToken);

      await expect(
        new AcceptWorkspaceInvitation(store).execute(
          acceptInvitationCommandSchema.parse({
            schemaVersion: '1',
            actorId: clientId,
            workspaceId: workspace.workspaceId,
            expectedRevision: 2,
            idempotencyKey: uuidv7(),
            correlationId: uuidv7(),
            command: {
              invitationId: firstInvitationId,
              tokenDigest: first.command.tokenDigest,
              verifiedEmail: 'client@personal.example',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const accepted = await new AcceptWorkspaceInvitation(store).execute(
        acceptInvitationCommandSchema.parse({
          schemaVersion: '1',
          actorId: clientId,
          workspaceId: workspace.workspaceId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          command: {
            invitationId: secondInvitationId,
            tokenDigest: second.command.tokenDigest,
            verifiedEmail: 'CLIENT@personal.example',
          },
        }),
      );
      expect(accepted.state).toBe('ACCEPTED');
      expect((await store.listWorkspaces(clientId))[0]?.id).toBe(workspace.workspaceId);
    });
  });

  it('blocks expired/wrong-email invitations and protects the last active Admin', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const adminId = await insertUser(pool, { email: 'admin@example.com' });
      const inviteeId = await insertUser(pool, { email: 'wrong@example.net' });
      const store = new PostgresIdentityStore(pool);
      const workspace = createWorkspaceCommand(adminId);
      await new CreateWorkspace(store).execute(workspace);
      const invitationId = uuidv7();
      const digest = createHash('sha256').update('expired-token').digest('hex');
      await store.issueInvitation(
        issueInvitationCommandSchema.parse({
          schemaVersion: '1',
          actorId: adminId,
          invitationId,
          workspaceId: workspace.workspaceId,
          expectedRevision: 0,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          mfaVerifiedAt: new Date().toISOString(),
          command: {
            email: 'expected@example.net',
            role: 'MEMBER',
            tokenDigest: digest,
            expiresAt: new Date(Date.now() - 1_000).toISOString(),
          },
        }),
      );
      await expect(
        store.acceptInvitation(
          acceptInvitationCommandSchema.parse({
            schemaVersion: '1',
            actorId: inviteeId,
            workspaceId: workspace.workspaceId,
            expectedRevision: 1,
            idempotencyKey: uuidv7(),
            correlationId: uuidv7(),
            command: {
              invitationId,
              tokenDigest: digest,
              verifiedEmail: 'wrong@example.net',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await expect(
        new ChangeWorkspaceMembership(store).execute(
          changeMembershipCommandSchema.parse({
            schemaVersion: '1',
            actorId: adminId,
            workspaceId: workspace.workspaceId,
            expectedRevision: 1,
            idempotencyKey: uuidv7(),
            correlationId: uuidv7(),
            mfaVerifiedAt: new Date().toISOString(),
            command: { targetUserId: adminId, deactivate: true },
          }),
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: 'Assign another active Admin before changing this membership.',
      });
    });
  });

  it('preserves attribution and revokes sessions on membership deactivation', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const firstAdmin = await insertUser(pool, { email: 'first@example.com' });
      const secondAdmin = await insertUser(pool, { email: 'second@example.net' });
      const store = new PostgresIdentityStore(pool);
      const workspace = createWorkspaceCommand(firstAdmin);
      await new CreateWorkspace(store).execute(workspace);
      await pool.query(
        `insert into workspace_memberships (workspace_id, user_id, role, state, revision, invited_by)
         values ($1, $2, 'ADMIN', 'ACTIVE', 1, $3)`,
        [workspace.workspaceId, secondAdmin, firstAdmin],
      );
      await pool.query(
        `insert into auth_sessions (id, expires_at, token, user_id)
         values ($1, now() + interval '1 day', $2, $3)`,
        [uuidv7(), 'session-token-that-will-be-revoked', firstAdmin],
      );
      await new ChangeWorkspaceMembership(store).execute(
        changeMembershipCommandSchema.parse({
          schemaVersion: '1',
          actorId: secondAdmin,
          workspaceId: workspace.workspaceId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          mfaVerifiedAt: new Date().toISOString(),
          command: { targetUserId: firstAdmin, deactivate: true },
        }),
      );

      const membership = await pool.query<{ state: string; user_id: string }>(
        `select state, user_id from workspace_memberships
          where workspace_id = $1 and user_id = $2`,
        [workspace.workspaceId, firstAdmin],
      );
      const sessions = await pool.query<{ count: string }>(
        `select count(*)::text as count from auth_sessions where user_id = $1`,
        [firstAdmin],
      );
      const user = await pool.query<{ deactivated_at: Date | null }>(
        `select deactivated_at from auth_users where id = $1`,
        [firstAdmin],
      );
      expect(membership.rows[0]).toEqual({ state: 'DEACTIVATED', user_id: firstAdmin });
      expect(sessions.rows[0]?.count).toBe('0');
      expect(user.rows[0]?.deactivated_at).not.toBeNull();
    });
  });

  it('serializes competing Admin deactivations so one active Admin remains', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const firstAdmin = await insertUser(pool, { email: 'race-first@example.com' });
      const secondAdmin = await insertUser(pool, { email: 'race-second@example.net' });
      const store = new PostgresIdentityStore(pool);
      const workspace = createWorkspaceCommand(firstAdmin);
      await new CreateWorkspace(store).execute(workspace);
      await pool.query(
        `insert into workspace_memberships (workspace_id, user_id, role, state, revision, invited_by)
         values ($1, $2, 'ADMIN', 'ACTIVE', 1, $3)`,
        [workspace.workspaceId, secondAdmin, firstAdmin],
      );

      const commandFor = (actorId: string, targetUserId: string) =>
        changeMembershipCommandSchema.parse({
          schemaVersion: '1',
          actorId,
          workspaceId: workspace.workspaceId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          mfaVerifiedAt: new Date().toISOString(),
          command: { targetUserId, deactivate: true },
        });
      const results = await Promise.allSettled([
        new ChangeWorkspaceMembership(store).execute(commandFor(firstAdmin, secondAdmin)),
        new ChangeWorkspaceMembership(store).execute(commandFor(secondAdmin, firstAdmin)),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejection = results.find((result) => result.status === 'rejected');
      expect(rejection?.status).toBe('rejected');
      if (rejection?.status === 'rejected') {
        expect(['INVALID_TRANSITION', 'NOT_FOUND']).toContain(
          (rejection.reason as { code?: unknown }).code,
        );
      }
      const activeAdmins = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from workspace_memberships
          where workspace_id = $1 and role = 'ADMIN' and state = 'ACTIVE'`,
        [workspace.workspaceId],
      );
      expect(activeAdmins.rows[0]?.count).toBe('1');
    });
  });

  it('keeps identity active when another active workspace membership remains', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const firstAdmin = await insertUser(pool, { email: 'first-owner@example.com' });
      const secondAdmin = await insertUser(pool, { email: 'second-owner@example.net' });
      const member = await insertUser(pool, { email: 'multi-workspace@example.org' });
      const store = new PostgresIdentityStore(pool);
      const firstWorkspace = createWorkspaceCommand(firstAdmin);
      const secondWorkspace = createWorkspaceCommand(secondAdmin);
      await new CreateWorkspace(store).execute(firstWorkspace);
      await new CreateWorkspace(store).execute(secondWorkspace);
      await pool.query(
        `insert into workspace_memberships (workspace_id, user_id, role, state, revision, invited_by)
         values ($1, $3, 'MEMBER', 'ACTIVE', 1, $2),
                ($4, $3, 'MEMBER', 'ACTIVE', 1, $5)`,
        [firstWorkspace.workspaceId, firstAdmin, member, secondWorkspace.workspaceId, secondAdmin],
      );

      await new ChangeWorkspaceMembership(store).execute(
        changeMembershipCommandSchema.parse({
          schemaVersion: '1',
          actorId: firstAdmin,
          workspaceId: firstWorkspace.workspaceId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          mfaVerifiedAt: new Date().toISOString(),
          command: { targetUserId: member, deactivate: true },
        }),
      );

      const user = await pool.query<{ deactivated_at: Date | null }>(
        `select deactivated_at from auth_users where id = $1`,
        [member],
      );
      expect(user.rows[0]?.deactivated_at).toBeNull();
      expect((await store.listWorkspaces(member)).map((item) => item.id)).toEqual([
        secondWorkspace.workspaceId,
      ]);
    });
  });

  it('updates tenant-scoped settings, selections, profiles, and rejects stale revisions', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const adminId = await insertUser(pool, { email: 'settings-admin@example.com' });
      const outsiderId = await insertUser(pool, { email: 'settings-outsider@example.net' });
      const store = new PostgresIdentityStore(pool);
      const workspace = createWorkspaceCommand(adminId);
      await new CreateWorkspace(store).execute(workspace);

      await store.updateProfile({
        schemaVersion: '1',
        actorId: adminId,
        correlationId: uuidv7(),
        command: {
          displayName: 'Updated Admin',
          avatarUrl: 'https://example.com/avatar.png',
          emailNotifications: false,
        },
      });
      await store.switchWorkspace({
        schemaVersion: '1',
        actorId: adminId,
        workspaceId: workspace.workspaceId,
        correlationId: uuidv7(),
      });
      await expect(
        store.switchWorkspace({
          schemaVersion: '1',
          actorId: outsiderId,
          workspaceId: workspace.workspaceId,
          correlationId: uuidv7(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const updated = await store.updateWorkspace({
        schemaVersion: '1',
        actorId: adminId,
        workspaceId: workspace.workspaceId,
        expectedRevision: 1,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        mfaVerifiedAt: new Date().toISOString(),
        command: {
          name: 'Updated Workspace',
          logoUrl: 'https://example.com/logo.svg',
          primaryColor: '#123456',
          timeZone: 'Europe/London',
          defaultWorkingHours: { days: [1, 2, 3, 4], start: '08:30', end: '16:30' },
        },
      });
      expect(updated.revision).toBe(2);
      expect((await store.getWorkspace(adminId, workspace.workspaceId)).name).toBe(
        'Updated Workspace',
      );
      expect(await store.listMemberships(adminId, workspace.workspaceId)).toHaveLength(1);
      expect(await store.listInvitations(adminId, workspace.workspaceId)).toEqual([]);
      await expect(store.listInvitations(outsiderId, workspace.workspaceId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      await expect(
        store.updateWorkspace({
          schemaVersion: '1',
          actorId: adminId,
          workspaceId: workspace.workspaceId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          mfaVerifiedAt: new Date().toISOString(),
          command: {
            name: 'Stale',
            logoUrl: null,
            primaryColor: '#123456',
            timeZone: 'UTC',
            defaultWorkingHours: { days: [1], start: '09:00', end: '17:00' },
          },
        }),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });

      const profile = await pool.query<{
        name: string;
        image: string | null;
        notification_preferences: { email: boolean };
      }>(`select name, image, notification_preferences from auth_users where id = $1`, [adminId]);
      expect(profile.rows[0]).toEqual({
        name: 'Updated Admin',
        image: 'https://example.com/avatar.png',
        notification_preferences: { email: false },
      });
    });
  });
});
