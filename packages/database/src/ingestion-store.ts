import { createHash } from 'node:crypto';

import {
  ApplicationError,
  type IngestionCommandStore,
  type IngestionQueryStore,
  type NormalizedDocumentCommitInput,
  type ProcessingSource,
  type SourceProcessingStore,
  type SourceUploadStorageGateway,
} from '@delivery-os/application';
import {
  sourceArtifactSchema,
  sourceDownloadResultSchema,
  sourceMutationResultSchema,
  sourceUploadSessionResultSchema,
  type CancelSourceUploadSessionCommand,
  type CompleteSourceUploadSessionCommand,
  type CreateSourceUploadSessionCommand,
  type MutateSourceRetentionCommand,
  type SourceArtifact,
  type SourceDownloadResult,
  type SourceMutationResult,
  type SourceUploadSessionResult,
} from '@delivery-os/contracts';
import {
  assertProjectQuota,
  assertSourceByteSize,
  classifyDeclaredSource,
} from '@delivery-os/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

type UploadCommand =
  | CreateSourceUploadSessionCommand
  | CompleteSourceUploadSessionCommand
  | CancelSourceUploadSessionCommand;

type IdempotencyRow = QueryResultRow & {
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
};

type AuthorizationRow = QueryResultRow & {
  roles: ('PM' | 'LEAD' | 'CONTRIBUTOR' | 'VIEWER' | 'CLIENT_STAKEHOLDER')[];
};

type UploadSessionRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  project_id: string;
  source_artifact_id: string;
  source_generation_id: string;
  quarantine_manifest_id: string;
  object_key: string;
  state: 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  revision: number;
  reserved_bytes: number | string;
  expected_sha256: string;
  expected_sha256_base64: string;
  declared_media_type: string;
  expires_at: Date;
};

type SourceRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  project_id: string;
  current_generation_id: string;
  display_name: string;
  format: SourceArtifact['format'];
  audience: SourceArtifact['audience'];
  processing_state: SourceArtifact['processingState'];
  retention_state: SourceArtifact['retentionState'];
  revision: number;
  created_at: Date;
  updated_at: Date;
};

type RetentionRow = SourceRow & {
  deleted_by: string | null;
  deleted_at: Date | null;
  recoverable_until: Date | null;
};

function safeNotFound(correlationId = uuidv7()): ApplicationError {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
    correlationId,
  });
}

function commandHash(operation: string, command: UploadCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        operation,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        actorId: command.actorId,
        expectedRevision: command.expectedRevision,
        command: command.command,
      }),
    )
    .digest('hex');
}

function quarantineKey(command: CreateSourceUploadSessionCommand): string {
  return [
    'quarantine',
    command.workspaceId,
    command.projectId,
    command.sourceArtifactId,
    command.sourceGenerationId,
  ].join('/');
}

function toSource(row: SourceRow): SourceArtifact {
  return sourceArtifactSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    currentGenerationId: row.current_generation_id,
    displayName: row.display_name,
    format: row.format,
    audience: row.audience,
    processingState: row.processing_state,
    retentionState: row.retention_state,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

async function hashStream(
  stream: AsyncIterable<Uint8Array>,
  maximumBytes: number,
): Promise<{ sha256: string; byteSize: number }> {
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of stream) {
    byteSize += chunk.byteLength;
    if (byteSize > maximumBytes) {
      throw new ApplicationError({
        code: 'UPLOAD_INCOMPLETE',
        message: 'The uploaded object did not match the reserved size.',
        correlationId: uuidv7(),
      });
    }
    hash.update(chunk);
  }
  return { sha256: hash.digest('hex'), byteSize };
}

export class PostgresIngestionStore
  implements IngestionCommandStore, IngestionQueryStore, SourceProcessingStore
{
  constructor(
    private readonly pool: DatabasePool,
    private readonly storage: SourceUploadStorageGateway,
    private readonly backupStorage?: SourceUploadStorageGateway,
  ) {}

  async createUploadSession(
    command: CreateSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult> {
    const safeResult = await this.createUploadSessionTransaction(command);
    if (safeResult.state !== 'OPEN') return safeResult;
    const key = quarantineKey(command);
    try {
      const url = await this.storage.presignPut(key, {
        contentType: command.command.declaredMediaType,
        checksumSha256: command.command.checksumSha256Base64,
        expiresInSeconds: 300,
      });
      const result = sourceUploadSessionResultSchema.parse({
        ...safeResult,
        upload: {
          url,
          method: 'PUT',
          requiredHeaders: {
            'content-type': command.command.declaredMediaType,
            'x-amz-checksum-sha256': command.command.checksumSha256Base64,
          },
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        },
      });
      await this.completeIdempotency(command, result);
      return result;
    } catch (error) {
      await this.failOpenSessionAfterCapabilityError(command);
      throw new ApplicationError({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Secure upload is temporarily unavailable.',
        correlationId: command.correlationId,
        cause: error,
      });
    }
  }

  async completeUploadSession(
    command: CompleteSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult> {
    const session = await this.getAuthorizedUploadSession(
      command.actorId,
      command.workspaceId,
      command.projectId,
      command.uploadSessionId,
      command.correlationId,
    );
    if (session.state === 'COMPLETED') {
      return this.replayOrReject(command, commandHash('completeUploadSession', command));
    }
    if (session.state !== 'OPEN') throw safeNotFound(command.correlationId);
    if (session.expires_at.getTime() <= Date.now()) {
      await this.failUploadVerification(command, session, 'UPLOAD_SESSION_EXPIRED');
      throw new ApplicationError({
        code: 'UPLOAD_SESSION_EXPIRED',
        message: 'The upload session expired. Start a new upload.',
        correlationId: command.correlationId,
      });
    }
    const metadata = await this.storage.head(session.object_key);
    const stream = await this.storage.get(session.object_key);
    if (metadata === undefined || stream === undefined) {
      throw new ApplicationError({
        code: 'UPLOAD_INCOMPLETE',
        message: 'The upload has not completed.',
        correlationId: command.correlationId,
      });
    }
    const reservedBytes = Number(session.reserved_bytes);
    const actual = await hashStream(stream, reservedBytes);
    const verificationFailure =
      metadata.contentLength !== reservedBytes || actual.byteSize !== reservedBytes
        ? 'UPLOAD_INCOMPLETE'
        : metadata.contentType !== session.declared_media_type
          ? 'UNSUPPORTED_MEDIA_TYPE'
          : actual.sha256 !== session.expected_sha256
            ? 'CHECKSUM_MISMATCH'
            : null;
    if (verificationFailure !== null) {
      await this.failUploadVerification(command, session, verificationFailure);
      throw new ApplicationError({
        code: verificationFailure,
        message:
          verificationFailure === 'CHECKSUM_MISMATCH'
            ? 'The uploaded object failed full checksum verification.'
            : 'The uploaded object did not match the authorized upload.',
        correlationId: command.correlationId,
      });
    }
    return this.completeVerifiedUpload(command, session, actual.sha256, actual.byteSize);
  }

  async cancelUploadSession(
    command: CancelSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult> {
    const hash = commandHash('cancelUploadSession', command);
    const client = await this.pool.connect();
    let objectKey: string | null = null;
    try {
      await client.query('begin');
      await this.requireUploadRole(
        client,
        command.actorId,
        command.workspaceId,
        command.projectId,
        command.correlationId,
      );
      const replay = await this.beginIdempotency(client, command, hash);
      if (replay !== null) {
        await client.query('commit');
        return replay;
      }
      const selected = await client.query<UploadSessionRow>(
        this.uploadSessionSelect('for update'),
        [command.workspaceId, command.projectId, command.uploadSessionId],
      );
      const session = selected.rows[0];
      if (session?.source_artifact_id !== command.sourceArtifactId) {
        throw safeNotFound(command.correlationId);
      }
      if (session.state !== 'OPEN' || session.revision !== command.expectedRevision) {
        throw new ApplicationError({
          code: 'REVISION_CONFLICT',
          message: 'The upload session changed. Reload it and retry.',
          correlationId: command.correlationId,
          currentRevision: session.revision,
        });
      }
      objectKey = session.object_key;
      await this.releaseReservation(client, session, 'RELEASED');
      await client.query(
        `update source_upload_sessions
            set state = 'CANCELLED', revision = revision + 1, updated_at = now()
          where id = $1`,
        [session.id],
      );
      await client.query(
        `update source_artifacts
            set processing_state = 'FAILED', revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.sourceArtifactId],
      );
      await client.query(
        `update object_manifests set state = 'DELETING', updated_at = now() where id = $1`,
        [session.quarantine_manifest_id],
      );
      const result = sourceUploadSessionResultSchema.parse({
        schemaVersion: '1',
        sourceArtifactId: command.sourceArtifactId,
        sourceGenerationId: session.source_generation_id,
        uploadSessionId: session.id,
        revision: session.revision + 1,
        state: 'CANCELLED',
        upload: null,
        correlationId: command.correlationId,
      });
      await this.writeAuditOutbox(client, {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        actorId: command.actorId,
        sourceArtifactId: command.sourceArtifactId,
        revision: session.revision + 1,
        correlationId: command.correlationId,
        action: 'source.upload-cancelled',
        eventType: 'source.upload-cancelled.v1',
        state: 'CANCELLED',
        reason: command.command.reason,
      });
      await this.finishIdempotency(client, command, result);
      await client.query('commit');
      if (objectKey !== null) {
        await this.storage.delete(objectKey);
        await this.pool.query(
          `update object_manifests
              set state = 'DELETED', deleted_at = now(), updated_at = now()
            where workspace_id = $1 and project_id = $2 and id = $3 and state = 'DELETING'`,
          [command.workspaceId, command.projectId, session.quarantine_manifest_id],
        );
      }
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listSources(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<SourceArtifact[]> {
    const roles = await this.requireProjectAccess(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      uuidv7(),
    );
    const clientOnly = roles.length === 1 && roles[0] === 'CLIENT_STAKEHOLDER';
    const result = await this.pool.query<SourceRow>(
      `select id, workspace_id, project_id, current_generation_id, display_name, format,
              audience, processing_state, retention_state, revision, created_at, updated_at
         from source_artifacts
        where workspace_id = $1 and project_id = $2
          and retention_state <> 'PURGED'
          and ($3::boolean = false or
               (audience = 'CLIENT_VISIBLE' and retention_state = 'ACTIVE'))
        order by created_at desc, id desc`,
      [workspaceId, projectId, clientOnly],
    );
    return result.rows.map(toSource);
  }

  async getSource(
    actorId: string,
    workspaceId: string,
    projectId: string,
    sourceArtifactId: string,
  ): Promise<SourceArtifact> {
    const roles = await this.requireProjectAccess(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      uuidv7(),
    );
    const clientOnly = roles.length === 1 && roles[0] === 'CLIENT_STAKEHOLDER';
    const result = await this.pool.query<SourceRow>(
      `select id, workspace_id, project_id, current_generation_id, display_name, format,
              audience, processing_state, retention_state, revision, created_at, updated_at
         from source_artifacts
        where workspace_id = $1 and project_id = $2 and id = $3
          and retention_state <> 'PURGED'
          and ($4::boolean = false or
               (audience = 'CLIENT_VISIBLE' and retention_state = 'ACTIVE'))`,
      [workspaceId, projectId, sourceArtifactId, clientOnly],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound();
    return toSource(row);
  }

  async issueDownload(
    actorId: string,
    workspaceId: string,
    projectId: string,
    sourceArtifactId: string,
    correlationId: string,
  ): Promise<SourceDownloadResult> {
    const roles = await this.requireProjectAccess(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      correlationId,
    );
    const clientOnly = roles.length === 1 && roles[0] === 'CLIENT_STAKEHOLDER';
    const result = await this.pool.query<{
      generation_id: string;
      object_key: string;
    }>(
      `select sg.id as generation_id, om.object_key
         from source_artifacts sa
         join source_generations sg
           on sg.workspace_id = sa.workspace_id
          and sg.project_id = sa.project_id
          and sg.id = sa.current_generation_id
         join object_manifests om
           on om.workspace_id = sa.workspace_id
          and om.project_id = sa.project_id
          and om.source_generation_id = sg.id
          and om.purpose = 'PRIMARY' and om.state = 'AVAILABLE'
        where sa.workspace_id = $1 and sa.project_id = $2 and sa.id = $3
          and sa.retention_state = 'ACTIVE' and sa.processing_state = 'SUCCEEDED'
          and ($4::boolean = false or sa.audience = 'CLIENT_VISIBLE')`,
      [workspaceId, projectId, sourceArtifactId, clientOnly],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound(correlationId);
    const expiresInSeconds = 60;
    const url = await this.storage.presignGet(row.object_key, expiresInSeconds);
    return sourceDownloadResultSchema.parse({
      schemaVersion: '1',
      sourceArtifactId,
      generationId: row.generation_id,
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
      correlationId,
    });
  }

  async mutateRetention(command: MutateSourceRetentionCommand): Promise<SourceMutationResult> {
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'mutateRetention',
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          sourceArtifactId: command.sourceArtifactId,
          actorId: command.actorId,
          expectedRevision: command.expectedRevision,
          command: command.command,
        }),
      )
      .digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const roles = await this.requireProjectAccess(
        client,
        command.actorId,
        command.workspaceId,
        command.projectId,
        command.correlationId,
      );
      if (!roles.includes('PM')) throw safeNotFound(command.correlationId);
      const inserted = await client.query(
        `insert into idempotency_records
           (workspace_id, idempotency_key, request_hash, status, correlation_id)
         values ($1, $2, $3, 'PROCESSING', $4)
         on conflict do nothing returning idempotency_key`,
        [command.workspaceId, command.idempotencyKey, hash, command.correlationId],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const existing = await client.query<IdempotencyRow>(
          `select request_hash, status, result from idempotency_records
            where workspace_id = $1 and idempotency_key = $2 for update`,
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
        await client.query('commit');
        return sourceMutationResultSchema.parse({ ...row.result, replayed: true });
      }
      const selected = await client.query<RetentionRow>(
        `select id, workspace_id, project_id, current_generation_id, display_name, format,
                audience, processing_state, retention_state, revision, deleted_by, deleted_at,
                recoverable_until, created_at, updated_at
           from source_artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
          for update`,
        [command.workspaceId, command.projectId, command.sourceArtifactId],
      );
      const source = selected.rows[0];
      if (source === undefined) throw safeNotFound(command.correlationId);
      if (source.revision !== command.expectedRevision) {
        throw new ApplicationError({
          code: 'REVISION_CONFLICT',
          message: 'The source changed. Reload it and retry.',
          correlationId: command.correlationId,
          currentRevision: source.revision,
        });
      }
      let retentionState: 'ACTIVE' | 'RECOVERABLE';
      let recoverableUntil: string | null;
      if (command.command.action === 'DELETE') {
        if (source.retention_state !== 'ACTIVE') {
          throw new ApplicationError({
            code: 'RETENTION_STATE_CONFLICT',
            message: 'The source is not eligible for deletion.',
            correlationId: command.correlationId,
          });
        }
        const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
        await client.query(
          `update source_artifacts
              set retention_state = 'RECOVERABLE', deleted_by = $4, deleted_at = now(),
                  recoverable_until = $5, revision = revision + 1, updated_at = now()
            where workspace_id = $1 and project_id = $2 and id = $3`,
          [command.workspaceId, command.projectId, command.sourceArtifactId, command.actorId, due],
        );
        retentionState = 'RECOVERABLE';
        recoverableUntil = due.toISOString();
        const purgeInputHash = createHash('sha256')
          .update(`${source.id}:${due.toISOString()}`)
          .digest('hex');
        await client.query(
          `insert into document_jobs
            (id, workspace_id, project_id, source_artifact_id, source_generation_id,
             job_type, input_hash, config_version, correlation_id, available_at)
           values ($1, $2, $3, $4, $5, 'PURGE', $6, 'retention-purge@1', $7, $8)
           on conflict (workspace_id, project_id, job_type, input_hash, config_version) do nothing`,
          [
            uuidv7(),
            command.workspaceId,
            command.projectId,
            command.sourceArtifactId,
            source.current_generation_id,
            purgeInputHash,
            command.correlationId,
            due,
          ],
        );
      } else {
        if (
          source.retention_state !== 'RECOVERABLE' ||
          source.recoverable_until === null ||
          source.recoverable_until.getTime() < Date.now()
        ) {
          throw new ApplicationError({
            code: 'RETENTION_STATE_CONFLICT',
            message: 'The source is not eligible for recovery.',
            correlationId: command.correlationId,
          });
        }
        await client.query(
          `update source_artifacts
              set retention_state = 'ACTIVE', deleted_by = null, deleted_at = null,
                  recoverable_until = null, revision = revision + 1, updated_at = now()
            where workspace_id = $1 and project_id = $2 and id = $3`,
          [command.workspaceId, command.projectId, command.sourceArtifactId],
        );
        await client.query(
          `update document_jobs
              set state = 'CANCELLED', completed_at = now(), revision = revision + 1,
                  updated_at = now()
            where workspace_id = $1 and project_id = $2 and source_artifact_id = $3
              and job_type = 'PURGE' and state in ('QUEUED', 'RETRY_WAIT')`,
          [command.workspaceId, command.projectId, command.sourceArtifactId],
        );
        retentionState = 'ACTIVE';
        recoverableUntil = null;
      }
      const result = sourceMutationResultSchema.parse({
        schemaVersion: '1',
        sourceArtifactId: command.sourceArtifactId,
        revision: source.revision + 1,
        processingState: source.processing_state,
        retentionState,
        recoverableUntil,
        correlationId: command.correlationId,
        replayed: false,
      });
      await this.writeAuditOutbox(client, {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        actorId: command.actorId,
        sourceArtifactId: command.sourceArtifactId,
        revision: source.revision + 1,
        correlationId: command.correlationId,
        action: command.command.action === 'DELETE' ? 'source.deleted' : 'source.recovered',
        eventType:
          command.command.action === 'DELETE' ? 'source.deleted.v1' : 'source.recovered.v1',
        state: retentionState,
        ...(command.command.action === 'DELETE' ? { reason: command.command.reason } : {}),
      });
      await client.query(
        `update idempotency_records
            set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
          where workspace_id = $1 and idempotency_key = $2`,
        [command.workspaceId, command.idempotencyKey, JSON.stringify(result)],
      );
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async purgeSource(input: {
    workspaceId: string;
    projectId: string;
    sourceArtifactId: string;
    purgeReceiptId: string;
    correlationId: string;
  }): Promise<{ purged: boolean; manifestCount: number }> {
    const existingReceipt = await this.pool.query<{ manifest_count: number }>(
      `select manifest_count from source_purge_receipts
        where workspace_id = $1 and project_id = $2 and source_artifact_id = $3`,
      [input.workspaceId, input.projectId, input.sourceArtifactId],
    );
    if (existingReceipt.rows[0] !== undefined) {
      return {
        purged: true,
        manifestCount: existingReceipt.rows[0].manifest_count,
      };
    }
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const selected = await client.query<RetentionRow>(
        `select id, workspace_id, project_id, current_generation_id, display_name, format,
                audience, processing_state, retention_state, revision, deleted_by, deleted_at,
                recoverable_until, created_at, updated_at
           from source_artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
          for update`,
        [input.workspaceId, input.projectId, input.sourceArtifactId],
      );
      const locked = selected.rows[0];
      if (locked === undefined) throw safeNotFound(input.correlationId);
      if (
        locked.retention_state === 'RECOVERABLE' &&
        locked.recoverable_until !== null &&
        locked.recoverable_until.getTime() <= Date.now()
      ) {
        await client.query(
          `update source_artifacts
              set retention_state = 'PURGING', revision = revision + 1, updated_at = now()
            where id = $1`,
          [locked.id],
        );
      } else if (locked.retention_state !== 'PURGING') {
        throw new ApplicationError({
          code: 'RETENTION_STATE_CONFLICT',
          message: 'The source is not due for permanent purge.',
          correlationId: input.correlationId,
        });
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const manifests = await this.pool.query<{
      object_key: string;
      purpose: 'QUARANTINE' | 'PRIMARY' | 'BACKUP';
    }>(
      `select object_key, purpose from object_manifests
        where workspace_id = $1 and project_id = $2 and source_artifact_id = $3
          and state <> 'DELETED'
        order by purpose, replica, id`,
      [input.workspaceId, input.projectId, input.sourceArtifactId],
    );
    const primaryKeys = manifests.rows
      .filter((manifest) => manifest.purpose !== 'BACKUP')
      .map((manifest) => manifest.object_key);
    const backupKeys = manifests.rows
      .filter((manifest) => manifest.purpose === 'BACKUP')
      .map((manifest) => manifest.object_key);
    if (backupKeys.length > 0 && this.backupStorage === undefined) {
      throw new Error('BACKUP_STORAGE_MISSING');
    }
    await this.storage.deleteMany(primaryKeys);
    const backupStorage = this.backupStorage;
    if (backupKeys.length > 0 && backupStorage !== undefined) {
      await backupStorage.deleteMany(backupKeys);
    }
    for (const manifest of manifests.rows) {
      const target = manifest.purpose === 'BACKUP' ? backupStorage : this.storage;
      if (target === undefined) throw new Error('BACKUP_STORAGE_MISSING');
      if ((await target.head(manifest.object_key)) !== undefined) {
        throw new ApplicationError({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Permanent purge could not verify object removal.',
          correlationId: input.correlationId,
        });
      }
    }

    const finalClient = await this.pool.connect();
    try {
      await finalClient.query('begin');
      const locked = await finalClient.query<RetentionRow>(
        `select id, workspace_id, project_id, current_generation_id, display_name, format,
                audience, processing_state, retention_state, revision, deleted_by, deleted_at,
                recoverable_until, created_at, updated_at
           from source_artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
          for update`,
        [input.workspaceId, input.projectId, input.sourceArtifactId],
      );
      const current = locked.rows[0];
      if (current?.retention_state !== 'PURGING' || current.deleted_by === null) {
        throw new ApplicationError({
          code: 'RETENTION_STATE_CONFLICT',
          message: 'The source purge state changed.',
          correlationId: input.correlationId,
        });
      }
      const bytes = await finalClient.query<{ total: number | string }>(
        `select coalesce(sum(actual_byte_size), 0) as total
           from source_generations
          where workspace_id = $1 and project_id = $2 and source_artifact_id = $3`,
        [input.workspaceId, input.projectId, input.sourceArtifactId],
      );
      const activeBytesPurged = Number(bytes.rows[0]?.total ?? 0);
      const backupObjectsPurged = manifests.rows.filter(
        (manifest) => manifest.purpose === 'BACKUP',
      ).length;
      await finalClient.query(
        `insert into source_purge_receipts
           (id, workspace_id, project_id, source_artifact_id, authorized_by,
            manifest_count, active_bytes_purged, backup_objects_purged)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (workspace_id, project_id, source_artifact_id) do nothing`,
        [
          input.purgeReceiptId,
          input.workspaceId,
          input.projectId,
          input.sourceArtifactId,
          current.deleted_by,
          manifests.rowCount ?? 0,
          activeBytesPurged,
          backupObjectsPurged,
        ],
      );
      await finalClient.query(
        `update source_project_quotas
            set retained_bytes = greatest(0, retained_bytes - $3),
                revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2`,
        [input.workspaceId, input.projectId, activeBytesPurged],
      );
      await this.writeAuditOutbox(finalClient, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actorId: current.deleted_by,
        sourceArtifactId: input.sourceArtifactId,
        revision: current.revision + 1,
        correlationId: input.correlationId,
        action: 'source.purged',
        eventType: 'source.purged.v1',
        state: 'PURGED',
        reason: 'Executed by the retention worker after the authorized recovery window.',
      });
      await finalClient.query(
        `delete from source_artifacts
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [input.workspaceId, input.projectId, input.sourceArtifactId],
      );
      await finalClient.query('commit');
      return { purged: true, manifestCount: manifests.rowCount ?? 0 };
    } catch (error) {
      await finalClient.query('rollback');
      throw error;
    } finally {
      finalClient.release();
    }
  }

  async backupSource(
    claim: Parameters<SourceProcessingStore['backupSource']>[0],
    input: Parameters<SourceProcessingStore['backupSource']>[1],
  ): Promise<{ replayed: boolean }> {
    if (this.backupStorage === undefined) throw new Error('BACKUP_STORAGE_MISSING');
    const source = await this.loadProcessingSource(claim, 'PRIMARY');
    const existing = await this.pool.query<{ object_key: string; sha256: string; state: string }>(
      `select object_key, sha256, state from object_manifests
        where source_generation_id = $1 and purpose = 'BACKUP' and replica = 0`,
      [source.sourceGenerationId],
    );
    const replay = existing.rows[0];
    if (replay !== undefined) {
      if (
        replay.object_key !== input.backupObjectKey ||
        replay.sha256 !== source.actualSha256 ||
        replay.state !== 'AVAILABLE'
      ) {
        throw new Error('IMMUTABLE_MANIFEST_MISMATCH');
      }
      await this.verifyObjectIn(
        this.backupStorage,
        input.backupObjectKey,
        source.actualByteSize,
        source.actualSha256,
      );
      return { replayed: true };
    }
    const body = await this.readProcessingObject(source, 52_428_800);
    const orphan = await this.backupStorage.head(input.backupObjectKey);
    if (orphan === undefined) {
      await this.backupStorage.putImmutable(input.backupObjectKey, {
        body,
        contentType: source.declaredMediaType,
        checksumSha256: Buffer.from(source.actualSha256, 'hex').toString('base64'),
      });
    }
    await this.verifyObjectIn(
      this.backupStorage,
      input.backupObjectKey,
      source.actualByteSize,
      source.actualSha256,
    );
    const inserted = await this.pool.query(
      `insert into object_manifests
        (id, workspace_id, project_id, source_artifact_id, source_generation_id,
         purpose, replica, object_key, byte_size, media_type, sha256, state, verified_at)
       values ($1, $2, $3, $4, $5, 'BACKUP', 0, $6, $7, $8, $9, 'AVAILABLE', now())
       on conflict (source_generation_id, purpose, replica) do nothing
       returning id`,
      [
        input.backupManifestId,
        source.workspaceId,
        source.projectId,
        source.sourceArtifactId,
        source.sourceGenerationId,
        input.backupObjectKey,
        source.actualByteSize,
        source.declaredMediaType,
        source.actualSha256,
      ],
    );
    return { replayed: (inserted.rowCount ?? 0) === 0 };
  }

  async commitNormalizedDocument(input: NormalizedDocumentCommitInput): Promise<{
    normalizedDocumentId: string;
    replayed: boolean;
    blockCount: number;
  }> {
    if (!/^[a-f0-9]{64}$/.test(input.sourceSha256) || !/^[a-f0-9]{64}$/.test(input.documentHash)) {
      throw new ApplicationError({
        code: 'VALIDATION_FAILED',
        message: 'Normalized document hashes are invalid.',
        correlationId: input.correlationId,
      });
    }
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const source = await client.query<{
        actual_sha256: string | null;
        audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
        retention_state: string;
      }>(
        `select sg.actual_sha256, sa.audience, sa.retention_state
           from source_generations sg
           join source_artifacts sa
             on sa.workspace_id = sg.workspace_id
            and sa.project_id = sg.project_id
            and sa.id = sg.source_artifact_id
          where sg.workspace_id = $1 and sg.project_id = $2 and sg.id = $3
            and sg.source_artifact_id = $4
          for update of sa`,
        [input.workspaceId, input.projectId, input.sourceGenerationId, input.sourceArtifactId],
      );
      const sourceRow = source.rows[0];
      if (
        sourceRow?.retention_state !== 'ACTIVE' ||
        sourceRow.actual_sha256 !== input.sourceSha256
      ) {
        throw safeNotFound(input.correlationId);
      }
      const inserted = await client.query<{ id: string }>(
        `insert into normalized_documents
           (id, workspace_id, project_id, source_artifact_id, source_generation_id,
            parser_version, renderer_version, ocr_config_version, source_sha256,
            document_hash, block_count)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (source_generation_id, parser_version, renderer_version, ocr_config_version)
         do nothing
         returning id`,
        [
          input.normalizedDocumentId,
          input.workspaceId,
          input.projectId,
          input.sourceArtifactId,
          input.sourceGenerationId,
          input.parserVersion,
          input.rendererVersion,
          input.ocrConfigVersion,
          input.sourceSha256,
          input.documentHash,
          input.blocks.length,
        ],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const existing = await client.query<{
          id: string;
          document_hash: string;
          block_count: number;
        }>(
          `select id, document_hash, block_count from normalized_documents
            where source_generation_id = $1 and parser_version = $2
              and renderer_version = $3 and ocr_config_version = $4`,
          [
            input.sourceGenerationId,
            input.parserVersion,
            input.rendererVersion,
            input.ocrConfigVersion,
          ],
        );
        const row = existing.rows[0];
        if (row?.document_hash !== input.documentHash || row.block_count !== input.blocks.length) {
          throw new ApplicationError({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'The normalization key already has a different immutable result.',
            correlationId: input.correlationId,
          });
        }
        await client.query('commit');
        return { normalizedDocumentId: row.id, replayed: true, blockCount: row.block_count };
      }
      for (const [expectedOrdinal, block] of input.blocks.entries()) {
        if (
          block.ordinal !== expectedOrdinal ||
          !/^[a-f0-9]{64}$/.test(block.blockKey) ||
          block.text.length < 1 ||
          block.text.length > 100_000
        ) {
          throw new ApplicationError({
            code: 'VALIDATION_FAILED',
            message: 'A normalized block is invalid.',
            correlationId: input.correlationId,
          });
        }
        const locatorJson = JSON.stringify(block.locator);
        const locatorHash = createHash('sha256').update(locatorJson, 'utf8').digest('hex');
        await client.query(
          `insert into source_locators
             (id, workspace_id, project_id, source_artifact_id, source_generation_id,
              normalized_document_id, format, locator_json, locator_hash, audience)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
          [
            block.sourceLocatorId,
            input.workspaceId,
            input.projectId,
            input.sourceArtifactId,
            input.sourceGenerationId,
            input.normalizedDocumentId,
            block.locator.format,
            locatorJson,
            locatorHash,
            sourceRow.audience,
          ],
        );
        await client.query(
          `insert into normalized_blocks
             (id, workspace_id, project_id, source_artifact_id, source_generation_id,
              normalized_document_id, source_locator_id, ordinal, block_key, kind,
              text, extraction, confidence, audience)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            block.id,
            input.workspaceId,
            input.projectId,
            input.sourceArtifactId,
            input.sourceGenerationId,
            input.normalizedDocumentId,
            block.sourceLocatorId,
            block.ordinal,
            block.blockKey,
            block.kind,
            block.text,
            block.extraction,
            block.confidence ?? null,
            sourceRow.audience,
          ],
        );
      }
      const updated = await client.query<{ revision: number }>(
        `update source_artifacts
            set processing_state = 'SUCCEEDED', revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3
          returning revision`,
        [input.workspaceId, input.projectId, input.sourceArtifactId],
      );
      const sourceRevision = updated.rows[0]?.revision;
      if (sourceRevision === undefined) throw safeNotFound(input.correlationId);
      await this.writeAuditOutbox(client, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actorId: await this.sourceUploader(client, input.sourceArtifactId),
        sourceArtifactId: input.sourceArtifactId,
        revision: sourceRevision,
        correlationId: input.correlationId,
        action: 'source.parse-completed',
        eventType: 'source.parse-completed.v1',
        state: 'SUCCEEDED',
      });
      await client.query('commit');
      return {
        normalizedDocumentId: input.normalizedDocumentId,
        replayed: false,
        blockCount: input.blocks.length,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async loadProcessingSource(
    claim: Parameters<SourceProcessingStore['loadProcessingSource']>[0],
    purpose: Parameters<SourceProcessingStore['loadProcessingSource']>[1],
  ): Promise<ProcessingSource> {
    if (claim.sourceArtifactId === null || claim.sourceGenerationId === null) {
      throw new Error('DOCUMENT_JOB_SOURCE_MISSING');
    }
    const result = await this.pool.query<{
      workspace_id: string;
      project_id: string;
      source_artifact_id: string;
      source_generation_id: string;
      format: ProcessingSource['format'];
      declared_media_type: string;
      actual_sha256: string;
      actual_byte_size: number | string;
      object_manifest_id: string;
      object_key: string;
      audience: ProcessingSource['audience'];
    }>(
      `select sa.workspace_id, sa.project_id, sa.id as source_artifact_id,
              sg.id as source_generation_id, sa.format, sg.declared_media_type,
              sg.actual_sha256, sg.actual_byte_size, om.id as object_manifest_id,
              om.object_key, sa.audience
         from source_artifacts sa
         join source_generations sg
           on sg.workspace_id = sa.workspace_id and sg.project_id = sa.project_id
          and sg.id = sa.current_generation_id and sg.source_artifact_id = sa.id
         join object_manifests om
           on om.workspace_id = sg.workspace_id and om.project_id = sg.project_id
          and om.source_generation_id = sg.id and om.source_artifact_id = sa.id
        where sa.workspace_id = $1 and sa.project_id = $2 and sa.id = $3
          and sg.id = $4 and sa.retention_state = 'ACTIVE'
          and (($5::object_manifest_purpose = 'QUARANTINE'
                and sa.processing_state = 'SCANNING')
            or ($5::object_manifest_purpose = 'PRIMARY'
                and sa.processing_state in ('PROCESSING', 'SUCCEEDED')))
          and om.purpose = $5::object_manifest_purpose and om.replica = 0
          and om.state = 'AVAILABLE'`,
      [
        claim.workspaceId,
        claim.projectId,
        claim.sourceArtifactId,
        claim.sourceGenerationId,
        purpose,
      ],
    );
    const row = result.rows[0];
    if (
      row === undefined ||
      !/^[a-f0-9]{64}$/.test(row.actual_sha256) ||
      Number(row.actual_byte_size) < 1
    ) {
      throw safeNotFound(claim.correlationId);
    }
    return {
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      sourceArtifactId: row.source_artifact_id,
      sourceGenerationId: row.source_generation_id,
      format: row.format,
      declaredMediaType: row.declared_media_type,
      actualSha256: row.actual_sha256,
      actualByteSize: Number(row.actual_byte_size),
      objectManifestId: row.object_manifest_id,
      objectKey: row.object_key,
      audience: row.audience,
    };
  }

  async readProcessingObject(source: ProcessingSource, maximumBytes: number): Promise<Uint8Array> {
    const stream = await this.storage.get(source.objectKey);
    if (stream === undefined) throw new Error('SOURCE_OBJECT_MISSING');
    const chunks: Uint8Array[] = [];
    let byteSize = 0;
    const hash = createHash('sha256');
    for await (const chunk of stream) {
      byteSize += chunk.byteLength;
      if (byteSize > maximumBytes || byteSize > source.actualByteSize) {
        throw new Error('PARSER_SIZE_LIMIT');
      }
      hash.update(chunk);
      chunks.push(chunk);
    }
    if (byteSize !== source.actualByteSize || hash.digest('hex') !== source.actualSha256) {
      throw new Error('OCR_INPUT_HASH_MISMATCH');
    }
    const body = new Uint8Array(byteSize);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  async promoteScannedSource(
    claim: Parameters<SourceProcessingStore['promoteScannedSource']>[0],
    input: Parameters<SourceProcessingStore['promoteScannedSource']>[1],
  ): Promise<{ replayed: boolean }> {
    try {
      const existing = await this.loadProcessingSource(claim, 'PRIMARY');
      if (
        existing.objectKey !== input.primaryObjectKey ||
        existing.actualSha256 !== claim.inputHash
      ) {
        throw new Error('IMMUTABLE_MANIFEST_MISMATCH');
      }
      return { replayed: true };
    } catch (error) {
      if (!(error instanceof ApplicationError && error.code === 'NOT_FOUND')) throw error;
    }
    const source = await this.loadProcessingSource(claim, 'QUARANTINE');
    const orphan = await this.storage.head(input.primaryObjectKey);
    if (orphan === undefined) {
      await this.storage.copyImmutable(source.objectKey, input.primaryObjectKey, {
        contentType: source.declaredMediaType,
        checksumSha256: source.actualSha256,
      });
    } else if (
      orphan.contentLength !== source.actualByteSize ||
      orphan.contentType !== source.declaredMediaType
    ) {
      throw new Error('IMMUTABLE_OBJECT_MISMATCH');
    }
    await this.verifyStoredObject(
      input.primaryObjectKey,
      source.actualByteSize,
      source.actualSha256,
    );
    const client = await this.pool.connect();
    let replayed = false;
    try {
      await client.query('begin');
      const inserted = await client.query(
        `insert into object_manifests
           (id, workspace_id, project_id, source_artifact_id, source_generation_id,
            purpose, replica, object_key, byte_size, media_type, sha256, state, verified_at)
         values ($1, $2, $3, $4, $5, 'PRIMARY', 0, $6, $7, $8, $9, 'AVAILABLE', now())
         on conflict (source_generation_id, purpose, replica) do nothing
         returning id`,
        [
          input.primaryManifestId,
          source.workspaceId,
          source.projectId,
          source.sourceArtifactId,
          source.sourceGenerationId,
          input.primaryObjectKey,
          source.actualByteSize,
          source.declaredMediaType,
          source.actualSha256,
        ],
      );
      replayed = (inserted.rowCount ?? 0) === 0;
      if (replayed) {
        const existing = await client.query<{ object_key: string; sha256: string }>(
          `select object_key, sha256 from object_manifests
            where source_generation_id = $1 and purpose = 'PRIMARY' and replica = 0`,
          [source.sourceGenerationId],
        );
        if (
          existing.rows[0]?.object_key !== input.primaryObjectKey ||
          existing.rows[0]?.sha256 !== source.actualSha256
        ) {
          throw new Error('IMMUTABLE_MANIFEST_MISMATCH');
        }
      }
      const updated = await client.query(
        `update source_artifacts
            set processing_state = 'PROCESSING', revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3
            and current_generation_id = $4 and retention_state = 'ACTIVE'
            and processing_state = 'SCANNING'
          returning revision`,
        [source.workspaceId, source.projectId, source.sourceArtifactId, source.sourceGenerationId],
      );
      if ((updated.rowCount ?? 0) === 0 && !replayed) throw safeNotFound(claim.correlationId);
      await client.query(
        `update source_generations set detected_media_type = $2
          where id = $1 and detected_media_type is null`,
        [source.sourceGenerationId, input.detectedMediaType],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await this.storage.delete(source.objectKey);
    await this.pool.query(
      `update object_manifests
          set state = 'DELETED', deleted_at = now(), updated_at = now()
        where id = $1 and state = 'AVAILABLE'`,
      [source.objectManifestId],
    );
    return { replayed };
  }

  private async verifyStoredObject(
    objectKey: string,
    expectedByteSize: number,
    expectedSha256: string,
  ): Promise<void> {
    const stream = await this.storage.get(objectKey);
    if (stream === undefined) throw new Error('IMMUTABLE_OBJECT_MISSING');
    const hash = createHash('sha256');
    let byteSize = 0;
    for await (const chunk of stream) {
      byteSize += chunk.byteLength;
      if (byteSize > expectedByteSize) throw new Error('IMMUTABLE_OBJECT_MISMATCH');
      hash.update(chunk);
    }
    if (byteSize !== expectedByteSize || hash.digest('hex') !== expectedSha256) {
      throw new Error('IMMUTABLE_OBJECT_MISMATCH');
    }
  }

  private async verifyObjectIn(
    storage: SourceUploadStorageGateway,
    objectKey: string,
    expectedByteSize: number,
    expectedSha256: string,
  ): Promise<void> {
    const stream = await storage.get(objectKey);
    if (stream === undefined) throw new Error('IMMUTABLE_OBJECT_MISSING');
    const hash = createHash('sha256');
    let byteSize = 0;
    for await (const chunk of stream) {
      byteSize += chunk.byteLength;
      if (byteSize > expectedByteSize) throw new Error('IMMUTABLE_OBJECT_MISMATCH');
      hash.update(chunk);
    }
    if (byteSize !== expectedByteSize || hash.digest('hex') !== expectedSha256) {
      throw new Error('IMMUTABLE_OBJECT_MISMATCH');
    }
  }

  private async createUploadSessionTransaction(
    command: CreateSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult> {
    const hash = commandHash('createUploadSession', command);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const roles = await this.requireUploadRole(
        client,
        command.actorId,
        command.workspaceId,
        command.projectId,
        command.correlationId,
      );
      if (
        roles.length === 1 &&
        roles[0] === 'CLIENT_STAKEHOLDER' &&
        command.command.audience !== 'CLIENT_VISIBLE'
      ) {
        throw safeNotFound(command.correlationId);
      }
      const replay = await this.beginIdempotency(client, command, hash);
      if (replay !== null) {
        await client.query('commit');
        return replay;
      }
      if (command.expectedRevision !== 0) {
        throw new ApplicationError({
          code: 'REVISION_CONFLICT',
          message: 'A new source must start at revision zero.',
          correlationId: command.correlationId,
          currentRevision: 0,
        });
      }
      const classified = classifyDeclaredSource(
        command.command.displayName,
        command.command.declaredMediaType,
      );
      assertSourceByteSize(command.command.declaredByteSize);
      await client.query(
        `insert into source_project_quotas (workspace_id, project_id)
         values ($1, $2)
         on conflict do nothing`,
        [command.workspaceId, command.projectId],
      );
      const quotaResult = await client.query<{
        retained_bytes: number | string;
        reserved_bytes: number | string;
      }>(
        `select retained_bytes, reserved_bytes
           from source_project_quotas
          where workspace_id = $1 and project_id = $2
          for update`,
        [command.workspaceId, command.projectId],
      );
      const quota = quotaResult.rows[0];
      if (quota === undefined) throw new Error('Project source quota row was not created.');
      try {
        assertProjectQuota({
          retainedBytes: Number(quota.retained_bytes),
          reservedBytes: Number(quota.reserved_bytes),
          requestedBytes: command.command.declaredByteSize,
        });
      } catch (error) {
        throw new ApplicationError({
          code: 'QUOTA_EXCEEDED',
          message: 'The project source quota would be exceeded.',
          correlationId: command.correlationId,
          cause: error,
        });
      }
      const objectKey = quarantineKey(command);
      const expiresAt = new Date(Date.now() + 300_000);
      await client.query(
        `insert into source_artifacts
           (id, workspace_id, project_id, current_generation_id, display_name, format,
            audience, processing_state, retention_state, revision, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, 'QUEUED', 'ACTIVE', 1, $8)`,
        [
          command.sourceArtifactId,
          command.workspaceId,
          command.projectId,
          command.sourceGenerationId,
          classified.displayName,
          classified.format,
          command.command.audience,
          command.actorId,
        ],
      );
      await client.query(
        `insert into source_generations
           (id, workspace_id, project_id, source_artifact_id, generation_number,
            declared_media_type, declared_byte_size, expected_sha256)
         values ($1, $2, $3, $4, 1, $5, $6, $7)`,
        [
          command.sourceGenerationId,
          command.workspaceId,
          command.projectId,
          command.sourceArtifactId,
          command.command.declaredMediaType,
          command.command.declaredByteSize,
          command.command.checksumSha256,
        ],
      );
      await client.query(
        `insert into source_upload_sessions
           (id, workspace_id, project_id, source_artifact_id, source_generation_id,
            quarantine_manifest_id, state, revision, reserved_bytes, expected_sha256,
            expected_sha256_base64, expires_at, created_by)
         values ($1, $2, $3, $4, $5, $6, 'OPEN', 1, $7, $8, $9, $10, $11)`,
        [
          command.uploadSessionId,
          command.workspaceId,
          command.projectId,
          command.sourceArtifactId,
          command.sourceGenerationId,
          command.objectManifestId,
          command.command.declaredByteSize,
          command.command.checksumSha256,
          command.command.checksumSha256Base64,
          expiresAt,
          command.actorId,
        ],
      );
      await client.query(
        `insert into source_quota_reservations
           (id, workspace_id, project_id, upload_session_id, byte_size)
         values ($1, $2, $3, $4, $5)`,
        [
          uuidv7(),
          command.workspaceId,
          command.projectId,
          command.uploadSessionId,
          command.command.declaredByteSize,
        ],
      );
      await client.query(
        `update source_project_quotas
            set reserved_bytes = reserved_bytes + $3, revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2`,
        [command.workspaceId, command.projectId, command.command.declaredByteSize],
      );
      await client.query(
        `insert into object_manifests
           (id, workspace_id, project_id, source_artifact_id, source_generation_id,
            purpose, replica, object_key, byte_size, media_type, sha256, state)
         values ($1, $2, $3, $4, $5, 'QUARANTINE', 0, $6, $7, $8, $9, 'PENDING')`,
        [
          command.objectManifestId,
          command.workspaceId,
          command.projectId,
          command.sourceArtifactId,
          command.sourceGenerationId,
          objectKey,
          command.command.declaredByteSize,
          command.command.declaredMediaType,
          command.command.checksumSha256,
        ],
      );
      await this.writeAuditOutbox(client, {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        actorId: command.actorId,
        sourceArtifactId: command.sourceArtifactId,
        revision: 1,
        correlationId: command.correlationId,
        action: 'source.upload-session-created',
        eventType: 'source.upload-session-created.v1',
        state: 'OPEN',
      });
      const result = sourceUploadSessionResultSchema.parse({
        schemaVersion: '1',
        sourceArtifactId: command.sourceArtifactId,
        sourceGenerationId: command.sourceGenerationId,
        uploadSessionId: command.uploadSessionId,
        revision: 1,
        state: 'OPEN',
        upload: null,
        correlationId: command.correlationId,
      });
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async completeVerifiedUpload(
    command: CompleteSourceUploadSessionCommand,
    session: UploadSessionRow,
    actualSha256: string,
    actualByteSize: number,
  ): Promise<SourceUploadSessionResult> {
    const hash = commandHash('completeUploadSession', command);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await this.requireUploadRole(
        client,
        command.actorId,
        command.workspaceId,
        command.projectId,
        command.correlationId,
      );
      const replay = await this.beginIdempotency(client, command, hash);
      if (replay !== null) {
        await client.query('commit');
        return replay;
      }
      const selected = await client.query<UploadSessionRow>(
        this.uploadSessionSelect('for update'),
        [command.workspaceId, command.projectId, command.uploadSessionId],
      );
      const locked = selected.rows[0];
      if (
        locked?.source_artifact_id !== command.sourceArtifactId ||
        locked.source_generation_id !== command.sourceGenerationId
      ) {
        throw safeNotFound(command.correlationId);
      }
      if (locked.state !== 'OPEN' || locked.revision !== command.expectedRevision) {
        throw new ApplicationError({
          code: 'REVISION_CONFLICT',
          message: 'The upload session changed. Reload it and retry.',
          correlationId: command.correlationId,
          currentRevision: locked.revision,
        });
      }
      await this.releaseReservation(client, locked, 'CONSUMED');
      await client.query(
        `update source_project_quotas
            set retained_bytes = retained_bytes + $3,
                revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2`,
        [command.workspaceId, command.projectId, actualByteSize],
      );
      await client.query(
        `update source_upload_sessions
            set state = 'COMPLETED', revision = revision + 1,
                completed_at = now(), updated_at = now()
          where id = $1`,
        [locked.id],
      );
      await client.query(
        `update source_generations
            set actual_byte_size = $2, actual_sha256 = $3
          where id = $1 and actual_sha256 is null`,
        [locked.source_generation_id, actualByteSize, actualSha256],
      );
      await client.query(
        `update object_manifests
            set state = 'AVAILABLE', verified_at = now(), updated_at = now()
          where id = $1 and state = 'PENDING'`,
        [locked.quarantine_manifest_id],
      );
      await client.query(
        `update source_artifacts
            set processing_state = 'SCANNING', revision = revision + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.sourceArtifactId],
      );
      const result = sourceUploadSessionResultSchema.parse({
        schemaVersion: '1',
        sourceArtifactId: command.sourceArtifactId,
        sourceGenerationId: command.sourceGenerationId,
        uploadSessionId: command.uploadSessionId,
        revision: locked.revision + 1,
        state: 'COMPLETED',
        upload: null,
        correlationId: command.correlationId,
      });
      await this.writeAuditOutbox(client, {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        actorId: command.actorId,
        sourceArtifactId: command.sourceArtifactId,
        revision: locked.revision + 1,
        correlationId: command.correlationId,
        action: 'source.upload-completed',
        eventType: 'source.scan-requested.v1',
        state: 'SCANNING',
        sourceGenerationId: command.sourceGenerationId,
        inputHash: actualSha256,
      });
      await this.finishIdempotency(client, command, result);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async failUploadVerification(
    command: CompleteSourceUploadSessionCommand,
    session: UploadSessionRow,
    failureCode: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const selected = await client.query<UploadSessionRow>(
        this.uploadSessionSelect('for update'),
        [command.workspaceId, command.projectId, command.uploadSessionId],
      );
      const locked = selected.rows[0];
      if (locked?.state !== 'OPEN') {
        await client.query('commit');
        return;
      }
      await this.releaseReservation(client, locked, 'RELEASED');
      await client.query(
        `update source_upload_sessions
            set state = 'FAILED', revision = revision + 1,
                failure_code = $2, updated_at = now()
          where id = $1`,
        [locked.id, failureCode],
      );
      await client.query(
        `update source_artifacts
            set processing_state = 'FAILED', revision = revision + 1, updated_at = now()
          where id = $1`,
        [locked.source_artifact_id],
      );
      await client.query(
        `update object_manifests set state = 'FAILED', updated_at = now() where id = $1`,
        [locked.quarantine_manifest_id],
      );
      await this.writeAuditOutbox(client, {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        actorId: command.actorId,
        sourceArtifactId: command.sourceArtifactId,
        revision: locked.revision + 1,
        correlationId: command.correlationId,
        action: 'source.upload-failed',
        eventType: 'source.upload-failed.v1',
        state: 'FAILED',
        errorCode: failureCode,
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    void session;
  }

  private async failOpenSessionAfterCapabilityError(
    command: CreateSourceUploadSessionCommand,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const selected = await client.query<UploadSessionRow>(
        this.uploadSessionSelect('for update'),
        [command.workspaceId, command.projectId, command.uploadSessionId],
      );
      const session = selected.rows[0];
      if (session?.state === 'OPEN') {
        await this.releaseReservation(client, session, 'RELEASED');
        await client.query(
          `update source_upload_sessions
              set state = 'FAILED', revision = revision + 1,
                  failure_code = 'DEPENDENCY_UNAVAILABLE', updated_at = now()
            where id = $1`,
          [session.id],
        );
        await client.query(
          `update source_artifacts
              set processing_state = 'FAILED', revision = revision + 1, updated_at = now()
            where id = $1`,
          [session.source_artifact_id],
        );
      }
      const failedResult = sourceUploadSessionResultSchema.parse({
        schemaVersion: '1',
        sourceArtifactId: command.sourceArtifactId,
        sourceGenerationId: command.sourceGenerationId,
        uploadSessionId: command.uploadSessionId,
        revision: 2,
        state: 'FAILED',
        upload: null,
        correlationId: command.correlationId,
      });
      await this.finishIdempotency(client, command, failedResult);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async getAuthorizedUploadSession(
    actorId: string,
    workspaceId: string,
    projectId: string,
    uploadSessionId: string,
    correlationId: string,
  ): Promise<UploadSessionRow> {
    await this.requireUploadRole(this.pool, actorId, workspaceId, projectId, correlationId);
    const result = await this.pool.query<UploadSessionRow>(this.uploadSessionSelect(''), [
      workspaceId,
      projectId,
      uploadSessionId,
    ]);
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound(correlationId);
    return row;
  }

  private uploadSessionSelect(suffix: string): string {
    return `select us.id, us.workspace_id, us.project_id, us.source_artifact_id,
                   us.source_generation_id, us.quarantine_manifest_id, om.object_key,
                   us.state, us.revision, us.reserved_bytes, us.expected_sha256,
                   us.expected_sha256_base64, sg.declared_media_type, us.expires_at
              from source_upload_sessions us
              join source_generations sg
                on sg.workspace_id = us.workspace_id
               and sg.project_id = us.project_id
               and sg.id = us.source_generation_id
              join object_manifests om
                on om.workspace_id = us.workspace_id
               and om.project_id = us.project_id
               and om.id = us.quarantine_manifest_id
             where us.workspace_id = $1 and us.project_id = $2 and us.id = $3 ${suffix}`;
  }

  private async requireUploadRole(
    client: Pick<PoolClient, 'query'> | DatabasePool,
    actorId: string,
    workspaceId: string,
    projectId: string,
    correlationId: string,
  ): Promise<AuthorizationRow['roles']> {
    const roles = await this.requireProjectAccess(
      client,
      actorId,
      workspaceId,
      projectId,
      correlationId,
    );
    if (
      roles.every(
        (role) =>
          role !== 'PM' &&
          role !== 'LEAD' &&
          role !== 'CONTRIBUTOR' &&
          role !== 'CLIENT_STAKEHOLDER',
      )
    ) {
      throw safeNotFound(correlationId);
    }
    return roles;
  }

  private async requireProjectAccess(
    client: Pick<PoolClient, 'query'> | DatabasePool,
    actorId: string,
    workspaceId: string,
    projectId: string,
    correlationId: string,
  ): Promise<AuthorizationRow['roles']> {
    const result = await client.query<AuthorizationRow>(
      `select array_agg(pmr.role order by pmr.role)::text[] as roles
         from project_memberships pm
         join workspace_memberships wm
           on wm.workspace_id = pm.workspace_id and wm.user_id = pm.user_id
          and wm.state = 'ACTIVE'
         join project_membership_roles pmr
           on pmr.workspace_id = pm.workspace_id
          and pmr.project_id = pm.project_id
          and pmr.user_id = pm.user_id
        where pm.workspace_id = $1 and pm.project_id = $2 and pm.user_id = $3
          and pm.state = 'ACTIVE'
        group by pm.workspace_id, pm.project_id, pm.user_id`,
      [workspaceId, projectId, actorId],
    );
    const roles = result.rows[0]?.roles;
    if (roles === undefined || roles.length === 0) throw safeNotFound(correlationId);
    return roles;
  }

  private async beginIdempotency(
    client: PoolClient,
    command: UploadCommand,
    hash: string,
  ): Promise<SourceUploadSessionResult | null> {
    const inserted = await client.query(
      `insert into idempotency_records
         (workspace_id, idempotency_key, request_hash, status, correlation_id)
       values ($1, $2, $3, 'PROCESSING', $4)
       on conflict do nothing
       returning idempotency_key`,
      [command.workspaceId, command.idempotencyKey, hash, command.correlationId],
    );
    if ((inserted.rowCount ?? 0) > 0) return null;
    return this.replayOrRejectWithClient(client, command, hash);
  }

  private async replayOrReject(
    command: UploadCommand,
    hash: string,
  ): Promise<SourceUploadSessionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await this.replayOrRejectWithClient(client, command, hash);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async replayOrRejectWithClient(
    client: PoolClient,
    command: UploadCommand,
    hash: string,
  ): Promise<SourceUploadSessionResult> {
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
    return sourceUploadSessionResultSchema.parse(row.result);
  }

  private async completeIdempotency(
    command: CreateSourceUploadSessionCommand,
    result: SourceUploadSessionResult,
  ): Promise<void> {
    await this.pool.query(
      `update idempotency_records
          set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
        where workspace_id = $1 and idempotency_key = $2 and status = 'PROCESSING'`,
      [command.workspaceId, command.idempotencyKey, JSON.stringify({ ...result, upload: null })],
    );
  }

  private async finishIdempotency(
    client: PoolClient,
    command: UploadCommand,
    result: SourceUploadSessionResult,
  ): Promise<void> {
    await client.query(
      `update idempotency_records
          set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
        where workspace_id = $1 and idempotency_key = $2`,
      [command.workspaceId, command.idempotencyKey, JSON.stringify({ ...result, upload: null })],
    );
  }

  private async releaseReservation(
    client: PoolClient,
    session: UploadSessionRow,
    state: 'CONSUMED' | 'RELEASED',
  ): Promise<void> {
    await client.query(
      `update source_project_quotas
          set reserved_bytes = reserved_bytes - $3,
              revision = revision + 1, updated_at = now()
        where workspace_id = $1 and project_id = $2 and reserved_bytes >= $3`,
      [session.workspace_id, session.project_id, session.reserved_bytes],
    );
    await client.query(
      `update source_quota_reservations
          set state = $2, released_at = now()
        where upload_session_id = $1 and state = 'ACTIVE'`,
      [session.id, state],
    );
  }

  private async sourceUploader(client: PoolClient, sourceArtifactId: string): Promise<string> {
    const result = await client.query<{ uploaded_by: string }>(
      `select uploaded_by from source_artifacts where id = $1`,
      [sourceArtifactId],
    );
    const actorId = result.rows[0]?.uploaded_by;
    if (actorId === undefined) throw safeNotFound();
    return actorId;
  }

  private async writeAuditOutbox(
    client: PoolClient,
    input: {
      workspaceId: string;
      projectId: string;
      actorId: string;
      sourceArtifactId: string;
      revision: number;
      correlationId: string;
      action: string;
      eventType: string;
      state: string;
      reason?: string;
      errorCode?: string;
      sourceGenerationId?: string;
      inputHash?: string;
    },
  ): Promise<void> {
    const auditId = uuidv7();
    const eventId = uuidv7();
    const occurredAt = new Date().toISOString();
    await client.query(
      `insert into audit_events
         (id, workspace_id, project_id, actor_id, action, target_type, target_id,
          correlation_id, reason, after_summary, occurred_at)
       values ($1, $2, $3, $4, $5, 'SourceArtifact', $6, $7, $8, $9::jsonb, $10)`,
      [
        auditId,
        input.workspaceId,
        input.projectId,
        input.actorId,
        input.action,
        input.sourceArtifactId,
        input.correlationId,
        input.reason ?? null,
        JSON.stringify({
          revision: input.revision,
          state: input.state,
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
        }),
        occurredAt,
      ],
    );
    const payload = {
      schemaVersion: '1',
      eventId,
      eventType: input.eventType,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      sourceArtifactId: input.sourceArtifactId,
      ...(input.sourceGenerationId === undefined
        ? {}
        : { sourceGenerationId: input.sourceGenerationId }),
      ...(input.inputHash === undefined ? {} : { inputHash: input.inputHash }),
      aggregateRevision: input.revision,
      correlationId: input.correlationId,
      occurredAt,
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    };
    await client.query(
      `insert into outbox_events
         (id, workspace_id, aggregate_type, aggregate_id, aggregate_revision,
          event_type, schema_version, payload, correlation_id, occurred_at)
       values ($1, $2, 'SourceArtifact', $3, $4, $5, '1', $6::jsonb, $7, $8)`,
      [
        eventId,
        input.workspaceId,
        input.sourceArtifactId,
        input.revision,
        input.eventType,
        JSON.stringify(payload),
        input.correlationId,
        occurredAt,
      ],
    );
  }
}
