import { createHash } from 'node:crypto';

import {
  AcceptWorkspaceInvitation,
  CreateClient,
  CreateProject,
  CreateWorkspace,
} from '@delivery-os/application';
import {
  acceptInvitationCommandSchema,
  acceptProjectInvitationCommandSchema,
  changeClientStateCommandSchema,
  createClientCommandSchema,
  createProjectCommandSchema,
  createWorkspaceCommandSchema,
  deactivateProjectMemberCommandSchema,
  inviteProjectStakeholderCommandSchema,
  setCalendarExceptionCommandSchema,
  setMemberAvailabilityCommandSchema,
  setProjectRolesCommandSchema,
  transitionProjectLifecycleCommandSchema,
  updateClientCommandSchema,
  updateProjectCalendarCommandSchema,
  updateProjectCommandSchema,
} from '@delivery-os/contracts';
import {
  PostgresIdentityStore,
  PostgresProjectStore,
  type DatabasePool,
} from '@delivery-os/database';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { migrateDatabase, withTemporaryDatabase } from '../helpers/database';

async function insertUser(
  pool: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  email: string,
): Promise<string> {
  const id = uuidv7();
  await pool.query(
    `insert into auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [id, email.split('@')[0], email],
  );
  return id;
}

function envelope(actorId: string, workspaceId: string, expectedRevision = 0) {
  return {
    schemaVersion: '1' as const,
    actorId,
    workspaceId,
    expectedRevision,
    idempotencyKey: uuidv7(),
    correlationId: uuidv7(),
    mfaVerifiedAt: new Date().toISOString(),
    overrideReason: null,
  };
}

async function setupWorkspace(pool: DatabasePool, additionalMemberCount = 2) {
  const adminId = await insertUser(pool, 'admin@example.test');
  const members = await Promise.all(
    Array.from({ length: additionalMemberCount }, (_, index) =>
      insertUser(pool, `member-${index}@example.test`),
    ),
  );
  const identity = new PostgresIdentityStore(pool);
  const workspaceId = uuidv7();
  await new CreateWorkspace(identity).execute(
    createWorkspaceCommandSchema.parse({
      ...envelope(adminId, workspaceId),
      command: { name: 'Registry test workspace' },
    }),
  );
  for (const memberId of members) {
    await pool.query(
      `insert into workspace_memberships
        (workspace_id, user_id, role, state, revision, invited_by, activated_at)
       values ($1, $2, 'MEMBER', 'ACTIVE', 1, $3, now())`,
      [workspaceId, memberId, adminId],
    );
  }
  return { adminId, members, identity, workspaceId };
}

function internalProjectCommand(
  actorId: string,
  workspaceId: string,
  projectManagerId: string,
  contributors: string[] = [],
) {
  return createProjectCommandSchema.parse({
    ...envelope(actorId, workspaceId),
    projectId: uuidv7(),
    outcomeModuleId: uuidv7(),
    projectInvitationId: null,
    workspaceInvitationId: null,
    command: {
      type: 'INTERNAL',
      clientId: null,
      name: 'Internal registry project',
      shortDescription: 'Validates project governance and capacity.',
      targetStart: '2026-08-01',
      targetEnd: '2026-10-31',
      projectManagerId,
      leadUserId: null,
      contributorIds: contributors,
      stakeholderEmail: null,
      stakeholderTokenDigest: null,
      workspaceTokenDigest: null,
      stakeholderExpiresAt: null,
      calendar: {
        timeZone: 'UTC',
        workingWeekdays: [1, 2, 3, 4, 5],
        dailyStart: '09:00',
        dailyEnd: '17:00',
      },
    },
  });
}

describe('M2 client and project registry repository', () => {
  it('keeps invitations explicit, tenant-scoped, idempotent, and readiness-gated', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const { adminId, members, identity, workspaceId } = await setupWorkspace(pool, 1);
      const projectManagerId = members[0];
      if (projectManagerId === undefined) throw new Error('Expected a project manager');
      const stakeholderId = await insertUser(pool, 'client@personal.test');
      const outsiderId = await insertUser(pool, 'outsider@example.test');
      const store = new PostgresProjectStore(pool);
      const clientId = uuidv7();
      const createClient = createClientCommandSchema.parse({
        ...envelope(adminId, workspaceId),
        clientId,
        command: {
          name: 'Acme Client',
          logoUrl: null,
          primaryContactName: 'Client Owner',
          primaryContactEmail: 'owner@acme.test',
          industry: 'Technology',
          notes: null,
        },
      });
      const firstClient = await new CreateClient(store).execute(createClient);
      const replayedClient = await new CreateClient(store).execute(createClient);
      expect(firstClient.replayed).toBe(false);
      expect(replayedClient).toMatchObject({
        entityId: clientId,
        replayed: true,
        auditEventId: firstClient.auditEventId,
      });
      const updatedClient = await store.updateClient(
        updateClientCommandSchema.parse({
          ...envelope(adminId, workspaceId, 1),
          clientId,
          command: {
            ...createClient.command,
            notes: 'Updated during registry validation.',
          },
        }),
      );
      expect(updatedClient.revision).toBe(2);
      expect(await store.listClients(adminId, workspaceId)).toHaveLength(1);
      expect((await store.getClient(adminId, workspaceId, clientId)).notes).toContain('Updated');

      const projectTokenDigest = createHash('sha256').update('project-secret').digest('hex');
      const workspaceTokenDigest = createHash('sha256').update('workspace-secret').digest('hex');
      const projectInvitationId = uuidv7();
      const workspaceInvitationId = uuidv7();
      const project = createProjectCommandSchema.parse({
        ...envelope(adminId, workspaceId),
        projectId: uuidv7(),
        outcomeModuleId: uuidv7(),
        projectInvitationId,
        workspaceInvitationId,
        command: {
          type: 'EXTERNAL',
          clientId,
          name: 'Client delivery',
          shortDescription: 'A governed client delivery project.',
          targetStart: '2026-08-01',
          targetEnd: '2026-12-15',
          projectManagerId,
          leadUserId: null,
          contributorIds: [],
          stakeholderEmail: 'client@personal.test',
          stakeholderTokenDigest: projectTokenDigest,
          workspaceTokenDigest,
          stakeholderExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          calendar: {
            timeZone: 'Asia/Kolkata',
            workingWeekdays: [1, 2, 3, 4, 5],
            dailyStart: '09:30',
            dailyEnd: '17:30',
          },
        },
      });
      await new CreateProject(store).execute(project);
      const pmClientUpdate = await store.updateClient(
        updateClientCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, 2),
          clientId,
          command: {
            ...createClient.command,
            notes: 'Updated by the assigned client Project Manager.',
          },
        }),
      );
      expect(pmClientUpdate.revision).toBe(3);
      const internalProject = internalProjectCommand(adminId, workspaceId, projectManagerId);
      await new CreateProject(store).execute(internalProject);
      const firstPage = await store.listProjects(adminId, workspaceId, {
        search: '',
        limit: 1,
      });
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextCursor).not.toBeNull();
      if (firstPage.nextCursor === null) throw new Error('Expected a project cursor');
      expect(
        (
          await store.listProjects(adminId, workspaceId, {
            search: '',
            cursorUpdatedAt: firstPage.nextCursor.updatedAt,
            cursorId: firstPage.nextCursor.id,
            limit: 1,
          })
        ).items,
      ).toHaveLength(1);
      expect(
        (
          await store.listProjects(projectManagerId, workspaceId, {
            search: 'Client',
            clientId,
            lifecycleState: 'DRAFT',
            projectManagerId,
            targetFrom: '2026-08-01',
            targetTo: '2026-12-31',
            limit: 25,
          })
        ).items.map((item) => item.id),
      ).toEqual([project.projectId]);
      await expect(
        store.listProjects(outsiderId, workspaceId, { search: '', limit: 25 }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const pending = await pool.query<{
        state: string;
        workspace_invitation_id: string | null;
      }>(
        `select state, workspace_invitation_id
           from project_invitations where id = $1`,
        [projectInvitationId],
      );
      expect(pending.rows[0]).toEqual({
        state: 'PENDING',
        workspace_invitation_id: workspaceInvitationId,
      });
      expect(
        await pool.query(
          `select 1 from project_memberships
            where project_id = $1 and user_id = $2`,
          [project.projectId, stakeholderId],
        ),
      ).toHaveProperty('rowCount', 0);
      await expect(
        store.getProject(outsiderId, workspaceId, project.projectId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const beforeAcceptance = transitionProjectLifecycleCommandSchema.parse({
        ...envelope(projectManagerId, workspaceId, 1),
        projectId: project.projectId,
        command: {
          toState: 'INTAKE',
          reason: null,
          holdOwnerId: null,
          holdReviewDate: null,
        },
      });
      await expect(store.transitionProjectLifecycle(beforeAcceptance)).rejects.toMatchObject({
        code: 'READINESS_FAILED',
        details: {
          unmetCriteria: [
            {
              code: 'CLIENT_STAKEHOLDER_REQUIRED',
              message: 'Activate at least one client stakeholder.',
            },
          ],
        },
      });

      await new AcceptWorkspaceInvitation(identity).execute(
        acceptInvitationCommandSchema.parse({
          ...envelope(stakeholderId, workspaceId, 1),
          invitationId: workspaceInvitationId,
          command: {
            invitationId: workspaceInvitationId,
            tokenDigest: workspaceTokenDigest,
            verifiedEmail: 'client@personal.test',
          },
        }),
      );
      await store.acceptProjectInvitation(
        acceptProjectInvitationCommandSchema.parse({
          ...envelope(stakeholderId, workspaceId, 1),
          projectId: project.projectId,
          command: {
            invitationId: projectInvitationId,
            tokenDigest: projectTokenDigest,
            verifiedEmail: 'client@personal.test',
          },
        }),
      );
      expect(await store.isClientStakeholderOnly(stakeholderId, workspaceId)).toBe(true);
      expect(await store.isClientStakeholderOnly(adminId, workspaceId)).toBe(false);
      expect(
        await store.listProjects(stakeholderId, workspaceId, {
          search: '',
          limit: 25,
        }),
      ).toEqual({ items: [], nextCursor: null });

      const calendarUpdated = await store.updateProjectCalendar(
        updateProjectCalendarCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, 2),
          projectId: project.projectId,
          command: {
            timeZone: 'Asia/Singapore',
            workingWeekdays: [1, 2, 3, 4, 5],
            dailyStart: '09:00',
            dailyEnd: '17:00',
          },
        }),
      );
      const exceptionSet = await store.setCalendarException(
        setCalendarExceptionCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, calendarUpdated.revision),
          projectId: project.projectId,
          command: {
            date: '2026-08-10',
            kind: 'NON_WORKING',
            workingMinutes: null,
            reason: 'Regional holiday',
          },
        }),
      );
      const projectUpdated = await store.updateProject(
        updateProjectCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, exceptionSet.revision),
          projectId: project.projectId,
          command: {
            name: 'Client delivery updated',
            shortDescription: 'A governed client delivery project with updated scope.',
            targetStart: '2026-08-01',
            targetEnd: '2026-12-20',
            completionSummary: null,
          },
        }),
      );
      expect(
        await store.getProjectReadiness(adminId, workspaceId, project.projectId, 'INTAKE'),
      ).toMatchObject({ ready: true });
      expect(await store.listProjectMembers(adminId, workspaceId, project.projectId)).toHaveLength(
        2,
      );
      expect(
        (await store.getProjectCalendar(adminId, workspaceId, project.projectId)).exceptions,
      ).toHaveLength(1);
      expect(await store.listMemberAvailability(adminId, workspaceId, project.projectId)).toEqual(
        [],
      );
      expect((await store.getProjectOutcome(adminId, workspaceId, project.projectId)).name).toBe(
        'Client delivery updated',
      );

      const transition = transitionProjectLifecycleCommandSchema.parse({
        ...envelope(projectManagerId, workspaceId, projectUpdated.revision),
        projectId: project.projectId,
        command: {
          toState: 'INTAKE',
          reason: null,
          holdOwnerId: null,
          holdReviewDate: null,
        },
      });
      const transitioned = await store.transitionProjectLifecycle(transition);
      expect(transitioned.state).toBe('INTAKE');
      expect((await store.transitionProjectLifecycle(transition)).replayed).toBe(true);
      expect((await store.getProject(adminId, workspaceId, project.projectId)).lifecycleState).toBe(
        'INTAKE',
      );
      expect(
        await store.listProjectLifecycleHistory(adminId, workspaceId, project.projectId),
      ).toHaveLength(1);

      await expect(
        store.changeClientState(
          changeClientStateCommandSchema.parse({
            ...envelope(adminId, workspaceId, 3),
            clientId,
            command: {
              state: 'ARCHIVED',
              reason: 'Client delivery is being closed.',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

      const invitationId = uuidv7();
      const invitationResult = await store.inviteProjectStakeholder(
        inviteProjectStakeholderCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, transitioned.revision),
          projectId: project.projectId,
          invitationId,
          workspaceInvitationId: uuidv7(),
          command: {
            email: 'another-client@example.test',
            tokenDigest: createHash('sha256').update('project-two').digest('hex'),
            workspaceTokenDigest: createHash('sha256').update('workspace-two').digest('hex'),
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
        }),
      );
      await store.markProjectInvitationDeliveryFailed(
        workspaceId,
        invitationId,
        'EMAIL_DELIVERY_FAILED_WITH_A_VERY_LONG_SAFE_CODE',
      );
      const cancelled = await store.transitionProjectLifecycle(
        transitionProjectLifecycleCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, invitationResult.revision),
          projectId: project.projectId,
          command: {
            toState: 'CANCELLED',
            reason: 'The client ended this engagement.',
            holdOwnerId: null,
            holdReviewDate: null,
          },
        }),
      );
      const archived = await store.transitionProjectLifecycle(
        transitionProjectLifecycleCommandSchema.parse({
          ...envelope(projectManagerId, workspaceId, cancelled.revision),
          projectId: project.projectId,
          command: {
            toState: 'ARCHIVED',
            reason: 'The cancelled engagement is finalized.',
            holdOwnerId: null,
            holdReviewDate: null,
          },
        }),
      );
      expect(archived.state).toBe('ARCHIVED');
      const archivedClient = await store.changeClientState(
        changeClientStateCommandSchema.parse({
          ...envelope(adminId, workspaceId, 3),
          clientId,
          command: {
            state: 'ARCHIVED',
            reason: 'All client projects are now inactive.',
          },
        }),
      );
      expect(archivedClient.state).toBe('ARCHIVED');
      expect(
        (
          await store.changeClientState(
            changeClientStateCommandSchema.parse({
              ...envelope(adminId, workspaceId, archivedClient.revision),
              clientId,
              command: {
                state: 'ACTIVE',
                reason: 'The client resumed delivery planning.',
              },
            }),
          )
        ).state,
      ).toBe('ACTIVE');
    });
  });

  it('serializes Project Manager replacement and preserves exactly one active PM', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const { adminId, members, workspaceId } = await setupWorkspace(pool, 3);
      const [firstManager, secondManager, thirdManager] = members as [string, string, string];
      const store = new PostgresProjectStore(pool);
      const project = internalProjectCommand(adminId, workspaceId, firstManager, [
        secondManager,
        thirdManager,
      ]);
      await new CreateProject(store).execute(project);
      const replacement = (targetUserId: string) =>
        setProjectRolesCommandSchema.parse({
          ...envelope(firstManager, workspaceId, 1),
          projectId: project.projectId,
          command: { targetUserId, roles: ['PM'] },
        });
      const results = await Promise.allSettled([
        store.setProjectRoles(replacement(secondManager)),
        store.setProjectRoles(replacement(thirdManager)),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);

      const managers = await pool.query<{ user_id: string }>(
        `select membership.user_id
           from project_memberships membership
           join project_membership_roles role
             on role.project_id = membership.project_id and role.user_id = membership.user_id
          where membership.project_id = $1 and membership.state = 'ACTIVE'
            and role.role = 'PM'`,
        [project.projectId],
      );
      expect(managers.rows).toHaveLength(1);
    });
  });

  it('requires atomic PM replacement, rejects overlapping availability, and locks archives', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const { adminId, members, workspaceId } = await setupWorkspace(pool, 2);
      const [managerId, contributorId] = members as [string, string];
      const store = new PostgresProjectStore(pool);
      const project = internalProjectCommand(adminId, workspaceId, managerId, [contributorId]);
      await new CreateProject(store).execute(project);

      await expect(
        store.deactivateProjectMember(
          deactivateProjectMemberCommandSchema.parse({
            ...envelope(managerId, workspaceId, 1),
            projectId: project.projectId,
            command: {
              targetUserId: managerId,
              replacementProjectManagerId: null,
              reason: 'Manager is leaving this delivery.',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

      const firstAvailability = setMemberAvailabilityCommandSchema.parse({
        ...envelope(managerId, workspaceId, 1),
        projectId: project.projectId,
        availabilityId: uuidv7(),
        command: {
          userId: contributorId,
          effectiveFrom: '2026-08-01',
          effectiveTo: '2026-08-31',
          allocationPercent: 50,
        },
      });
      const availabilityResult = await store.setMemberAvailability(firstAvailability);
      await expect(
        store.setMemberAvailability(
          setMemberAvailabilityCommandSchema.parse({
            ...envelope(managerId, workspaceId, availabilityResult.revision),
            projectId: project.projectId,
            availabilityId: uuidv7(),
            command: {
              userId: contributorId,
              effectiveFrom: '2026-08-15',
              effectiveTo: '2026-09-15',
              allocationPercent: 25,
            },
          }),
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'Availability periods for a project member cannot overlap.',
      });

      const deactivated = await store.deactivateProjectMember(
        deactivateProjectMemberCommandSchema.parse({
          ...envelope(managerId, workspaceId, availabilityResult.revision),
          projectId: project.projectId,
          command: {
            targetUserId: managerId,
            replacementProjectManagerId: contributorId,
            reason: 'Manager rotated off this delivery.',
          },
        }),
      );
      const cancelled = await store.transitionProjectLifecycle(
        transitionProjectLifecycleCommandSchema.parse({
          ...envelope(contributorId, workspaceId, deactivated.revision),
          projectId: project.projectId,
          command: {
            toState: 'CANCELLED',
            reason: 'Business priorities changed.',
            holdOwnerId: null,
            holdReviewDate: null,
          },
        }),
      );
      const archived = await store.transitionProjectLifecycle(
        transitionProjectLifecycleCommandSchema.parse({
          ...envelope(contributorId, workspaceId, cancelled.revision),
          projectId: project.projectId,
          command: {
            toState: 'ARCHIVED',
            reason: 'Cancellation record is finalized.',
            holdOwnerId: null,
            holdReviewDate: null,
          },
        }),
      );
      await expect(
        store.updateProject(
          updateProjectCommandSchema.parse({
            ...envelope(contributorId, workspaceId, archived.revision),
            projectId: project.projectId,
            command: {
              name: 'Tampered archived project',
              shortDescription: 'This mutation must not be accepted.',
              targetStart: '2026-08-01',
              targetEnd: '2026-10-31',
              completionSummary: null,
            },
          }),
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: 'Archived projects are read-only. Unarchive the project before editing it.',
      });
    });
  });

  it('rejects unsafe authority, role, revision, calendar, invitation, and lifecycle paths', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const { adminId, members, workspaceId } = await setupWorkspace(pool, 3);
      const [managerId, contributorId, outsiderMemberId] = members as [string, string, string];
      const store = new PostgresProjectStore(pool);

      const invalidTimeBase = internalProjectCommand(adminId, workspaceId, managerId, [
        contributorId,
      ]);
      await expect(
        store.createProject(
          createProjectCommandSchema.parse({
            ...invalidTimeBase,
            command: {
              ...invalidTimeBase.command,
              calendar: {
                ...invalidTimeBase.command.calendar,
                timeZone: 'Not/A_Time_Zone',
              },
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      const projectBase = internalProjectCommand(adminId, workspaceId, managerId, [contributorId]);
      const project = createProjectCommandSchema.parse({
        ...projectBase,
        idempotencyKey: uuidv7(),
        projectId: uuidv7(),
        outcomeModuleId: uuidv7(),
        command: { ...projectBase.command, leadUserId: contributorId },
      });
      await store.createProject(project);
      expect((await store.createProject(project)).replayed).toBe(true);

      const pmCreatedProject = internalProjectCommand(managerId, workspaceId, managerId);
      await store.createProject(pmCreatedProject);

      const clientId = uuidv7();
      const clientCommand = createClientCommandSchema.parse({
        ...envelope(managerId, workspaceId),
        clientId,
        command: {
          name: 'PM managed client',
          logoUrl: null,
          primaryContactName: 'Delivery Owner',
          primaryContactEmail: 'owner@pm-client.test',
          industry: null,
          notes: null,
        },
      });
      await store.createClient(clientCommand);
      const clientUpdate = updateClientCommandSchema.parse({
        ...envelope(adminId, workspaceId, 1),
        clientId,
        command: { ...clientCommand.command, notes: 'Managed by the assigned PM.' },
      });
      await store.updateClient(clientUpdate);
      expect((await store.updateClient(clientUpdate)).replayed).toBe(true);
      expect(await store.listClients(managerId, workspaceId)).toHaveLength(1);
      await expect(
        store.updateClient(
          updateClientCommandSchema.parse({
            ...clientUpdate,
            idempotencyKey: uuidv7(),
            expectedRevision: 1,
          }),
        ),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
      await expect(store.getClient(adminId, workspaceId, uuidv7())).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        store.changeClientState(
          changeClientStateCommandSchema.parse({
            ...envelope(managerId, workspaceId, 2),
            clientId,
            command: {
              state: 'ARCHIVED',
              reason: 'PM cannot archive the client.',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        store.changeClientState(
          changeClientStateCommandSchema.parse({
            ...envelope(adminId, workspaceId, 2),
            clientId,
            command: {
              state: 'ACTIVE',
              reason: 'The client is already active.',
            },
          }),
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'The client is already in that state.',
      });

      const viewerAssignment = setProjectRolesCommandSchema.parse({
        ...envelope(managerId, workspaceId, 1),
        projectId: project.projectId,
        command: { targetUserId: contributorId, roles: ['VIEWER'] },
      });
      const viewerResult = await store.setProjectRoles(viewerAssignment);
      expect((await store.setProjectRoles(viewerAssignment)).replayed).toBe(true);
      await expect(
        store.setProjectRoles(
          setProjectRolesCommandSchema.parse({
            ...envelope(managerId, workspaceId, viewerResult.revision),
            projectId: project.projectId,
            command: { targetUserId: managerId, roles: ['VIEWER'] },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        store.setProjectRoles(
          setProjectRolesCommandSchema.parse({
            ...envelope(managerId, workspaceId, viewerResult.revision),
            projectId: project.projectId,
            command: { targetUserId: contributorId, roles: ['CLIENT_STAKEHOLDER'] },
          }),
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message:
          'Client Stakeholder access must be activated through an accepted project invitation.',
      });
      const outsideWorkspaceId = await insertUser(pool, 'outside-workspace@example.test');
      await expect(
        store.setProjectRoles(
          setProjectRolesCommandSchema.parse({
            ...envelope(managerId, workspaceId, viewerResult.revision),
            projectId: project.projectId,
            command: { targetUserId: outsideWorkspaceId, roles: ['VIEWER'] },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        store.deactivateProjectMember(
          deactivateProjectMemberCommandSchema.parse({
            ...envelope(managerId, workspaceId, viewerResult.revision),
            projectId: project.projectId,
            command: {
              targetUserId: outsiderMemberId,
              replacementProjectManagerId: null,
              reason: 'This person is not assigned.',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const deactivated = await store.deactivateProjectMember(
        deactivateProjectMemberCommandSchema.parse({
          ...envelope(managerId, workspaceId, viewerResult.revision),
          projectId: project.projectId,
          command: {
            targetUserId: contributorId,
            replacementProjectManagerId: null,
            reason: 'Contributor rotated off delivery.',
          },
        }),
      );

      const overrideUpdate = updateProjectCommandSchema.parse({
        ...envelope(adminId, workspaceId, deactivated.revision),
        overrideReason: 'Emergency correction authorized by workspace Admin.',
        projectId: project.projectId,
        command: {
          name: 'Admin corrected project',
          shortDescription: 'The project was corrected under an audited override.',
          targetStart: '2026-08-01',
          targetEnd: '2026-10-31',
          completionSummary: null,
        },
      });
      const overrideResult = await store.updateProject(overrideUpdate);
      expect((await store.updateProject(overrideUpdate)).replayed).toBe(true);
      await expect(
        store.updateProject({
          ...overrideUpdate,
          command: { ...overrideUpdate.command, name: 'Reused key with changed intent' },
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      await expect(
        store.updateProject(
          updateProjectCommandSchema.parse({
            ...envelope(managerId, workspaceId, deactivated.revision),
            projectId: project.projectId,
            command: overrideUpdate.command,
          }),
        ),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
      await expect(
        store.updateProject(
          updateProjectCommandSchema.parse({
            ...envelope(adminId, workspaceId, overrideResult.revision),
            projectId: project.projectId,
            command: overrideUpdate.command,
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await expect(
        store.updateProjectCalendar(
          updateProjectCalendarCommandSchema.parse({
            ...envelope(managerId, workspaceId, overrideResult.revision),
            projectId: project.projectId,
            command: {
              timeZone: 'Bad/Zone',
              workingWeekdays: [1, 2, 3, 4, 5],
              dailyStart: '09:00',
              dailyEnd: '17:00',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(
        store.setCalendarException(
          setCalendarExceptionCommandSchema.parse({
            ...envelope(managerId, workspaceId, overrideResult.revision),
            projectId: project.projectId,
            command: {
              date: '2026-08-15',
              kind: 'NON_WORKING',
              workingMinutes: 60,
              reason: 'Invalid non-working minutes',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(
        store.setMemberAvailability(
          setMemberAvailabilityCommandSchema.parse({
            ...envelope(managerId, workspaceId, overrideResult.revision),
            projectId: project.projectId,
            availabilityId: uuidv7(),
            command: {
              userId: outsiderMemberId,
              effectiveFrom: '2026-08-01',
              effectiveTo: '2026-08-31',
              allocationPercent: 50,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await expect(
        store.transitionProjectLifecycle(
          transitionProjectLifecycleCommandSchema.parse({
            ...envelope(managerId, workspaceId, overrideResult.revision),
            projectId: project.projectId,
            command: {
              toState: 'EXECUTION',
              reason: null,
              holdOwnerId: null,
              holdReviewDate: null,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        store.transitionProjectLifecycle(
          transitionProjectLifecycleCommandSchema.parse({
            ...envelope(managerId, workspaceId, overrideResult.revision),
            projectId: project.projectId,
            command: {
              toState: 'ON_HOLD',
              reason: null,
              holdOwnerId: null,
              holdReviewDate: null,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      const holdCommand = transitionProjectLifecycleCommandSchema.parse({
        ...envelope(managerId, workspaceId, overrideResult.revision),
        projectId: project.projectId,
        command: {
          toState: 'ON_HOLD',
          reason: 'Waiting for an approved dependency.',
          holdOwnerId: managerId,
          holdReviewDate: '2026-08-15',
        },
      });
      const held = await store.transitionProjectLifecycle(holdCommand);
      expect((await store.transitionProjectLifecycle(holdCommand)).replayed).toBe(true);
      const resumed = await store.transitionProjectLifecycle(
        transitionProjectLifecycleCommandSchema.parse({
          ...envelope(managerId, workspaceId, held.revision),
          projectId: project.projectId,
          command: {
            toState: 'DRAFT',
            reason: null,
            holdOwnerId: null,
            holdReviewDate: null,
          },
        }),
      );
      expect(resumed.state).toBe('DRAFT');

      await expect(
        store.inviteProjectStakeholder(
          inviteProjectStakeholderCommandSchema.parse({
            ...envelope(managerId, workspaceId, resumed.revision),
            projectId: project.projectId,
            invitationId: uuidv7(),
            workspaceInvitationId: uuidv7(),
            command: {
              email: 'client@example.test',
              tokenDigest: createHash('sha256').update('project').digest('hex'),
              workspaceTokenDigest: createHash('sha256').update('workspace').digest('hex'),
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(
        store.acceptProjectInvitation(
          acceptProjectInvitationCommandSchema.parse({
            ...envelope(managerId, workspaceId, 1),
            projectId: project.projectId,
            command: {
              invitationId: uuidv7(),
              tokenDigest: createHash('sha256').update('missing').digest('hex'),
              verifiedEmail: 'wrong@example.test',
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const archivedClient = await store.changeClientState(
        changeClientStateCommandSchema.parse({
          ...envelope(adminId, workspaceId, 2),
          clientId,
          command: {
            state: 'ARCHIVED',
            reason: 'No active client projects remain.',
          },
        }),
      );
      const archivedExternal = createProjectCommandSchema.parse({
        ...envelope(managerId, workspaceId),
        projectId: uuidv7(),
        outcomeModuleId: uuidv7(),
        projectInvitationId: uuidv7(),
        workspaceInvitationId: uuidv7(),
        command: {
          type: 'EXTERNAL',
          clientId,
          name: 'Blocked archived client project',
          shortDescription: 'This project creation must be rejected.',
          targetStart: '2026-08-01',
          targetEnd: '2026-08-31',
          projectManagerId: managerId,
          leadUserId: null,
          contributorIds: [],
          stakeholderEmail: 'client@example.test',
          stakeholderTokenDigest: createHash('sha256').update('one').digest('hex'),
          workspaceTokenDigest: createHash('sha256').update('two').digest('hex'),
          stakeholderExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          calendar: {
            timeZone: 'UTC',
            workingWeekdays: [1, 2, 3, 4, 5],
            dailyStart: '09:00',
            dailyEnd: '17:00',
          },
        },
      });
      await expect(store.createProject(archivedExternal)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'Restore the client before creating a project.',
      });
      expect(archivedClient.state).toBe('ARCHIVED');

      await pool.query(`delete from project_working_calendars where project_id = $1`, [
        pmCreatedProject.projectId,
      ]);
      await expect(
        store.getProjectCalendar(adminId, workspaceId, pmCreatedProject.projectId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await pool.query(`delete from project_outcome_modules where project_id = $1`, [
        pmCreatedProject.projectId,
      ]);
      await expect(
        store.getProjectOutcome(adminId, workspaceId, pmCreatedProject.projectId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
