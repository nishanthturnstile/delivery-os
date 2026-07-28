import {
  createArtifactCommandSchema,
  submitArtifactForReviewCommandSchema,
} from '@delivery-os/contracts';
import {
  AiProvenanceCipher,
  PostgresArtifactStore,
  PostgresAiWorkflowStore,
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
  it('enforces template administration, optimistic concurrency, and idempotent snapshots', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const ids = await fixture(pool);
      const store = new PostgresRequirementStore(pool);
      const publish = {
        workspaceId: ids.workspaceId,
        actorId: ids.pmId,
        templateVersionId: uuidv7(),
        expectedRevision: 0,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        extension: {
          schemaVersion: '1' as const,
          baseTemplateVersion: '1' as const,
          optionalFields: [],
          applicabilityOverrides: {},
        },
      };
      const first = await store.publishTemplate(publish);
      await expect(store.publishTemplate(publish)).resolves.toEqual(first);
      await expect(
        store.publishTemplate({
          ...publish,
          templateVersionId: uuidv7(),
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      await expect(
        store.publishTemplate({
          ...publish,
          templateVersionId: uuidv7(),
          idempotencyKey: uuidv7(),
        }),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
      await expect(
        store.publishTemplate({
          ...publish,
          actorId: ids.clientUserId,
          expectedRevision: 1,
          templateVersionId: uuidv7(),
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const second = await store.publishTemplate({
        ...publish,
        expectedRevision: 1,
        templateVersionId: uuidv7(),
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
        extension: {
          schemaVersion: '1',
          baseTemplateVersion: '1',
          optionalFields: [
            {
              key: 'workspace_note',
              section: 'H',
              order: 99,
              label: 'Workspace note',
              description: 'Synthetic optional note.',
              valueType: 'long_text',
              mandatory: false,
              acceptedRiskAllowed: true,
              citationExpected: false,
              applicability: null,
              configurableApplicability: false,
              system: false,
            },
          ],
          applicabilityOverrides: {},
        },
      });
      expect(second.version).toBe(2);

      const snapshot = {
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        actorId: ids.pmId,
        snapshotId: uuidv7(),
        templateVersionId: first.id,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
      };
      const frozen = await store.snapshotTemplate(snapshot);
      await expect(store.snapshotTemplate(snapshot)).resolves.toEqual(frozen);
      await expect(
        store.snapshotTemplate({
          ...snapshot,
          snapshotId: uuidv7(),
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).resolves.toEqual(frozen);
      await expect(
        store.snapshotTemplate({
          ...snapshot,
          templateVersionId: uuidv7(),
          snapshotId: uuidv7(),
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

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

  it('binds immutable intake sets to one Requirement and prevents cross-artifact audience leakage', async () => {
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
      await requirementStore.snapshotTemplate({
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        actorId: ids.pmId,
        snapshotId: templateSnapshotId,
        templateVersionId,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
      });
      const registry = new ArtifactKindRegistry();
      registry.register(createRequirementArtifactAdapter({ externalProject: false }));
      const artifactStore = new PostgresArtifactStore(pool, registry);
      const artifactId = uuidv7();
      await artifactStore.createArtifact(
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
            body: {
              templateSnapshotId,
              templateHash: published.templateHash,
              fields: [],
            },
          },
        }),
      );

      const evidence: {
        sourceGenerationId: string;
        locatorId: string;
        blockId: string;
        audience: 'CLIENT_VISIBLE' | 'TEAM_ONLY';
      }[] = [];
      for (const [index, audience] of (['CLIENT_VISIBLE', 'TEAM_ONLY'] as const).entries()) {
        const sourceArtifactId = uuidv7();
        const sourceGenerationId = uuidv7();
        const normalizedDocumentId = uuidv7();
        const locatorId = uuidv7();
        const blockId = uuidv7();
        await pool.query(
          `insert into source_artifacts
            (id, workspace_id, project_id, current_generation_id, display_name, format,
             audience, processing_state, uploaded_by)
           values ($1, $2, $3, $4, $5, 'TEXT', $6, 'SUCCEEDED', $7)`,
          [
            sourceArtifactId,
            ids.workspaceId,
            ids.projectId,
            sourceGenerationId,
            `synthetic-${index + 1}.txt`,
            audience,
            ids.pmId,
          ],
        );
        await pool.query(
          `insert into source_generations
            (id, workspace_id, project_id, source_artifact_id, generation_number,
             declared_media_type, detected_media_type, declared_byte_size, actual_byte_size,
             expected_sha256, actual_sha256)
           values ($1, $2, $3, $4, 1, 'text/plain', 'text/plain', 16, 16, $5, $5)`,
          [
            sourceGenerationId,
            ids.workspaceId,
            ids.projectId,
            sourceArtifactId,
            `${index + 1}`.repeat(64),
          ],
        );
        await pool.query(
          `insert into normalized_documents
            (id, workspace_id, project_id, source_artifact_id, source_generation_id,
             parser_version, renderer_version, ocr_config_version, source_sha256,
             document_hash, block_count)
           values ($1, $2, $3, $4, $5, 'text@1', 'none', 'none', $6, $7, 1)`,
          [
            normalizedDocumentId,
            ids.workspaceId,
            ids.projectId,
            sourceArtifactId,
            sourceGenerationId,
            `${index + 1}`.repeat(64),
            `${index + 3}`.repeat(64),
          ],
        );
        await pool.query(
          `insert into source_locators
            (id, workspace_id, project_id, source_artifact_id, source_generation_id,
             normalized_document_id, format, locator_json, locator_hash, audience)
           values ($1, $2, $3, $4, $5, $6, 'TEXT', $7::jsonb, $8, $9)`,
          [
            locatorId,
            ids.workspaceId,
            ids.projectId,
            sourceArtifactId,
            sourceGenerationId,
            normalizedDocumentId,
            JSON.stringify({ kind: 'TEXT_LINES', startLine: 1, endLine: 1 }),
            `${index + 5}`.repeat(64),
            audience,
          ],
        );
        await pool.query(
          `insert into normalized_blocks
            (id, workspace_id, project_id, source_artifact_id, source_generation_id,
             normalized_document_id, source_locator_id, ordinal, block_key, kind, text,
             extraction, audience)
           values ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'PARAGRAPH',
                   $9, 'EMBEDDED_TEXT', $10)`,
          [
            blockId,
            ids.workspaceId,
            ids.projectId,
            sourceArtifactId,
            sourceGenerationId,
            normalizedDocumentId,
            locatorId,
            `${index + 7}`.repeat(64),
            `Synthetic evidence ${index + 1}`,
            audience,
          ],
        );
        evidence.push({ sourceGenerationId, locatorId, blockId, audience });
      }

      const intakeSetId = uuidv7();
      const citationIds = [uuidv7(), uuidv7()];
      const claimIds: string[] = [];
      await requirementStore.createIntakeSet({
        id: intakeSetId,
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        artifactId,
        actorId: ids.pmId,
        expectedRevision: 1,
        sourceGenerationIds: evidence.map((item) => item.sourceGenerationId),
        extractionJobId: uuidv7(),
        workflowConfigHash: 'f'.repeat(64),
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
      });
      for (const [index, item] of evidence.entries()) {
        await requirementStore.createCitation({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          actorId: ids.pmId,
          citationId: citationIds[index] ?? uuidv7(),
          sourceGenerationId: item.sourceGenerationId,
          locatorId: item.locatorId,
          blockIds: [item.blockId],
          locatorExcerptHash: (index === 0 ? 'a' : 'b').repeat(64),
          audience: 'CLIENT_VISIBLE',
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        });
        const claim = await requirementStore.appendClaim({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          intakeSetId,
          fieldKey: 'project_objectives',
          value: `Synthetic proposal ${index + 1}`,
          citationIds: [citationIds[index] ?? uuidv7()],
          workflowKind: 'FAKE_AI',
          workflowVersion: 'requirement-extraction@1',
          workflowConfigHash: `${index + 1}`.repeat(64),
        });
        expect(claim.audience).toBe(item.audience);
        claimIds.push(claim.id);
      }
      const firstEvidence = evidence[0];
      if (firstEvidence === undefined) throw new Error('EXPECTED_SYNTHETIC_EVIDENCE');
      await expect(
        requirementStore.appendClaim({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          intakeSetId,
          fieldKey: 'project_objectives',
          value: 'Synthetic proposal 1',
          citationIds: [citationIds[0] ?? uuidv7()],
          workflowKind: 'FAKE_AI',
          workflowVersion: 'requirement-extraction@1',
          workflowConfigHash: '1'.repeat(64),
        }),
      ).resolves.toMatchObject({ id: claimIds[0], replayed: true });
      await expect(
        requirementStore.appendClaim({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          intakeSetId,
          fieldKey: 'project_objectives',
          value: 'Unsupported proposal',
          citationIds: [],
          workflowKind: 'FAKE_AI',
          workflowVersion: 'requirement-extraction@1',
          workflowConfigHash: '1'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        requirementStore.createConflict({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          fieldKey: 'project_objectives',
          claimIds: [claimIds[0] ?? uuidv7()],
          severity: 'LOW',
        }),
      ).rejects.toThrow('CONFLICT_REQUIRES_MULTIPLE_CLAIMS');
      await expect(
        requirementStore.createConflict({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          fieldKey: 'unknown_claims',
          claimIds: [uuidv7(), uuidv7()],
          severity: 'LOW',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const conflictId = uuidv7();
      await expect(
        requirementStore.createConflict({
          id: conflictId,
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          fieldKey: 'project_objectives',
          claimIds,
          severity: 'HIGH',
        }),
      ).resolves.toEqual({ id: conflictId, replayed: false });
      await expect(
        requirementStore.createConflict({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          fieldKey: 'project_objectives',
          claimIds,
          severity: 'HIGH',
        }),
      ).resolves.toEqual({ id: conflictId, replayed: true });
      const gapId = uuidv7();
      await expect(
        requirementStore.createGap({
          id: gapId,
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          fieldKey: 'success_metrics',
          reason: 'MISSING',
          blocking: true,
        }),
      ).resolves.toEqual({ id: gapId, replayed: false });
      await expect(
        requirementStore.createGap({
          id: uuidv7(),
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          fieldKey: 'success_metrics',
          reason: 'MISSING',
          blocking: true,
        }),
      ).resolves.toEqual({ id: gapId, replayed: true });
      await expect(
        requirementStore.dispositionClaim({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          expectedRevision: 1,
          claimId: claimIds[0] ?? uuidv7(),
          dispositionId: uuidv7(),
          disposition: 'EDITED',
          editedValue: 'Edited',
          note: null,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).rejects.toThrow('HUMAN_DISPOSITION_NOTE_REQUIRED');
      await expect(
        requirementStore.resolveConflict({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          conflictId,
          resolutionId: uuidv7(),
          expectedArtifactRevision: 1,
          expectedConflictRevision: 1,
          selectedClaimId: null,
          authoredValue: null,
          note: 'Invalid',
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).rejects.toThrow('CONFLICT_RESOLUTION_INVALID');
      await expect(
        requirementStore.dispositionGap({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          gapId,
          dispositionId: uuidv7(),
          expectedArtifactRevision: 1,
          expectedGapRevision: 1,
          disposition: 'ACCEPTED_RISK',
          fieldRevisionId: null,
          justification: 'short',
          riskOwnerId: null,
          riskConsequence: null,
          riskReviewDate: null,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).rejects.toThrow('GAP_DISPOSITION_INVALID');
      const claimDisposition = {
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        artifactId,
        actorId: ids.pmId,
        expectedRevision: 1,
        claimId: claimIds[0] ?? uuidv7(),
        dispositionId: uuidv7(),
        disposition: 'ACCEPTED' as const,
        editedValue: null,
        note: null,
        idempotencyKey: uuidv7(),
        correlationId: uuidv7(),
      };
      await expect(requirementStore.dispositionClaim(claimDisposition)).resolves.toEqual({
        revision: 2,
      });
      await expect(requirementStore.dispositionClaim(claimDisposition)).resolves.toEqual({
        revision: 2,
      });
      await expect(
        requirementStore.resolveConflict({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          conflictId,
          resolutionId: uuidv7(),
          expectedArtifactRevision: 2,
          expectedConflictRevision: 1,
          selectedClaimId: claimIds[0] ?? null,
          authoredValue: null,
          note: 'Selected after reviewing both synthetic citations.',
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).resolves.toEqual({ revision: 3 });
      await expect(
        requirementStore.dispositionGap({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          artifactId,
          actorId: ids.pmId,
          gapId,
          dispositionId: uuidv7(),
          expectedArtifactRevision: 3,
          expectedGapRevision: 1,
          disposition: 'ACCEPTED_RISK',
          fieldRevisionId: null,
          justification: 'Synthetic pilot risk accepted by the accountable human.',
          riskOwnerId: ids.pmId,
          riskConsequence: 'A reviewed adjustment may be required after the pilot.',
          riskReviewDate: '2026-08-26',
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
        }),
      ).resolves.toEqual({ revision: 4 });

      const firstTeamView = await requirementStore.listIntelligence(
        ids.pmId,
        ids.workspaceId,
        ids.projectId,
        artifactId,
      );
      expect(firstTeamView.claims).toHaveLength(2);
      const secondClientView = await requirementStore.listIntelligence(
        ids.clientUserId,
        ids.workspaceId,
        ids.projectId,
        artifactId,
      );
      expect(secondClientView.claims).toHaveLength(1);

      const workflowConfigHash = 'c'.repeat(64);
      const aiStore = new PostgresAiWorkflowStore(
        pool,
        new AiProvenanceCipher(Buffer.alloc(32, 7).toString('base64')),
      );
      await expect(
        aiStore.configureWorkspace({
          workspaceId: ids.workspaceId,
          actorId: ids.clientUserId,
          correlationId: uuidv7(),
          expectedRevision: 0,
          provider: 'openai',
          workflowConfigHash,
          globalEnabled: true,
          requirementExtractionEnabled: true,
          provenanceRetentionDays: 30,
          aggregateQualityMetricsEnabled: true,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        aiStore.configureWorkspace({
          workspaceId: ids.workspaceId,
          actorId: ids.pmId,
          correlationId: uuidv7(),
          expectedRevision: 0,
          provider: 'openai',
          workflowConfigHash,
          globalEnabled: true,
          requirementExtractionEnabled: true,
          provenanceRetentionDays: 30,
          aggregateQualityMetricsEnabled: true,
        }),
      ).resolves.toEqual({ revision: 1 });
      const reservationId = uuidv7();
      const reservation = {
        reservationId,
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        artifactId,
        intakeSetId,
        provider: 'openai' as const,
        modelId: 'gpt-5.6-terra',
        workflowConfigHash,
        now: new Date('2026-07-26T00:00:00.000Z'),
      };
      await expect(aiStore.reserveRun(reservation)).resolves.toEqual({
        replayed: false,
        alerts: [],
      });
      await expect(aiStore.reserveRun(reservation)).resolves.toEqual({
        replayed: true,
        alerts: [],
      });
      await expect(
        aiStore.reserveRun({ ...reservation, modelId: 'different-model' }),
      ).rejects.toThrow('AI_RESERVATION_ID_REUSED');
      const generationId = uuidv7();
      const payload = {
        prompt: { blocks: ['synthetic-block-id-only'] },
        output: { claims: ['synthetic-advisory-output'] },
      };
      const generation = {
        generationId,
        reservationId,
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        artifactId,
        intakeSetId,
        provider: 'openai' as const,
        modelId: 'gpt-5.6-terra',
        promptVersion: 'REQUIREMENT_EXTRACTION@1',
        schemaVersion: '1',
        workflowConfigHash,
        inputHash: 'd'.repeat(64),
        outputHash: 'e'.repeat(64),
        audience: 'TEAM_ONLY' as const,
        inputTokens: 10,
        outputTokens: 5,
        payload,
      };
      const committed = await aiStore.commitSuccess(generation);
      expect(committed.replayed).toBe(false);
      expect(committed.retainedUntil).toBeInstanceOf(Date);
      await expect(aiStore.commitSuccess(generation)).resolves.toEqual({
        replayed: true,
        retainedUntil: null,
      });
      await expect(
        aiStore.commitSuccess({
          ...generation,
          generationId: uuidv7(),
          reservationId: uuidv7(),
        }),
      ).rejects.toThrow('AI_RESERVATION_NOT_FOUND');
      await expect(
        aiStore.readPayload(ids.clientUserId, ids.workspaceId, ids.projectId, generationId),
      ).rejects.toThrow('NOT_FOUND');
      await expect(
        aiStore.readPayload(ids.pmId, ids.workspaceId, ids.projectId, generationId),
      ).resolves.toEqual(payload);
      await expect(
        aiStore.configureWorkspace({
          workspaceId: ids.workspaceId,
          actorId: ids.pmId,
          correlationId: uuidv7(),
          expectedRevision: 0,
          provider: 'openai',
          workflowConfigHash,
          globalEnabled: true,
          requirementExtractionEnabled: true,
          provenanceRetentionDays: 30,
          aggregateQualityMetricsEnabled: true,
        }),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 1 });
      await pool.query(
        `update ai_budget_months set reserved_microusd = 49000000,
          alert_50_emitted = false, alert_80_emitted = false
          where workspace_id = $1`,
        [ids.workspaceId],
      );
      const atFifty = { ...reservation, reservationId: uuidv7() };
      await expect(aiStore.reserveRun(atFifty)).resolves.toEqual({
        replayed: false,
        alerts: [50],
      });
      await aiStore.recordFailure({
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        reservationId: atFifty.reservationId,
      });
      await pool.query(
        `update ai_budget_months set reserved_microusd = 79000000,
          alert_50_emitted = true, alert_80_emitted = false
          where workspace_id = $1`,
        [ids.workspaceId],
      );
      await expect(
        aiStore.reserveRun({ ...reservation, reservationId: uuidv7() }),
      ).resolves.toEqual({
        replayed: false,
        alerts: [80],
      });
      await pool.query(
        `update ai_budget_months set reserved_microusd = 100000000,
          alert_50_emitted = true, alert_80_emitted = true
          where workspace_id = $1`,
        [ids.workspaceId],
      );
      await expect(aiStore.reserveRun({ ...reservation, reservationId: uuidv7() })).rejects.toThrow(
        'AI_BUDGET_EXHAUSTED',
      );
      await expect(
        aiStore.configureWorkspace({
          workspaceId: ids.workspaceId,
          actorId: ids.pmId,
          correlationId: uuidv7(),
          expectedRevision: 1,
          provider: 'openai',
          workflowConfigHash,
          globalEnabled: true,
          requirementExtractionEnabled: true,
          provenanceRetentionDays: 0,
          aggregateQualityMetricsEnabled: false,
        }),
      ).resolves.toEqual({ revision: 2 });
      await pool.query(
        `update ai_budget_months set reserved_microusd = 0,
          alert_50_emitted = false, alert_80_emitted = false
          where workspace_id = $1`,
        [ids.workspaceId],
      );
      const unretainedReservation = { ...reservation, reservationId: uuidv7() };
      await aiStore.reserveRun(unretainedReservation);
      const unretained = await aiStore.commitSuccess({
        ...generation,
        generationId: uuidv7(),
        reservationId: unretainedReservation.reservationId,
        audience: 'CLIENT_VISIBLE',
      });
      expect(unretained.retainedUntil).toBeNull();
      expect(await aiStore.purgeExpiredPayloads(new Date('2100-01-01T00:00:00.000Z'))).toBe(1);
      await expect(
        aiStore.readPayload(ids.pmId, ids.workspaceId, ids.projectId, generationId),
      ).rejects.toThrow('NOT_FOUND');
      await expect(
        pool.query(
          `update requirement_intake_sets set intake_set_id = $2 where intake_set_id = $1`,
          [intakeSetId, uuidv7()],
        ),
      ).rejects.toThrow(/immutable/u);
    });
  });
});
