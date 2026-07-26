import { createHash } from 'node:crypto';

import {
  completeSourceUploadSessionCommandSchema,
  createSourceUploadSessionCommandSchema,
  mutateSourceRetentionCommandSchema,
} from '@delivery-os/contracts';
import { PostgresIngestionStore, type DatabasePool } from '@delivery-os/database';
import { FakeObjectStorage, normalizeParsedDocument, parseText } from '@delivery-os/ingestion';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { migrateDatabase, withTemporaryDatabase } from '../helpers/database';

async function setup(pool: DatabasePool) {
  const workspaceId = uuidv7();
  const projectId = uuidv7();
  const clientId = uuidv7();
  const pmId = uuidv7();
  const stakeholderId = uuidv7();
  const outsiderId = uuidv7();
  for (const [id, email] of [
    [pmId, 'm3-pm@example.test'],
    [stakeholderId, 'm3-client@example.test'],
    [outsiderId, 'm3-outsider@example.test'],
  ]) {
    await pool.query(
      `insert into auth_users (id, name, email, email_verified)
       values ($1, $2, $3, true)`,
      [id, email.split('@')[0], email],
    );
  }
  await pool.query(
    `insert into workspaces (id, name, default_working_hours, created_by)
     values ($1, 'M3 synthetic workspace',
             '{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}', $2)`,
    [workspaceId, pmId],
  );
  for (const userId of [pmId, stakeholderId]) {
    await pool.query(
      `insert into workspace_memberships
         (workspace_id, user_id, role, state, activated_at)
       values ($1, $2, 'MEMBER', 'ACTIVE', now())`,
      [workspaceId, userId],
    );
  }
  await pool.query(
    `insert into clients
       (id, workspace_id, name, primary_contact_name, primary_contact_email, state, created_by)
     values ($1, $2, 'Synthetic client', 'Synthetic owner',
             'owner@example.test', 'ACTIVE', $3)`,
    [clientId, workspaceId, pmId],
  );
  await pool.query(
    `insert into projects
       (id, workspace_id, client_id, type, lifecycle_state, name, short_description,
        target_start, target_end, created_by)
     values ($1, $2, $3, 'EXTERNAL', 'INTAKE', 'Synthetic M3 project',
             'Synthetic-only Requirement intake validation.',
             '2026-08-01', '2026-10-31', $4)`,
    [projectId, workspaceId, clientId, pmId],
  );
  for (const [userId, role] of [
    [pmId, 'PM'],
    [stakeholderId, 'CLIENT_STAKEHOLDER'],
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
  const storage = new FakeObjectStorage();
  return {
    workspaceId,
    projectId,
    pmId,
    stakeholderId,
    outsiderId,
    storage,
    store: new PostgresIngestionStore(pool, storage),
  };
}

function createCommand(input: {
  actorId: string;
  workspaceId: string;
  projectId: string;
  body: Uint8Array;
  audience?: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
  declaredByteSize?: number;
}) {
  const digest = createHash('sha256').update(input.body);
  return createSourceUploadSessionCommandSchema.parse({
    schemaVersion: '1',
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorId: input.actorId,
    expectedRevision: 0,
    idempotencyKey: uuidv7(),
    correlationId: uuidv7(),
    sourceArtifactId: uuidv7(),
    sourceGenerationId: uuidv7(),
    uploadSessionId: uuidv7(),
    objectManifestId: uuidv7(),
    command: {
      displayName: 'synthetic-requirements.txt',
      declaredMediaType: 'text/plain',
      declaredByteSize: input.declaredByteSize ?? input.body.byteLength,
      checksumSha256: digest.copy().digest('hex'),
      checksumSha256Base64: digest.digest('base64'),
      audience: input.audience ?? 'TEAM_ONLY',
    },
  });
}

function objectKey(command: ReturnType<typeof createCommand>): string {
  return [
    'quarantine',
    command.workspaceId,
    command.projectId,
    command.sourceArtifactId,
    command.sourceGenerationId,
  ].join('/');
}

describe('M3 secure source upload repository', () => {
  it('reserves quota, verifies the full SHA-256, emits atomic evidence, and filters audience', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const body = new TextEncoder().encode('Synthetic Requirement source only.');
      const command = createCommand({ ...context, actorId: context.pmId, body });

      const created = await context.store.createUploadSession(command);
      expect(created).toMatchObject({
        sourceArtifactId: command.sourceArtifactId,
        state: 'OPEN',
        revision: 1,
      });
      expect(created.upload?.url).toContain('fake://put/');
      const replayed = await context.store.createUploadSession(command);
      expect(replayed.state).toBe('OPEN');
      expect(replayed.upload?.url).toContain('fake://put/');

      context.storage.seed({
        key: objectKey(command),
        contentLength: body.byteLength,
        contentType: 'text/plain',
        checksumSha256: command.command.checksumSha256Base64,
        body,
      });
      const completed = await context.store.completeUploadSession(
        completeSourceUploadSessionCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          actorId: context.pmId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          sourceArtifactId: command.sourceArtifactId,
          sourceGenerationId: command.sourceGenerationId,
          uploadSessionId: command.uploadSessionId,
          command: {},
        }),
      );
      expect(completed).toMatchObject({ state: 'COMPLETED', revision: 2 });
      expect(
        await context.store.listSources(context.pmId, context.workspaceId, context.projectId),
      ).toHaveLength(1);
      expect(
        await context.store.listSources(
          context.stakeholderId,
          context.workspaceId,
          context.projectId,
        ),
      ).toHaveLength(0);
      await expect(
        context.store.getSource(
          context.outsiderId,
          context.workspaceId,
          context.projectId,
          command.sourceArtifactId,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const evidence = await pool.query<{
        retained_bytes: string;
        reserved_bytes: string;
        reservation_state: string;
        audit_count: string;
        outbox_count: string;
      }>(
        `select q.retained_bytes::text, q.reserved_bytes::text,
                r.state as reservation_state,
                (select count(*)::text from audit_events
                  where target_id = $3) as audit_count,
                (select count(*)::text from outbox_events
                  where aggregate_id = $3) as outbox_count
           from source_project_quotas q
           join source_quota_reservations r
             on r.workspace_id = q.workspace_id and r.project_id = q.project_id
          where q.workspace_id = $1 and q.project_id = $2`,
        [context.workspaceId, context.projectId, command.sourceArtifactId],
      );
      expect(evidence.rows[0]).toEqual({
        retained_bytes: String(body.byteLength),
        reserved_bytes: '0',
        reservation_state: 'CONSUMED',
        audit_count: '2',
        outbox_count: '2',
      });
    });
  });

  it('fails closed on a full-stream checksum mismatch and releases quota', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const expected = new TextEncoder().encode('Expected synthetic content.');
      const actual = expected.slice();
      actual[0] = actual[0] === 88 ? 89 : 88;
      expect(actual.byteLength).toBe(expected.byteLength);
      const command = createCommand({ ...context, actorId: context.pmId, body: expected });
      await context.store.createUploadSession(command);
      context.storage.seed({
        key: objectKey(command),
        contentLength: actual.byteLength,
        contentType: 'text/plain',
        checksumSha256: command.command.checksumSha256Base64,
        body: actual,
      });
      await expect(
        context.store.completeUploadSession(
          completeSourceUploadSessionCommandSchema.parse({
            schemaVersion: '1',
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            actorId: context.pmId,
            expectedRevision: 1,
            idempotencyKey: uuidv7(),
            correlationId: uuidv7(),
            sourceArtifactId: command.sourceArtifactId,
            sourceGenerationId: command.sourceGenerationId,
            uploadSessionId: command.uploadSessionId,
            command: {},
          }),
        ),
      ).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
      const result = await pool.query<{
        session_state: string;
        processing_state: string;
        reserved_bytes: string;
      }>(
        `select us.state as session_state, sa.processing_state,
                q.reserved_bytes::text
           from source_upload_sessions us
           join source_artifacts sa on sa.id = us.source_artifact_id
           join source_project_quotas q
             on q.workspace_id = us.workspace_id and q.project_id = us.project_id
          where us.id = $1`,
        [command.uploadSessionId],
      );
      expect(result.rows[0]).toEqual({
        session_state: 'FAILED',
        processing_state: 'FAILED',
        reserved_bytes: '0',
      });
    });
  });

  it('serializes concurrent project quota reservations', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const placeholder = new Uint8Array([1]);
      const reservedCommands = Array.from({ length: 9 }, () =>
        createCommand({
          ...context,
          actorId: context.pmId,
          body: placeholder,
          declaredByteSize: 52_428_800,
        }),
      );
      for (const command of reservedCommands) {
        await context.store.createUploadSession(command);
      }
      const contenders = Array.from({ length: 2 }, () =>
        createCommand({
          ...context,
          actorId: context.pmId,
          body: placeholder,
          declaredByteSize: 52_428_800,
        }),
      );
      const results = await Promise.allSettled(
        contenders.map((command) => context.store.createUploadSession(command)),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((result) => result.status === 'rejected');
      expect(failure).toMatchObject({ reason: { code: 'QUOTA_EXCEEDED' } });
      const quota = await pool.query<{ reserved_bytes: string }>(
        `select reserved_bytes::text from source_project_quotas
          where workspace_id = $1 and project_id = $2`,
        [context.workspaceId, context.projectId],
      );
      expect(quota.rows[0]?.reserved_bytes).toBe('524288000');
    });
  });

  it('authorizes downloads and purges primary plus backup manifests after recovery expires', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const body = new TextEncoder().encode('Synthetic client-visible retention source.');
      const command = createCommand({
        ...context,
        actorId: context.pmId,
        body,
        audience: 'CLIENT_VISIBLE',
      });
      await context.store.createUploadSession(command);
      context.storage.seed({
        key: objectKey(command),
        contentLength: body.byteLength,
        contentType: 'text/plain',
        checksumSha256: command.command.checksumSha256Base64,
        body,
      });
      await context.store.completeUploadSession(
        completeSourceUploadSessionCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          actorId: context.pmId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          sourceArtifactId: command.sourceArtifactId,
          sourceGenerationId: command.sourceGenerationId,
          uploadSessionId: command.uploadSessionId,
          command: {},
        }),
      );
      const primaryKey = `sources/${context.workspaceId}/${context.projectId}/${command.sourceArtifactId}/${command.sourceGenerationId}`;
      const backupKey = `backups/${context.workspaceId}/${context.projectId}/${command.sourceArtifactId}/${command.sourceGenerationId}`;
      for (const [key, purpose] of [
        [primaryKey, 'PRIMARY'],
        [backupKey, 'BACKUP'],
      ] as const) {
        context.storage.seed({
          key,
          contentLength: body.byteLength,
          contentType: 'text/plain',
          checksumSha256: command.command.checksumSha256Base64,
          body,
        });
        await pool.query(
          `insert into object_manifests
             (id, workspace_id, project_id, source_artifact_id, source_generation_id,
              purpose, replica, object_key, byte_size, media_type, sha256, state, verified_at)
           values ($1, $2, $3, $4, $5, $6, 0, $7, $8, 'text/plain', $9, 'AVAILABLE', now())`,
          [
            uuidv7(),
            context.workspaceId,
            context.projectId,
            command.sourceArtifactId,
            command.sourceGenerationId,
            purpose,
            key,
            body.byteLength,
            command.command.checksumSha256,
          ],
        );
      }
      await pool.query(`update source_artifacts set processing_state = 'SUCCEEDED' where id = $1`, [
        command.sourceArtifactId,
      ]);
      await expect(
        context.store.issueDownload(
          context.stakeholderId,
          context.workspaceId,
          context.projectId,
          command.sourceArtifactId,
          uuidv7(),
        ),
      ).resolves.toMatchObject({ sourceArtifactId: command.sourceArtifactId });
      const deletion = await context.store.mutateRetention(
        mutateSourceRetentionCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          actorId: context.pmId,
          expectedRevision: 2,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          sourceArtifactId: command.sourceArtifactId,
          command: { action: 'DELETE', reason: 'Synthetic retention lifecycle validation.' },
        }),
      );
      expect(deletion.retentionState).toBe('RECOVERABLE');
      await expect(
        context.store.issueDownload(
          context.stakeholderId,
          context.workspaceId,
          context.projectId,
          command.sourceArtifactId,
          uuidv7(),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const recovered = await context.store.mutateRetention(
        mutateSourceRetentionCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          actorId: context.pmId,
          expectedRevision: 3,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          sourceArtifactId: command.sourceArtifactId,
          command: { action: 'RECOVER' },
        }),
      );
      expect(recovered.retentionState).toBe('ACTIVE');
      await context.store.mutateRetention(
        mutateSourceRetentionCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          actorId: context.pmId,
          expectedRevision: 4,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          sourceArtifactId: command.sourceArtifactId,
          command: { action: 'DELETE', reason: 'Synthetic permanent purge validation.' },
        }),
      );
      await pool.query(
        `update source_artifacts set recoverable_until = now() - interval '1 second'
          where id = $1`,
        [command.sourceArtifactId],
      );
      const purgeInput = {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        sourceArtifactId: command.sourceArtifactId,
        purgeReceiptId: uuidv7(),
        correlationId: uuidv7(),
      };
      await expect(context.store.purgeSource(purgeInput)).resolves.toEqual({
        purged: true,
        manifestCount: 3,
      });
      await expect(context.store.purgeSource(purgeInput)).resolves.toEqual({
        purged: true,
        manifestCount: 3,
      });
      await expect(context.storage.head(primaryKey)).resolves.toBeUndefined();
      await expect(context.storage.head(backupKey)).resolves.toBeUndefined();
      const evidence = await pool.query<{
        source_count: string;
        receipt_count: string;
        backup_objects_purged: number;
        retained_bytes: string;
      }>(
        `select
           (select count(*)::text from source_artifacts where id = $3) as source_count,
           (select count(*)::text from source_purge_receipts
             where source_artifact_id = $3) as receipt_count,
           (select backup_objects_purged from source_purge_receipts
             where source_artifact_id = $3) as backup_objects_purged,
           (select retained_bytes::text from source_project_quotas
             where workspace_id = $1 and project_id = $2) as retained_bytes`,
        [context.workspaceId, context.projectId, command.sourceArtifactId],
      );
      expect(evidence.rows[0]).toEqual({
        source_count: '0',
        receipt_count: '1',
        backup_objects_purged: 1,
        retained_bytes: '0',
      });
    });
  });

  it('commits one immutable normalized result across replayed worker delivery', async () => {
    await withTemporaryDatabase(async (_url, pool) => {
      await migrateDatabase(pool);
      const context = await setup(pool);
      const body = new TextEncoder().encode('Synthetic normalized source.\n\nSecond block.');
      const command = createCommand({ ...context, actorId: context.pmId, body });
      await context.store.createUploadSession(command);
      context.storage.seed({
        key: objectKey(command),
        contentLength: body.byteLength,
        contentType: 'text/plain',
        checksumSha256: command.command.checksumSha256Base64,
        body,
      });
      await context.store.completeUploadSession(
        completeSourceUploadSessionCommandSchema.parse({
          schemaVersion: '1',
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          actorId: context.pmId,
          expectedRevision: 1,
          idempotencyKey: uuidv7(),
          correlationId: uuidv7(),
          sourceArtifactId: command.sourceArtifactId,
          sourceGenerationId: command.sourceGenerationId,
          uploadSessionId: command.uploadSessionId,
          command: {},
        }),
      );
      const claim = {
        id: uuidv7(),
        attemptId: uuidv7(),
        attemptNumber: 1,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        sourceArtifactId: command.sourceArtifactId,
        sourceGenerationId: command.sourceGenerationId,
        intakeSetId: null,
        jobType: 'SCAN' as const,
        inputHash: command.command.checksumSha256,
        configVersion: 'scan@1',
        correlationId: uuidv7(),
      };
      const primaryObjectKey = [
        'sources',
        context.workspaceId,
        context.projectId,
        command.sourceArtifactId,
        command.sourceGenerationId,
      ].join('/');
      await expect(
        context.store.promoteScannedSource(claim, {
          primaryManifestId: uuidv7(),
          primaryObjectKey,
          detectedMediaType: 'text/plain',
        }),
      ).resolves.toEqual({ replayed: false });
      await expect(
        context.store.promoteScannedSource(claim, {
          primaryManifestId: uuidv7(),
          primaryObjectKey,
          detectedMediaType: 'text/plain',
        }),
      ).resolves.toEqual({ replayed: true });
      expect(await context.storage.get(objectKey(command))).toBeUndefined();
      expect(await context.storage.get(primaryObjectKey)).toBeDefined();
      const normalized = normalizeParsedDocument({
        sourceGenerationId: command.sourceGenerationId,
        sourceSha256: command.command.checksumSha256,
        parserVersion: 'text@1',
        rendererVersion: 'none',
        ocrConfigVersion: 'none',
        blocks: parseText(body).blocks,
      });
      const firstDocumentId = uuidv7();
      const common = {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        sourceArtifactId: command.sourceArtifactId,
        sourceGenerationId: command.sourceGenerationId,
        sourceSha256: command.command.checksumSha256,
        parserVersion: 'text@1',
        rendererVersion: 'none',
        ocrConfigVersion: 'none',
        documentHash: normalized.documentHash,
        correlationId: uuidv7(),
        blocks: normalized.blocks.map((block) => ({
          ...block,
          id: uuidv7(),
          sourceLocatorId: uuidv7(),
        })),
      };
      await expect(
        context.store.commitNormalizedDocument({
          ...common,
          normalizedDocumentId: firstDocumentId,
        }),
      ).resolves.toEqual({
        normalizedDocumentId: firstDocumentId,
        replayed: false,
        blockCount: 2,
      });
      await expect(
        context.store.commitNormalizedDocument({
          ...common,
          normalizedDocumentId: uuidv7(),
          blocks: common.blocks.map((block) => ({
            ...block,
            id: uuidv7(),
            sourceLocatorId: uuidv7(),
          })),
        }),
      ).resolves.toEqual({
        normalizedDocumentId: firstDocumentId,
        replayed: true,
        blockCount: 2,
      });
      const counts = await pool.query<{ documents: string; blocks: string; locators: string }>(
        `select
           (select count(*)::text from normalized_documents
             where source_generation_id = $1) as documents,
           (select count(*)::text from normalized_blocks
             where source_generation_id = $1) as blocks,
           (select count(*)::text from source_locators
             where source_generation_id = $1) as locators`,
        [command.sourceGenerationId],
      );
      expect(counts.rows[0]).toEqual({ documents: '1', blocks: '2', locators: '2' });
      await expect(
        pool.query(
          `update normalized_blocks set text = 'mutated' where normalized_document_id = $1`,
          [firstDocumentId],
        ),
      ).rejects.toThrow(/immutable/);
    });
  });
});
