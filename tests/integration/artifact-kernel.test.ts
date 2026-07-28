import {
  createArtifactCommandSchema,
  createArtifactCommentCommandSchema,
  createArtifactDeltaCommandSchema,
  decideArtifactApprovalCommandSchema,
  mutateArtifactCommentCommandSchema,
  registerArtifactAttachmentCommandSchema,
  removeArtifactAttachmentCommandSchema,
  requestArtifactExportCommandSchema,
  saveDraftRevisionCommandSchema,
  submitArtifactForReviewCommandSchema,
} from '@delivery-os/contracts';
import { PostgresArtifactStore, type DatabasePool } from '@delivery-os/database';
import {
  ArtifactKindRegistry,
  diffCanonicalJson,
  type ArtifactKindAdapter,
  type CanonicalJsonValue,
} from '@delivery-os/domain';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { migrateDatabase, withTemporaryDatabase } from '../helpers/database';

interface TestBody {
  title: string;
  sections: { id: string; text: string; audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE' }[];
}

const adapter: ArtifactKindAdapter<TestBody> = {
  kind: 'KERNEL_TEST_ARTIFACT',
  schemaVersion: '1',
  policyVersion: '1',
  parse(body) {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { title?: unknown }).title !== 'string' ||
      !Array.isArray((body as { sections?: unknown }).sections)
    ) {
      throw new TypeError('Invalid test artifact.');
    }
    return body as TestBody;
  },
  normalize: (body) => body as unknown as CanonicalJsonValue,
  readHistorical: (canonicalBody) => JSON.parse(canonicalBody) as TestBody,
  projectAudience: (body, audience) => ({
    title: body.title,
    sections: body.sections
      .filter((section) => audience === 'TEAM_ONLY' || section.audience === 'CLIENT_VISIBLE')
      .map((section) => ({ id: section.id, text: section.text, audience: section.audience })),
  }),
  diff: (before, after, audience) =>
    diffCanonicalJson(
      adapter.projectAudience(before, audience),
      adapter.projectAudience(after, audience),
    ),
  approvalPolicy: [
    { key: 'pm', role: 'PM', scope: 'INTERNAL', required: true },
    {
      key: 'client',
      role: 'CLIENT_STAKEHOLDER',
      scope: 'EXTERNAL_BINDING',
      required: true,
    },
  ],
};

function envelope(
  actorId: string,
  workspaceId: string,
  projectId: string,
  artifactId: string,
  expectedRevision: number,
) {
  return {
    schemaVersion: '1' as const,
    actorId,
    workspaceId,
    projectId,
    artifactId,
    expectedRevision,
    idempotencyKey: uuidv7(),
    correlationId: uuidv7(),
  };
}

async function setup(pool: DatabasePool) {
  const workspaceId = uuidv7();
  const projectId = uuidv7();
  const clientId = uuidv7();
  const pmId = uuidv7();
  const clientOneId = uuidv7();
  const clientTwoId = uuidv7();
  const outsiderId = uuidv7();
  for (const [id, email] of [
    [pmId, 'pm@example.test'],
    [clientOneId, 'client-one@example.test'],
    [clientTwoId, 'client-two@example.test'],
    [outsiderId, 'outsider@example.test'],
  ]) {
    await pool.query(
      `insert into auth_users (id, name, email, email_verified)
       values ($1, $2, $3, true)`,
      [id, email.split('@')[0], email],
    );
  }
  await pool.query(
    `insert into workspaces
      (id, name, default_working_hours, created_by)
     values ($1, 'Artifact kernel tests', '{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}', $2)`,
    [workspaceId, pmId],
  );
  for (const userId of [pmId, clientOneId, clientTwoId]) {
    await pool.query(
      `insert into workspace_memberships
        (workspace_id, user_id, role, state, activated_at)
       values ($1, $2, 'MEMBER', 'ACTIVE', now())`,
      [workspaceId, userId],
    );
  }
  await pool.query(
    `insert into clients
      (id, workspace_id, name, primary_contact_name, primary_contact_email,
       state, created_by)
     values ($1, $2, 'Test client', 'Test owner', 'owner@example.test', 'ACTIVE', $3)`,
    [clientId, workspaceId, pmId],
  );
  await pool.query(
    `insert into projects
      (id, workspace_id, client_id, type, lifecycle_state, name, short_description,
       target_start, target_end, created_by)
     values ($1, $2, $3, 'EXTERNAL', 'PLANNING', 'Artifact test project',
             'Synthetic artifact lifecycle validation.', '2026-08-01', '2026-10-31', $4)`,
    [projectId, workspaceId, clientId, pmId],
  );
  for (const [userId, role] of [
    [pmId, 'PM'],
    [clientOneId, 'CLIENT_STAKEHOLDER'],
    [clientTwoId, 'CLIENT_STAKEHOLDER'],
  ]) {
    await pool.query(
      `insert into project_memberships
        (workspace_id, project_id, user_id, client_id, state, activated_by, activated_at)
       values ($1, $2, $3, $4, 'ACTIVE', $5, now())`,
      [workspaceId, projectId, userId, role === 'CLIENT_STAKEHOLDER' ? clientId : null, pmId],
    );
    await pool.query(
      `insert into project_membership_roles
        (workspace_id, project_id, user_id, role, assigned_by)
       values ($1, $2, $3, $4, $5)`,
      [workspaceId, projectId, userId, role, pmId],
    );
  }
  const registry = new ArtifactKindRegistry();
  registry.register(adapter);
  return {
    workspaceId,
    projectId,
    pmId,
    clientOneId,
    clientTwoId,
    outsiderId,
    store: new PostgresArtifactStore(pool, registry),
  };
}

function body(version: string): TestBody {
  return {
    title: `Requirement ${version}`,
    sections: [
      { id: 'shared', text: `Client text ${version}`, audience: 'CLIENT_VISIBLE' },
      { id: 'private', text: `Team secret ${version}`, audience: 'TEAM_ONLY' },
    ],
  };
}

async function createArtifact(
  store: PostgresArtifactStore,
  setupResult: Awaited<ReturnType<typeof setup>>,
) {
  const artifactId = uuidv7();
  const command = createArtifactCommandSchema.parse({
    ...envelope(setupResult.pmId, setupResult.workspaceId, setupResult.projectId, artifactId, 0),
    draftRevisionId: uuidv7(),
    audienceRecordId: uuidv7(),
    command: {
      kind: adapter.kind,
      schemaVersion: adapter.schemaVersion,
      policyVersion: adapter.policyVersion,
      title: 'Kernel test requirement',
      audience: 'CLIENT_VISIBLE',
      body: body('one'),
    },
  });
  const first = await store.createArtifact(command);
  const replay = await store.createArtifact(command);
  expect(replay).toMatchObject({ artifactId, revision: 1, replayed: true });
  return { artifactId, result: first };
}

describe('Shared Artifact Kernel PostgreSQL lifecycle', () => {
  it('freezes snapshots, rejects stale writers, and resubmits to a new snapshot', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const { artifactId } = await createArtifact(context.store, context);
      const firstSave = await context.store.saveDraftRevision(
        saveDraftRevisionCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 1),
          draftRevisionId: uuidv7(),
          command: { schemaVersion: '1', body: body('two') },
        }),
      );
      await expect(
        context.store.saveDraftRevision(
          saveDraftRevisionCommandSchema.parse({
            ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 1),
            draftRevisionId: uuidv7(),
            command: { schemaVersion: '1', body: body('stale') },
          }),
        ),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });

      const firstRequestId = uuidv7();
      const firstSnapshotId = uuidv7();
      const submitted = await context.store.submitForReview(
        submitArtifactForReviewCommandSchema.parse({
          ...envelope(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
            firstSave.revision,
          ),
          snapshotId: firstSnapshotId,
          approvalRequestId: firstRequestId,
          command: {},
        }),
      );
      const frozen = await context.store.getReviewSnapshot(
        context.pmId,
        context.workspaceId,
        context.projectId,
        artifactId,
        firstSnapshotId,
      );
      await expect(
        context.store.saveDraftRevision(
          saveDraftRevisionCommandSchema.parse({
            ...envelope(
              context.pmId,
              context.workspaceId,
              context.projectId,
              artifactId,
              submitted.revision,
            ),
            draftRevisionId: uuidv7(),
            command: { schemaVersion: '1', body: body('while-reviewing') },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      const rejected = await context.store.decideApproval(
        decideArtifactApprovalCommandSchema.parse({
          ...envelope(
            context.clientOneId,
            context.workspaceId,
            context.projectId,
            artifactId,
            submitted.revision,
          ),
          requestId: firstRequestId,
          decisionId: uuidv7(),
          baselineId: null,
          command: { slotKey: 'client', decision: 'REJECT', comment: 'Please revise scope.' },
        }),
      );
      const nextDraft = await context.store.saveDraftRevision(
        saveDraftRevisionCommandSchema.parse({
          ...envelope(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
            rejected.revision,
          ),
          draftRevisionId: uuidv7(),
          command: { schemaVersion: '1', body: body('three') },
        }),
      );
      const secondSnapshotId = uuidv7();
      const resubmitted = await context.store.submitForReview(
        submitArtifactForReviewCommandSchema.parse({
          ...envelope(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
            nextDraft.revision,
          ),
          snapshotId: secondSnapshotId,
          approvalRequestId: uuidv7(),
          command: {},
        }),
      );
      const frozenAgain = await context.store.getReviewSnapshot(
        context.pmId,
        context.workspaceId,
        context.projectId,
        artifactId,
        firstSnapshotId,
      );
      expect(frozenAgain).toEqual(frozen);
      expect(secondSnapshotId).not.toBe(firstSnapshotId);
      expect(resubmitted.snapshotId).toBe(secondSnapshotId);
      await expect(
        pool.query(`update artifact_review_snapshots set body_json = '{}' where id = $1`, [
          firstSnapshotId,
        ]),
      ).rejects.toThrow(/immutable artifact record/);
    });
  });

  it('serializes first-binding external decisions and allocates immutable baselines', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const { artifactId } = await createArtifact(context.store, context);
      const requestId = uuidv7();
      const submitted = await context.store.submitForReview(
        submitArtifactForReviewCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 1),
          snapshotId: uuidv7(),
          approvalRequestId: requestId,
          command: {},
        }),
      );
      const pmApproved = await context.store.decideApproval(
        decideArtifactApprovalCommandSchema.parse({
          ...envelope(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
            submitted.revision,
          ),
          requestId,
          decisionId: uuidv7(),
          baselineId: null,
          command: { slotKey: 'pm', decision: 'APPROVE', comment: null },
        }),
      );
      const raceRevision = pmApproved.revision;
      const approve = context.store.decideApproval(
        decideArtifactApprovalCommandSchema.parse({
          ...envelope(
            context.clientOneId,
            context.workspaceId,
            context.projectId,
            artifactId,
            raceRevision,
          ),
          requestId,
          decisionId: uuidv7(),
          baselineId: uuidv7(),
          command: { slotKey: 'client', decision: 'APPROVE', comment: null },
        }),
      );
      const reject = context.store.decideApproval(
        decideArtifactApprovalCommandSchema.parse({
          ...envelope(
            context.clientTwoId,
            context.workspaceId,
            context.projectId,
            artifactId,
            raceRevision,
          ),
          requestId,
          decisionId: uuidv7(),
          baselineId: null,
          command: { slotKey: 'client', decision: 'REJECT', comment: 'Binding rejection.' },
        }),
      );
      const outcomes = await Promise.allSettled([approve, reject]);
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      const bindingCount = await pool.query<{ count: string }>(
        `select count(*)::text as count from artifact_approval_decisions
          where request_id = $1 and scope = 'EXTERNAL_BINDING'`,
        [requestId],
      );
      expect(bindingCount.rows[0]?.count).toBe('1');

      const finalArtifact = await context.store.getArtifact(
        context.pmId,
        context.workspaceId,
        context.projectId,
        artifactId,
      );
      if (finalArtifact.state === 'APPROVED') {
        const baseline = (
          await context.store.listBaselines(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
          )
        )[0];
        expect(baseline?.displayNumber).toBe('1.0');
        await expect(
          pool.query(`update artifact_baselines set content_hash = repeat('0', 64) where id = $1`, [
            baseline?.id,
          ]),
        ).rejects.toThrow(/immutable artifact baseline/);
      }
    });
  });

  it('creates a monotonically numbered successor baseline through a Delta', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const { artifactId } = await createArtifact(context.store, context);

      async function approve(revision: number) {
        const requestId = uuidv7();
        const submitted = await context.store.submitForReview(
          submitArtifactForReviewCommandSchema.parse({
            ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, revision),
            snapshotId: uuidv7(),
            approvalRequestId: requestId,
            command: {},
          }),
        );
        const internal = await context.store.decideApproval(
          decideArtifactApprovalCommandSchema.parse({
            ...envelope(
              context.pmId,
              context.workspaceId,
              context.projectId,
              artifactId,
              submitted.revision,
            ),
            requestId,
            decisionId: uuidv7(),
            baselineId: null,
            command: { slotKey: 'pm', decision: 'APPROVE', comment: null },
          }),
        );
        return context.store.decideApproval(
          decideArtifactApprovalCommandSchema.parse({
            ...envelope(
              context.clientOneId,
              context.workspaceId,
              context.projectId,
              artifactId,
              internal.revision,
            ),
            requestId,
            decisionId: uuidv7(),
            baselineId: uuidv7(),
            command: { slotKey: 'client', decision: 'APPROVE', comment: null },
          }),
        );
      }

      const first = await approve(1);
      expect(first.baselineNumber).toBe('1.0');
      const clientProjection = await context.store.getAuthoritativeContext(
        context.clientOneId,
        context.workspaceId,
        context.projectId,
        artifactId,
      );
      expect(JSON.stringify(clientProjection.body)).toContain('Client text one');
      expect(JSON.stringify(clientProjection.body)).not.toContain('Team secret');
      const searchProjection = await context.store.buildSearchProjection(
        context.clientOneId,
        context.workspaceId,
        context.projectId,
        artifactId,
      );
      expect(JSON.stringify(searchProjection)).not.toContain('Team secret');
      const firstBaselineId = first.baselineId;
      if (firstBaselineId === undefined) throw new Error('FIRST_BASELINE_MISSING');
      let renderedExport = '';
      const exportRequest = await context.store.requestExport(
        requestArtifactExportCommandSchema.parse({
          ...envelope(
            context.clientOneId,
            context.workspaceId,
            context.projectId,
            artifactId,
            first.revision,
          ),
          targetType: 'BASELINE',
          targetId: firstBaselineId,
          exportId: uuidv7(),
          command: { format: 'JSON' },
        }),
      );
      const exportId = exportRequest.exportId;
      if (exportId === undefined) throw new Error('EXPORT_ID_MISSING');
      expect(
        await context.store.renderExport(exportId, {
          putImmutable(input) {
            renderedExport = new TextDecoder().decode(input.body);
            return Promise.resolve();
          },
        }),
      ).toBe(true);
      expect(renderedExport).toContain('Client text one');
      expect(renderedExport).not.toContain('Team secret');
      expect(
        (
          await context.store.getExportStatus(
            context.clientOneId,
            context.workspaceId,
            context.projectId,
            artifactId,
            exportId,
          )
        ).state,
      ).toBe('READY');
      const delta = await context.store.createDelta(
        createArtifactDeltaCommandSchema.parse({
          ...envelope(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
            exportRequest.revision,
          ),
          deltaId: uuidv7(),
          draftRevisionId: uuidv7(),
          command: { rationale: 'Approved scope changed.' },
        }),
      );
      const saved = await context.store.saveDraftRevision(
        saveDraftRevisionCommandSchema.parse({
          ...envelope(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
            delta.revision,
          ),
          draftRevisionId: uuidv7(),
          command: { schemaVersion: '1', body: body('successor') },
        }),
      );
      const second = await approve(saved.revision);
      expect(second.baselineNumber).toBe('2.0');
      expect(
        (
          await context.store.listBaselines(
            context.pmId,
            context.workspaceId,
            context.projectId,
            artifactId,
          )
        ).map((baseline) => [baseline.displayNumber, baseline.state]),
      ).toEqual([
        ['2.0', 'CURRENT'],
        ['1.0', 'SUPERSEDED'],
      ]);
    });
  });

  it('filters Team-only children and foreign-workspace identifiers before projection', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const { artifactId } = await createArtifact(context.store, context);
      const targetId = (
        await context.store.getDraft(
          context.pmId,
          context.workspaceId,
          context.projectId,
          artifactId,
        )
      ).id;
      const teamComment = await context.store.createComment(
        createArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 1),
          targetType: 'DRAFT_REVISION',
          targetId,
          commentId: uuidv7(),
          audienceRecordId: uuidv7(),
          command: { body: 'Internal risk note.', audience: 'TEAM_ONLY', mentionUserIds: [] },
        }),
      );
      const attachment = await context.store.registerAttachment(
        registerArtifactAttachmentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 2),
          targetType: 'DRAFT_REVISION',
          targetId,
          attachmentId: uuidv7(),
          audienceRecordId: uuidv7(),
          command: {
            displayName: 'internal.txt',
            mediaType: 'text/plain',
            byteSize: 12,
            audience: 'TEAM_ONLY',
            objectReference: 'future-m3-object-reference',
          },
        }),
      );
      await pool.query(`update artifact_attachments set state = 'AVAILABLE' where id = $1`, [
        attachment.id,
      ]);
      expect(
        await context.store.listComments(
          context.clientOneId,
          context.workspaceId,
          context.projectId,
          artifactId,
          targetId,
        ),
      ).toEqual([]);
      expect(
        await context.store.listAttachments(
          context.clientOneId,
          context.workspaceId,
          context.projectId,
          artifactId,
          targetId,
        ),
      ).toEqual([]);
      expect(
        await context.store.listComments(
          context.pmId,
          context.workspaceId,
          context.projectId,
          artifactId,
          targetId,
        ),
      ).toMatchObject([{ id: teamComment.id, body: 'Internal risk note.' }]);
      const editCommand = mutateArtifactCommentCommandSchema.parse({
        ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 3),
        commentId: teamComment.id,
        expectedCommentRevision: 1,
        command: { action: 'EDIT', body: 'Updated internal risk note.', mentionUserIds: [] },
      });
      const edited = await context.store.mutateComment(editCommand);
      expect(await context.store.mutateComment(editCommand)).toEqual(edited);
      await expect(
        context.store.mutateComment(
          mutateArtifactCommentCommandSchema.parse({
            ...envelope(context.clientOneId, context.workspaceId, context.projectId, artifactId, 4),
            commentId: teamComment.id,
            expectedCommentRevision: edited.revision,
            command: { action: 'EDIT', body: 'Attempted disclosure.', mentionUserIds: [] },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        context.store.mutateComment(
          mutateArtifactCommentCommandSchema.parse({
            ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 4),
            commentId: teamComment.id,
            expectedCommentRevision: 1,
            command: { action: 'EDIT', body: 'Stale edit.', mentionUserIds: [] },
          }),
        ),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
      const resolved = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 4),
          commentId: teamComment.id,
          expectedCommentRevision: edited.revision,
          command: { action: 'RESOLVE' },
        }),
      );
      const reopened = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 5),
          commentId: teamComment.id,
          expectedCommentRevision: resolved.revision,
          command: { action: 'REOPEN' },
        }),
      );
      const removedComment = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 6),
          commentId: teamComment.id,
          expectedCommentRevision: reopened.revision,
          command: { action: 'REMOVE', reason: 'No longer relevant.' },
        }),
      );
      expect(removedComment).toMatchObject({ body: null, state: 'REMOVED', revision: 5 });
      const removeAttachmentCommand = removeArtifactAttachmentCommandSchema.parse({
        ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 7),
        attachmentId: attachment.id,
        expectedAttachmentRevision: 1,
        command: { reason: 'Reference retired.' },
      });
      const removedAttachment = await context.store.removeAttachment(removeAttachmentCommand);
      expect(removedAttachment).toMatchObject({ state: 'REMOVED', revision: 2 });
      expect(await context.store.removeAttachment(removeAttachmentCommand)).toEqual(
        removedAttachment,
      );
      await expect(
        context.store.removeAttachment(
          removeArtifactAttachmentCommandSchema.parse({
            ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 8),
            attachmentId: attachment.id,
            expectedAttachmentRevision: 2,
            command: { reason: 'Repeated removal.' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        context.store.mutateComment(
          mutateArtifactCommentCommandSchema.parse({
            ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 8),
            commentId: teamComment.id,
            expectedCommentRevision: removedComment.revision,
            command: { action: 'REOPEN' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

      const clientComment = await context.store.createComment(
        createArtifactCommentCommandSchema.parse({
          ...envelope(context.clientOneId, context.workspaceId, context.projectId, artifactId, 8),
          targetType: 'DRAFT_REVISION',
          targetId,
          commentId: uuidv7(),
          audienceRecordId: uuidv7(),
          command: {
            body: 'Client-visible question.',
            audience: 'CLIENT_VISIBLE',
            mentionUserIds: [],
          },
        }),
      );
      const clientEdited = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.clientOneId, context.workspaceId, context.projectId, artifactId, 9),
          commentId: clientComment.id,
          expectedCommentRevision: 1,
          command: {
            action: 'EDIT',
            body: 'Updated client-visible question.',
            mentionUserIds: [context.clientTwoId],
          },
        }),
      );
      await expect(
        context.store.mutateComment(
          mutateArtifactCommentCommandSchema.parse({
            ...envelope(
              context.clientOneId,
              context.workspaceId,
              context.projectId,
              artifactId,
              10,
            ),
            commentId: clientComment.id,
            expectedCommentRevision: clientEdited.revision,
            command: { action: 'RESOLVE' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const clientResolved = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 10),
          commentId: clientComment.id,
          expectedCommentRevision: clientEdited.revision,
          command: { action: 'RESOLVE' },
        }),
      );
      await expect(
        context.store.mutateComment(
          mutateArtifactCommentCommandSchema.parse({
            ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 11),
            commentId: clientComment.id,
            expectedCommentRevision: clientResolved.revision,
            command: { action: 'RESOLVE' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      const clientReopened = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 11),
          commentId: clientComment.id,
          expectedCommentRevision: clientResolved.revision,
          command: { action: 'REOPEN' },
        }),
      );
      const moderated = await context.store.mutateComment(
        mutateArtifactCommentCommandSchema.parse({
          ...envelope(context.pmId, context.workspaceId, context.projectId, artifactId, 12),
          commentId: clientComment.id,
          expectedCommentRevision: clientReopened.revision,
          command: {
            action: 'EDIT',
            body: 'PM-moderated client-visible question.',
            mentionUserIds: [],
          },
        }),
      );
      expect(moderated.body).toBe('PM-moderated client-visible question.');
      expect(
        await context.store.listAttachments(
          context.pmId,
          context.workspaceId,
          context.projectId,
          artifactId,
          targetId,
        ),
      ).toEqual([]);
      await expect(
        context.store.getArtifact(
          context.outsiderId,
          context.workspaceId,
          context.projectId,
          artifactId,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
