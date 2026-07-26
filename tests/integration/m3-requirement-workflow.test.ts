import {
  createArtifactCommandSchema,
  submitArtifactForReviewCommandSchema,
} from '@delivery-os/contracts';
import {
  PostgresArtifactStore,
  PostgresDocumentJobRepository,
  PostgresRequirementStore,
  type DatabasePool,
} from '@delivery-os/database';
import {
  ArtifactKindRegistry,
  REQUIREMENT_TEMPLATE_FIELDS,
  createRequirementArtifactAdapter,
} from '@delivery-os/domain';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { migrateDatabase, withTemporaryDatabase } from '../helpers/database';

async function fixture(pool: DatabasePool) {
  const ids = {
    workspaceId: uuidv7(),
    projectId: uuidv7(),
    clientId: uuidv7(),
    pmId: uuidv7(),
    clientUserId: uuidv7(),
  };
  for (const [id, email] of [
    [ids.pmId, 'requirement-pm@example.test'],
    [ids.clientUserId, 'requirement-client@example.test'],
  ]) {
    await pool.query(
      `insert into auth_users (id, name, email, email_verified) values ($1, 'Synthetic', $2, true)`,
      [id, email],
    );
  }
  await pool.query(
    `insert into workspaces (id, name, default_working_hours, created_by)
     values ($1, 'Synthetic Requirement workspace',
             '{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}', $2)`,
    [ids.workspaceId, ids.pmId],
  );
  await pool.query(
    `insert into workspace_memberships (workspace_id, user_id, role, state)
     values ($1, $2, 'ADMIN', 'ACTIVE'), ($1, $3, 'MEMBER', 'ACTIVE')`,
    [ids.workspaceId, ids.pmId, ids.clientUserId],
  );
  await pool.query(
    `insert into clients
      (id, workspace_id, name, primary_contact_name, primary_contact_email, state, created_by)
     values ($1, $2, 'Synthetic Client', 'Synthetic Owner', 'owner@example.test', 'ACTIVE', $3)`,
    [ids.clientId, ids.workspaceId, ids.pmId],
  );
  await pool.query(
    `insert into projects
      (id, workspace_id, client_id, type, lifecycle_state, name, short_description,
       target_start, target_end, created_by)
     values ($1, $2, $3, 'EXTERNAL', 'INTAKE', 'Synthetic Requirement project',
             'No real content.', '2026-08-01', '2026-09-01', $4)`,
    [ids.projectId, ids.workspaceId, ids.clientId, ids.pmId],
  );
  for (const [userId, role] of [
    [ids.pmId, 'PM'],
    [ids.clientUserId, 'CLIENT_STAKEHOLDER'],
  ]) {
    await pool.query(
      `insert into project_memberships
        (workspace_id, project_id, user_id, client_id, state, activated_by, activated_at)
       values ($1, $2, $3, $4, 'ACTIVE', $5, now())`,
      [
        ids.workspaceId,
        ids.projectId,
        userId,
        role === 'CLIENT_STAKEHOLDER' ? ids.clientId : null,
        ids.pmId,
      ],
    );
    await pool.query(
      `insert into project_membership_roles
        (workspace_id, project_id, user_id, role, assigned_by)
       values ($1, $2, $3, $4, $5)`,
      [ids.workspaceId, ids.projectId, userId, role, ids.pmId],
    );
  }
  return ids;
}

describe('M3 manual Requirement and frozen readiness', () => {
  it('publishes a constrained template, freezes it per project, and binds readiness atomically', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const ids = await fixture(pool);
      const requirementStore = new PostgresRequirementStore(pool);
      const templateVersionId = uuidv7();
      const published = await requirementStore.publishTemplate({
        workspaceId: ids.workspaceId,
        actorId: ids.pmId,
        templateVersionId,
        expectedRevision: 0,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        extension: {
          schemaVersion: '1',
          baseTemplateVersion: '1',
          optionalFields: [],
          applicabilityOverrides: {},
        },
      });
      const templateSnapshotId = uuidv7();
      const snapshot = await requirementStore.snapshotTemplate({
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        actorId: ids.pmId,
        snapshotId: templateSnapshotId,
        templateVersionId,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
      });
      expect(snapshot.fields).toHaveLength(REQUIREMENT_TEMPLATE_FIELDS.length);

      await expect(
        pool.query(
          `update project_requirement_template_snapshots set template_hash = $2 where id = $1`,
          [templateSnapshotId, '0'.repeat(64)],
        ),
      ).rejects.toThrow(/immutable/u);

      const registry = new ArtifactKindRegistry();
      registry.register(createRequirementArtifactAdapter({ externalProject: false }));
      const artifactStore = new PostgresArtifactStore(pool, registry);
      const artifactId = uuidv7();
      const body = {
        templateSnapshotId,
        templateHash: published.templateHash,
        fields: REQUIREMENT_TEMPLATE_FIELDS.map((field, index) => ({
          key: field.key,
          value: field.key === 'project_type' ? 'EXTERNAL' : `Synthetic value ${index + 1}`,
          state: 'RESOLVED' as const,
          audience:
            field.key === 'known_risks' ? ('TEAM_ONLY' as const) : ('CLIENT_VISIBLE' as const),
          citationIds: [],
          humanNote: null,
          riskOwnerId: null,
          riskReviewDate: null,
        })),
      };
      const created = await artifactStore.createArtifact(
        createArtifactCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          expectedRevision: 0,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          draftRevisionId: uuidv7(),
          audienceRecordId: uuidv7(),
          command: {
            kind: 'REQUIREMENT',
            schemaVersion: '1',
            policyVersion: '1',
            title: 'Synthetic Requirement',
            audience: 'CLIENT_VISIBLE',
            body,
          },
        }),
      );
      const snapshotId = uuidv7();
      const requestId = uuidv7();
      await artifactStore.submitForReview(
        submitArtifactForReviewCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          expectedRevision: created.revision,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          snapshotId,
          approvalRequestId: requestId,
          command: {},
        }),
      );
      const frozen = await pool.query<{
        review_snapshot_id: string;
        body_hash: string;
        template_hash: string;
        required_slots: { scope: string }[];
      }>(
        `select readiness.review_snapshot_id, readiness.body_hash, readiness.template_hash,
                request.required_slots
           from requirement_readiness_snapshots readiness
           join artifact_approval_requests request on request.snapshot_id = readiness.review_snapshot_id
          where readiness.review_snapshot_id = $1`,
        [snapshotId],
      );
      expect(frozen.rows[0]).toMatchObject({
        review_snapshot_id: snapshotId,
        template_hash: published.templateHash,
      });
      expect(frozen.rows[0]?.required_slots.map((slot) => slot.scope)).toEqual([
        'INTERNAL',
        'EXTERNAL_BINDING',
      ]);
      const clientSnapshot = await artifactStore.getReviewSnapshot(
        ids.clientUserId,
        ids.workspaceId,
        ids.projectId,
        artifactId,
        snapshotId,
      );
      expect(JSON.stringify(clientSnapshot.body)).not.toContain('known_risks');
    });
  });

  it('blocks review on an unresolved mandatory field without creating a partial snapshot', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const ids = await fixture(pool);
      const requirementStore = new PostgresRequirementStore(pool);
      const versionId = uuidv7();
      const published = await requirementStore.publishTemplate({
        workspaceId: ids.workspaceId,
        actorId: ids.pmId,
        templateVersionId: versionId,
        expectedRevision: 0,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        extension: {
          schemaVersion: '1',
          baseTemplateVersion: '1',
          optionalFields: [],
          applicabilityOverrides: {},
        },
      });
      const snapshotId = uuidv7();
      await requirementStore.snapshotTemplate({
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        actorId: ids.pmId,
        snapshotId,
        templateVersionId: versionId,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
      });
      const registry = new ArtifactKindRegistry();
      registry.register(createRequirementArtifactAdapter({ externalProject: false }));
      const store = new PostgresArtifactStore(pool, registry);
      const artifactId = uuidv7();
      const created = await store.createArtifact(
        createArtifactCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          expectedRevision: 0,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          draftRevisionId: uuidv7(),
          audienceRecordId: uuidv7(),
          command: {
            kind: 'REQUIREMENT',
            schemaVersion: '1',
            policyVersion: '1',
            title: 'Incomplete synthetic Requirement',
            audience: 'TEAM_ONLY',
            body: {
              templateSnapshotId: snapshotId,
              templateHash: published.templateHash,
              fields: [],
            },
          },
        }),
      );
      const reviewSnapshotId = uuidv7();
      await expect(
        store.submitForReview(
          submitArtifactForReviewCommandSchema.parse({
            schemaVersion: '1',
            workspaceId: ids.workspaceId,
            projectId: ids.projectId,
            artifactId,
            actorId: ids.pmId,
            expectedRevision: created.revision,
            idempotencyKey: uuidv7(),
            correlationId: uuidv7(),
            snapshotId: reviewSnapshotId,
            approvalRequestId: uuidv7(),
            command: {},
          }),
        ),
      ).rejects.toMatchObject({ code: 'READINESS_FAILED' });
      const partial = await pool.query(
        `select 1 from artifact_review_snapshots where id = $1
         union all select 1 from requirement_readiness_snapshots where review_snapshot_id = $1`,
        [reviewSnapshotId],
      );
      expect(partial.rowCount).toBe(0);
    });
  });

  it('deduplicates and exclusively claims at-least-once document jobs', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const ids = await fixture(pool);
      const jobs = new PostgresDocumentJobRepository(pool);
      const input = {
        id: uuidv7(),
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        sourceArtifactId: null,
        sourceGenerationId: null,
        intakeSetId: null,
        jobType: 'EXTRACT' as const,
        inputHash: 'a'.repeat(64),
        configVersion: 'deterministic-fake-v1',
        correlationId: uuidv7(),
      };
      expect(await jobs.enqueue(input)).toEqual({ id: input.id, replayed: false });
      expect(await jobs.enqueue({ ...input, id: uuidv7() })).toEqual({
        id: input.id,
        replayed: true,
      });
      const claims = await Promise.all([
        jobs.claim('worker-a', ['EXTRACT']),
        jobs.claim('worker-b', ['EXTRACT']),
      ]);
      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
      const claim = claims.find((item) => item !== null);
      if (claim === undefined) throw new Error('EXPECTED_DOCUMENT_JOB_CLAIM');
      await jobs.fail(claim, {
        safeErrorCode: 'DEPENDENCY_UNAVAILABLE',
        retryable: true,
        retryDelaySeconds: 0,
      });
      const retry = await jobs.claim('worker-c', ['EXTRACT']);
      expect(retry?.attemptNumber).toBe(2);
      if (retry === null) throw new Error('EXPECTED_DOCUMENT_JOB_RETRY');
      await jobs.complete(retry);
      const state = await pool.query<{ state: string; attempts: number }>(
        `select state, attempt_count as attempts from document_jobs where id = $1`,
        [input.id],
      );
      expect(state.rows[0]).toEqual({ state: 'SUCCEEDED', attempts: 2 });
    });
  });
});
