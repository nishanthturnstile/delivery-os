import { createHash } from 'node:crypto';

import {
  ApplicationError,
  type ArtifactCommandStore,
  type ArtifactExportStorage,
  type ArtifactQueryStore,
} from '@delivery-os/application';
import {
  approvalDecisionRecordSchema,
  artifactAttachmentSchema,
  artifactBaselineSchema,
  artifactCommentSchema,
  artifactDraftRevisionSchema,
  artifactExportSchema,
  artifactMutationResultSchema,
  artifactSchema,
  reviewSnapshotSchema,
  type ApprovalDecisionRecord,
  type Artifact,
  type ArtifactAttachment,
  type ArtifactBaseline,
  type ArtifactComment,
  type ArtifactDraftRevision,
  type ArtifactExport,
  type ArtifactMutationResult,
  type CancelArtifactExportCommand,
  type CancelApprovalRequestCommand,
  type CreateArtifactCommand,
  type CreateArtifactCommentCommand,
  type CreateArtifactDeltaCommand,
  type DecideArtifactApprovalCommand,
  type MutateArtifactCommentCommand,
  type RegisterArtifactAttachmentCommand,
  type RemoveArtifactAttachmentCommand,
  type RequestArtifactExportCommand,
  type ReviewSnapshot,
  type SaveDraftRevisionCommand,
  type SetArtifactAudienceCommand,
  type SubmitArtifactForReviewCommand,
} from '@delivery-os/contracts';
import {
  approvalSlotsSatisfied,
  canViewArtifactAudience,
  evaluateRequirementReadiness,
  sha256CanonicalJson,
  validateDecisionComment,
  type ArtifactApprovalSlot,
  type ArtifactAudience,
  type ArtifactKindRegistry,
  type ArtifactRole,
} from '@delivery-os/domain';
import { requirementBodySchema, type RequirementFieldDefinition } from '@delivery-os/contracts';
import type { PoolClient, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

type ArtifactCommand =
  | CreateArtifactCommand
  | SaveDraftRevisionCommand
  | SubmitArtifactForReviewCommand
  | DecideArtifactApprovalCommand
  | CancelApprovalRequestCommand
  | SetArtifactAudienceCommand
  | CreateArtifactCommentCommand
  | MutateArtifactCommentCommand
  | CreateArtifactDeltaCommand
  | RegisterArtifactAttachmentCommand
  | RemoveArtifactAttachmentCommand
  | RequestArtifactExportCommand
  | CancelArtifactExportCommand;

type ArtifactRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  project_id: string;
  kind_key: string;
  schema_version: string;
  policy_version: string;
  title: string;
  state: Artifact['state'];
  audience: ArtifactAudience;
  revision: number;
  current_draft_revision_id: string;
  open_approval_request_id: string | null;
  current_baseline_id: string | null;
  next_draft_number: number;
  next_snapshot_number: number;
  next_request_number: number;
  next_baseline_major: number;
  created_at: Date;
  updated_at: Date;
};

type DraftRow = QueryResultRow & {
  id: string;
  artifact_id: string;
  draft_number: number;
  parent_revision_id: string | null;
  schema_version: string;
  canonicalization: 'JCS_RFC8785';
  hash_algorithm: 'SHA256';
  content_hash: string;
  canonical_body: string;
  body_json: unknown;
  created_by: string;
  created_at: Date;
};

type SnapshotRow = QueryResultRow & {
  id: string;
  artifact_id: string;
  draft_revision_id: string;
  snapshot_number: number;
  schema_version: string;
  policy_version: string;
  canonicalization: 'JCS_RFC8785';
  hash_algorithm: 'SHA256';
  content_hash: string;
  canonical_body: string;
  body_json: unknown;
  submitted_by: string;
  created_at: Date;
};

type RequestRow = QueryResultRow & {
  id: string;
  snapshot_id: string;
  state: 'OPEN' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'CANCELLED';
  revision: number;
  required_slots: ArtifactApprovalSlot[];
  binding_decision_id: string | null;
};

type IdempotencyRow = QueryResultRow & {
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
};

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

function toArtifact(row: ArtifactRow): Artifact {
  return artifactSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    kind: row.kind_key,
    schemaVersion: row.schema_version,
    policyVersion: row.policy_version,
    title: row.title,
    state: row.state,
    audience: row.audience,
    revision: row.revision,
    currentDraftRevisionId: row.current_draft_revision_id,
    openApprovalRequestId: row.open_approval_request_id,
    currentBaselineId: row.current_baseline_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function toDraft(row: DraftRow): ArtifactDraftRevision {
  return artifactDraftRevisionSchema.parse({
    id: row.id,
    artifactId: row.artifact_id,
    number: row.draft_number,
    parentRevisionId: row.parent_revision_id,
    schemaVersion: row.schema_version,
    canonicalization: row.canonicalization,
    hashAlgorithm: row.hash_algorithm,
    contentHash: row.content_hash,
    body: row.body_json,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  });
}

function toSnapshot(row: SnapshotRow): ReviewSnapshot {
  return reviewSnapshotSchema.parse({
    id: row.id,
    artifactId: row.artifact_id,
    draftRevisionId: row.draft_revision_id,
    number: row.snapshot_number,
    schemaVersion: row.schema_version,
    policyVersion: row.policy_version,
    canonicalization: row.canonicalization,
    hashAlgorithm: row.hash_algorithm,
    contentHash: row.content_hash,
    body: row.body_json,
    createdBy: row.submitted_by,
    createdAt: row.created_at.toISOString(),
  });
}

function commandHash(operation: string, command: ArtifactCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        operation,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        artifactId: command.artifactId,
        actorId: command.actorId,
        expectedRevision: command.expectedRevision,
        command: command.command,
      }),
    )
    .digest('hex');
}

export class PostgresArtifactStore implements ArtifactCommandStore, ArtifactQueryStore {
  constructor(
    private readonly pool: DatabasePool,
    private readonly registry: ArtifactKindRegistry,
  ) {}

  async listArtifacts(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<Artifact[]> {
    const roles = await this.roles(this.pool, actorId, workspaceId, projectId);
    if (roles.length === 0) throw safeNotFound();
    const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
    const result = await this.pool.query<ArtifactRow>(
      `select *
         from artifacts
        where workspace_id = $1 and project_id = $2
          and ($3::boolean = false or audience = 'CLIENT_VISIBLE')
        order by updated_at desc, id desc`,
      [workspaceId, projectId, clientOnly],
    );
    return result.rows.map(toArtifact);
  }

  async getArtifact(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<Artifact> {
    const { artifact } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    return toArtifact(artifact);
  }

  async getDraft(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactDraftRevision> {
    const { artifact, roles } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    if (roles.includes('CLIENT_STAKEHOLDER')) throw safeNotFound();
    const result = await this.pool.query<DraftRow>(
      `select * from artifact_draft_revisions
        where artifact_id = $1 and id = $2`,
      [artifactId, artifact.current_draft_revision_id],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound();
    return toDraft(row);
  }

  async listDraftHistory(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactDraftRevision[]> {
    const { roles } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    if (roles.includes('CLIENT_STAKEHOLDER')) throw safeNotFound();
    const result = await this.pool.query<DraftRow>(
      `select * from artifact_draft_revisions
        where workspace_id = $1 and project_id = $2 and artifact_id = $3
        order by draft_number desc`,
      [workspaceId, projectId, artifactId],
    );
    return result.rows.map(toDraft);
  }

  async getReviewSnapshot(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    snapshotId: string,
  ): Promise<ReviewSnapshot> {
    const { artifact, roles } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    const result = await this.pool.query<SnapshotRow>(
      `select * from artifact_review_snapshots
        where workspace_id = $1 and project_id = $2 and artifact_id = $3 and id = $4`,
      [workspaceId, projectId, artifactId, snapshotId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound();
    if (!roles.includes('CLIENT_STAKEHOLDER')) return toSnapshot(row);
    const adapter = this.adapter(artifact.kind_key, row.schema_version, {
      correlationId: uuidv7(),
    });
    const historical = adapter.readHistorical(row.canonical_body);
    return toSnapshot({
      ...row,
      body_json: adapter.projectAudience(historical, 'CLIENT_VISIBLE'),
    });
  }

  async listApprovalHistory(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ApprovalDecisionRecord[]> {
    await this.authorizedArtifact(this.pool, actorId, workspaceId, projectId, artifactId);
    const result = await this.pool.query<{
      id: string;
      request_id: string;
      snapshot_id: string;
      slot_key: string;
      scope: 'INTERNAL' | 'EXTERNAL_BINDING';
      decision: 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED';
      actor_id: string;
      actor_role: ArtifactRole;
      comment: string | null;
      snapshot_hash: string;
      decided_at: Date;
    }>(
      `select id, request_id, snapshot_id, slot_key, scope, decision, actor_id,
              actor_role, comment, snapshot_hash, decided_at
         from artifact_approval_decisions
        where workspace_id = $1 and project_id = $2 and artifact_id = $3
        order by decided_at, id`,
      [workspaceId, projectId, artifactId],
    );
    return result.rows.map((row) =>
      approvalDecisionRecordSchema.parse({
        id: row.id,
        requestId: row.request_id,
        snapshotId: row.snapshot_id,
        slotKey: row.slot_key,
        scope: row.scope,
        decision: row.decision,
        actorId: row.actor_id,
        actorRole: row.actor_role,
        comment: row.comment,
        snapshotHash: row.snapshot_hash,
        decidedAt: row.decided_at.toISOString(),
      }),
    );
  }

  async listBaselines(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactBaseline[]> {
    await this.authorizedArtifact(this.pool, actorId, workspaceId, projectId, artifactId);
    const result = await this.pool.query<{
      id: string;
      artifact_id: string;
      major_number: number;
      source_snapshot_id: string;
      content_hash: string;
      schema_version: string;
      state: 'CURRENT' | 'SUPERSEDED';
      created_at: Date;
    }>(
      `select id, artifact_id, major_number, source_snapshot_id, content_hash,
              schema_version, state, created_at
         from artifact_baselines
        where workspace_id = $1 and project_id = $2 and artifact_id = $3
        order by major_number desc`,
      [workspaceId, projectId, artifactId],
    );
    return result.rows.map((row) =>
      artifactBaselineSchema.parse({
        id: row.id,
        artifactId: row.artifact_id,
        majorNumber: row.major_number,
        displayNumber: `${row.major_number}.0`,
        sourceSnapshotId: row.source_snapshot_id,
        contentHash: row.content_hash,
        schemaVersion: row.schema_version,
        state: row.state,
        createdAt: row.created_at.toISOString(),
      }),
    );
  }

  async getAuthoritativeContext(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<{ artifact: Artifact; baseline: ArtifactBaseline; body: unknown }> {
    const artifact = await this.getArtifact(actorId, workspaceId, projectId, artifactId);
    if (artifact.currentBaselineId === null) throw safeNotFound();
    const baseline = (await this.listBaselines(actorId, workspaceId, projectId, artifactId)).find(
      (item) => item.id === artifact.currentBaselineId,
    );
    if (baseline === undefined) throw safeNotFound();
    const snapshot = await this.getReviewSnapshot(
      actorId,
      workspaceId,
      projectId,
      artifactId,
      baseline.sourceSnapshotId,
    );
    return { artifact, baseline, body: snapshot.body };
  }

  async listComments(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    targetId: string,
  ): Promise<ArtifactComment[]> {
    const { roles } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
    const result = await this.pool.query<{
      id: string;
      artifact_id: string;
      target_type: string;
      target_id: string;
      body: string | null;
      effective_audience: ArtifactAudience;
      state: string;
      revision: number;
      author_id: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `select comment.*, audience.effective_audience
         from artifact_comments comment
         join artifact_audiences audience on audience.id = comment.audience_id
        where comment.workspace_id = $1 and comment.project_id = $2
          and comment.artifact_id = $3 and comment.target_id = $4
          and ($5::boolean = false or audience.effective_audience = 'CLIENT_VISIBLE')
        order by comment.created_at, comment.id`,
      [workspaceId, projectId, artifactId, targetId, clientOnly],
    );
    return result.rows.map((row) =>
      artifactCommentSchema.parse({
        id: row.id,
        artifactId: row.artifact_id,
        targetType: row.target_type,
        targetId: row.target_id,
        body: row.body,
        audience: row.effective_audience,
        state: row.state,
        revision: row.revision,
        authorId: row.author_id,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }),
    );
  }

  async listAttachments(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    targetId: string,
  ): Promise<ArtifactAttachment[]> {
    const { roles } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
    const result = await this.pool.query<{
      id: string;
      artifact_id: string;
      target_type: string;
      target_id: string;
      display_name: string;
      media_type: string;
      byte_size: number;
      effective_audience: ArtifactAudience;
      state: string;
      revision: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `select attachment.id, attachment.artifact_id, attachment.target_type,
              attachment.target_id, attachment.display_name, attachment.media_type,
              attachment.byte_size::integer as byte_size, audience.effective_audience, attachment.state,
              attachment.revision, attachment.created_at, attachment.updated_at
         from artifact_attachments attachment
         join artifact_audiences audience on audience.id = attachment.audience_id
        where attachment.workspace_id = $1 and attachment.project_id = $2
          and attachment.artifact_id = $3 and attachment.target_id = $4
          and attachment.state <> 'REMOVED'
          and ($5::boolean = false or (
            audience.effective_audience = 'CLIENT_VISIBLE' and attachment.state = 'AVAILABLE'
          ))
        order by attachment.created_at, attachment.id`,
      [workspaceId, projectId, artifactId, targetId, clientOnly],
    );
    return result.rows.map((row) =>
      artifactAttachmentSchema.parse({
        id: row.id,
        artifactId: row.artifact_id,
        targetType: row.target_type,
        targetId: row.target_id,
        displayName: row.display_name,
        mediaType: row.media_type,
        byteSize: row.byte_size,
        audience: row.effective_audience,
        state: row.state,
        revision: row.revision,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }),
    );
  }

  async compareVersions(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    beforeSnapshotId: string,
    afterSnapshotId: string,
  ) {
    const { artifact, roles } = await this.authorizedArtifact(
      this.pool,
      actorId,
      workspaceId,
      projectId,
      artifactId,
    );
    const result = await this.pool.query<SnapshotRow>(
      `select * from artifact_review_snapshots
        where workspace_id = $1 and project_id = $2 and artifact_id = $3
          and id = any($4::uuid[])`,
      [workspaceId, projectId, artifactId, [beforeSnapshotId, afterSnapshotId]],
    );
    const before = result.rows.find((row) => row.id === beforeSnapshotId);
    const after = result.rows.find((row) => row.id === afterSnapshotId);
    if (before === undefined || after === undefined) throw safeNotFound();
    const adapter = this.adapter(artifact.kind_key, artifact.schema_version, {
      correlationId: uuidv7(),
    });
    return adapter.diff(
      adapter.readHistorical(before.canonical_body),
      adapter.readHistorical(after.canonical_body),
      roles.includes('CLIENT_STAKEHOLDER') ? 'CLIENT_VISIBLE' : 'TEAM_ONLY',
    );
  }

  async buildSearchProjection(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<{ artifactId: string; title: string; audience: string; body: unknown }> {
    const context = await this.getAuthoritativeContext(actorId, workspaceId, projectId, artifactId);
    return {
      artifactId,
      title: context.artifact.title,
      audience: context.artifact.audience,
      body: context.body,
    };
  }

  async getExportStatus(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    exportId: string,
  ): Promise<ArtifactExport> {
    await this.authorizedArtifact(this.pool, actorId, workspaceId, projectId, artifactId);
    const result = await this.pool.query<{
      id: string;
      artifact_id: string;
      target_type: string;
      target_id: string;
      format: string;
      audience: ArtifactAudience;
      state: string;
      revision: number;
      content_hash: string | null;
      expires_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `select id, artifact_id, target_type, target_id, format, audience, state,
              revision, content_hash, expires_at, created_at, updated_at
         from artifact_export_requests
        where workspace_id = $1 and project_id = $2 and artifact_id = $3
          and id = $4 and requester_id = $5`,
      [workspaceId, projectId, artifactId, exportId, actorId],
    );
    const row = result.rows[0];
    if (row === undefined) throw safeNotFound();
    return artifactExportSchema.parse({
      id: row.id,
      artifactId: row.artifact_id,
      targetType: row.target_type,
      targetId: row.target_id,
      format: row.format,
      audience: row.audience,
      state: row.state,
      revision: row.revision,
      contentHash: row.content_hash,
      expiresAt: row.expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  async renderExport(
    exportId: string,
    storage: ArtifactExportStorage,
    terminalOnFailure = false,
  ): Promise<boolean> {
    const claimed = await this.pool.query<{
      id: string;
      workspace_id: string;
      project_id: string;
      artifact_id: string;
      target_type: 'REVIEW_SNAPSHOT' | 'BASELINE';
      target_id: string;
      audience: ArtifactAudience;
      requester_id: string;
    }>(
      `update artifact_export_requests
          set state = 'PROCESSING', revision = revision + 1,
              permission_checked_at = now(), updated_at = now()
        where id = $1 and state = 'PENDING'
        returning id, workspace_id, project_id, artifact_id, target_type, target_id,
                  audience, requester_id`,
      [exportId],
    );
    const request = claimed.rows[0];
    if (request === undefined) return false;
    try {
      const { artifact, roles } = await this.authorizedArtifact(
        this.pool,
        request.requester_id,
        request.workspace_id,
        request.project_id,
        request.artifact_id,
      );
      const snapshotResult = await this.pool.query<SnapshotRow>(
        request.target_type === 'BASELINE'
          ? `select snapshot.*
               from artifact_baselines baseline
               join artifact_review_snapshots snapshot on snapshot.id = baseline.source_snapshot_id
               join artifact_audiences audience on audience.id = baseline.audience_id
              where baseline.workspace_id = $1 and baseline.project_id = $2
                and baseline.artifact_id = $3 and baseline.id = $4
                and ($5::boolean = false or audience.effective_audience = 'CLIENT_VISIBLE')`
          : `select snapshot.*
               from artifact_review_snapshots snapshot
               join artifact_audiences audience on audience.id = snapshot.audience_id
              where snapshot.workspace_id = $1 and snapshot.project_id = $2
                and snapshot.artifact_id = $3 and snapshot.id = $4
                and ($5::boolean = false or audience.effective_audience = 'CLIENT_VISIBLE')`,
        [
          request.workspace_id,
          request.project_id,
          request.artifact_id,
          request.target_id,
          roles.includes('CLIENT_STAKEHOLDER'),
        ],
      );
      const snapshot = snapshotResult.rows[0];
      if (snapshot === undefined) throw safeNotFound();
      const adapter = this.adapter(artifact.kind_key, snapshot.schema_version, {
        correlationId: uuidv7(),
      });
      const requestedAudience = roles.includes('CLIENT_STAKEHOLDER')
        ? 'CLIENT_VISIBLE'
        : request.audience;
      const exportBody = {
        schemaVersion: '1',
        artifactId: artifact.id,
        title: artifact.title,
        kind: artifact.kind_key,
        targetId: request.target_id,
        audience: requestedAudience,
        body: adapter.projectAudience(
          adapter.readHistorical(snapshot.canonical_body),
          requestedAudience,
        ),
      } as const;
      const canonical = sha256CanonicalJson(exportBody);
      const key = `exports/${request.workspace_id}/${request.project_id}/${request.artifact_id}/${request.id}/${canonical.contentHash}.json`;
      await storage.putImmutable({
        key,
        body: new TextEncoder().encode(canonical.canonicalBody),
        contentType: 'application/json',
        contentHash: canonical.contentHash,
      });
      await this.pool.query(
        `update artifact_export_requests
            set state = 'READY', revision = revision + 1, object_reference = $2,
                content_hash = $3, permission_checked_at = now(),
                expires_at = now() + interval '15 minutes', updated_at = now()
          where id = $1 and state = 'PROCESSING'`,
        [request.id, key, canonical.contentHash],
      );
      return true;
    } catch {
      await this.pool.query(
        `update artifact_export_requests
            set state = $2::artifact_export_state, revision = revision + 1,
                failure_code = 'EXPORT_RENDER_FAILED', object_reference = null,
                updated_at = now()
          where id = $1 and state = 'PROCESSING'`,
        [request.id, terminalOnFailure ? 'FAILED' : 'PENDING'],
      );
      return false;
    }
  }

  async createArtifact(command: CreateArtifactCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'create-artifact', command);
      if (replay !== undefined) return replay;
      if (command.expectedRevision !== 0) {
        throw validation('A new artifact must use expected revision 0.', command.correlationId);
      }
      await this.requireRole(client, command, ['PM', 'LEAD']);
      const adapter = this.adapter(command.command.kind, command.command.schemaVersion, command);
      const body = adapter.parse(command.command.body);
      const normalized = adapter.normalize(body);
      const { canonicalBody, contentHash } = sha256CanonicalJson(normalized);
      await client.query('set constraints all deferred');
      await client.query(
        `insert into artifacts
          (id, workspace_id, project_id, kind_key, schema_version, policy_version,
           title, state, audience, root_audience_id, owner_id, revision,
           current_draft_revision_id)
         values ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, $10, 1, $11)`,
        [
          command.artifactId,
          command.workspaceId,
          command.projectId,
          command.command.kind,
          command.command.schemaVersion,
          command.command.policyVersion,
          command.command.title,
          command.command.audience,
          command.audienceRecordId,
          command.actorId,
          command.draftRevisionId,
        ],
      );
      await client.query(
        `insert into artifact_audiences
          (id, workspace_id, project_id, artifact_id, declared_audience,
           effective_audience, source, actor_id)
         values ($1, $2, $3, $4, $5, $5, 'EXPLICIT', $6)`,
        [
          command.audienceRecordId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.command.audience,
          command.actorId,
        ],
      );
      await client.query(
        `insert into artifact_draft_revisions
          (id, workspace_id, project_id, artifact_id, draft_number, schema_version,
           canonicalization, hash_algorithm, content_hash, canonical_body, body_json,
           audience_id, created_by)
         values ($1, $2, $3, $4, 1, $5, 'JCS_RFC8785', 'SHA256', $6, $7, $8::jsonb,
                 $9, $10)`,
        [
          command.draftRevisionId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.command.schemaVersion,
          contentHash,
          canonicalBody,
          canonicalBody,
          command.audienceRecordId,
          command.actorId,
        ],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.artifact.created',
        eventType: 'artifact.created.v1',
        revision: 1,
        state: 'DRAFT',
        contentHash,
        draftRevisionId: command.draftRevisionId,
      });
    });
  }

  async saveDraftRevision(command: SaveDraftRevisionCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'save-artifact-draft', command);
      if (replay !== undefined) return replay;
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      if (!roles.some((role) => ['PM', 'LEAD', 'CONTRIBUTOR'].includes(role))) {
        throw safeNotFound(command.correlationId);
      }
      this.assertRevision(artifact, command);
      if (artifact.state === 'IN_REVIEW' || artifact.state === 'APPROVED') {
        throw new ApplicationError({
          code: 'INVALID_TRANSITION',
          message: 'The artifact is read-only in its current state.',
          correlationId: command.correlationId,
          details: { artifactState: artifact.state, allowedStates: ['DRAFT', 'CHANGES_REQUESTED'] },
        });
      }
      if (command.command.schemaVersion !== artifact.schema_version) {
        throw validation(
          'Draft schema version does not match the artifact.',
          command.correlationId,
        );
      }
      const adapter = this.adapter(artifact.kind_key, artifact.schema_version, command);
      const body = adapter.parse(command.command.body);
      const { canonicalBody, contentHash } = sha256CanonicalJson(adapter.normalize(body));
      const nextRevision = artifact.revision + 1;
      await client.query(
        `insert into artifact_draft_revisions
          (id, workspace_id, project_id, artifact_id, draft_number, parent_revision_id,
           delta_id, source_baseline_id, schema_version, canonicalization, hash_algorithm,
           content_hash, canonical_body, body_json, audience_id, created_by)
         values ($1, $2, $3, $4, $5, $6,
                 (select delta_id from artifact_draft_revisions where id = $6),
                 (select source_baseline_id from artifact_draft_revisions where id = $6),
                 $7, 'JCS_RFC8785', 'SHA256', $8, $9, $10::jsonb,
                 (select audience_id from artifact_draft_revisions where id = $6), $11)`,
        [
          command.draftRevisionId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          artifact.next_draft_number,
          artifact.current_draft_revision_id,
          artifact.schema_version,
          contentHash,
          canonicalBody,
          canonicalBody,
          command.actorId,
        ],
      );
      await client.query(
        `update artifacts
            set revision = $4, state = 'DRAFT', current_draft_revision_id = $5,
                next_draft_number = next_draft_number + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [
          command.workspaceId,
          command.projectId,
          command.artifactId,
          nextRevision,
          command.draftRevisionId,
        ],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.draft-revision.saved',
        eventType: 'artifact.draft-revision-saved.v1',
        revision: nextRevision,
        state: 'DRAFT',
        contentHash,
        draftRevisionId: command.draftRevisionId,
      });
    });
  }

  async submitForReview(command: SubmitArtifactForReviewCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'submit-artifact-review', command);
      if (replay !== undefined) return replay;
      const { artifact } = await this.lockAuthorizedArtifact(client, command, ['PM']);
      this.assertRevision(artifact, command);
      if (!['DRAFT', 'CHANGES_REQUESTED'].includes(artifact.state)) {
        throw this.invalidTransition(command, artifact.state, ['DRAFT', 'CHANGES_REQUESTED']);
      }
      const adapter = this.adapter(artifact.kind_key, artifact.schema_version, command);
      const draft = await client.query<DraftRow>(
        `select * from artifact_draft_revisions
          where artifact_id = $1 and id = $2 for update`,
        [artifact.id, artifact.current_draft_revision_id],
      );
      const source = draft.rows[0];
      if (source === undefined) throw safeNotFound(command.correlationId);
      let requirementReadiness:
        | {
            templateSnapshotId: string;
            templateHash: string;
            bodyHash: string;
            readinessHash: string;
            evidence: unknown;
          }
        | undefined;
      if (artifact.kind_key === 'REQUIREMENT') {
        const body = requirementBodySchema.parse(source.body_json);
        const template = await client.query<{
          template_hash: string;
          definitions_json: RequirementFieldDefinition[];
        }>(
          `select template_hash, definitions_json
             from project_requirement_template_snapshots
            where workspace_id = $1 and project_id = $2 and id = $3`,
          [command.workspaceId, command.projectId, body.templateSnapshotId],
        );
        const frozen = template.rows[0];
        if (frozen?.template_hash !== body.templateHash) {
          throw validation('The Requirement template snapshot is invalid.', command.correlationId);
        }
        const blockers = await client.query<{
          open_conflicts: string[];
          blocking_gaps: string[];
        }>(
          `select
             coalesce((select array_agg(id order by id) from requirement_conflicts
                        where workspace_id = $1 and project_id = $2 and artifact_id = $3
                          and state = 'OPEN'), '{}'::uuid[])::text[] as open_conflicts,
             coalesce((select array_agg(id order by id) from requirement_gaps
                        where workspace_id = $1 and project_id = $2 and artifact_id = $3
                          and state = 'OPEN' and blocking), '{}'::uuid[])::text[] as blocking_gaps`,
          [command.workspaceId, command.projectId, command.artifactId],
        );
        const readiness = evaluateRequirementReadiness({
          body,
          template: frozen.definitions_json,
          openConflictIds: blockers.rows[0]?.open_conflicts ?? [],
          blockingGapIds: blockers.rows[0]?.blocking_gaps ?? [],
        });
        const adapterReadiness = adapter.submissionGuard?.(body);
        const unmet = [...readiness.unmetCriteria, ...(adapterReadiness?.unmetCriteria ?? [])];
        if (unmet.length > 0) {
          throw new ApplicationError({
            code: 'READINESS_FAILED',
            message: 'Resolve the Requirement readiness blockers before review.',
            correlationId: command.correlationId,
            details: { unmetCriteria: unmet },
          });
        }
        const evidence = {
          schemaVersion: '1',
          ready: true,
          blockingFieldKeys: readiness.blockingFieldKeys,
          blockingConflictIds: blockers.rows[0]?.open_conflicts ?? [],
          blockingGapIds: blockers.rows[0]?.blocking_gaps ?? [],
        };
        requirementReadiness = {
          templateSnapshotId: body.templateSnapshotId,
          templateHash: body.templateHash,
          bodyHash: source.content_hash,
          readinessHash: sha256CanonicalJson(evidence).contentHash,
          evidence,
        };
      }
      await client.query(
        `insert into artifact_review_snapshots
          (id, workspace_id, project_id, artifact_id, draft_revision_id, snapshot_number,
           schema_version, policy_version, canonicalization, hash_algorithm, content_hash,
           canonical_body, body_json, audience_id, submitted_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
                 (select audience_id from artifact_draft_revisions where id = $5), $14)`,
        [
          command.snapshotId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          source.id,
          artifact.next_snapshot_number,
          artifact.schema_version,
          artifact.policy_version,
          source.canonicalization,
          source.hash_algorithm,
          source.content_hash,
          source.canonical_body,
          JSON.stringify(source.body_json),
          command.actorId,
        ],
      );
      let approvalPolicy = adapter.approvalPolicy;
      if (artifact.kind_key === 'REQUIREMENT') {
        const project = await client.query<{ type: 'INTERNAL' | 'EXTERNAL' }>(
          `select type from projects where workspace_id = $1 and id = $2`,
          [command.workspaceId, command.projectId],
        );
        approvalPolicy =
          project.rows[0]?.type === 'EXTERNAL'
            ? [
                ...adapter.approvalPolicy,
                ...(adapter.approvalPolicy.some((slot) => slot.scope === 'EXTERNAL_BINDING')
                  ? []
                  : [
                      {
                        key: 'client',
                        role: 'CLIENT_STAKEHOLDER' as const,
                        scope: 'EXTERNAL_BINDING' as const,
                        required: true,
                      },
                    ]),
              ]
            : adapter.approvalPolicy.filter((slot) => slot.scope !== 'EXTERNAL_BINDING');
      }
      await client.query(
        `insert into artifact_approval_requests
          (id, workspace_id, project_id, artifact_id, snapshot_id, request_number,
           state, revision, required_slots, opened_by)
         values ($1, $2, $3, $4, $5, $6, 'OPEN', 1, $7::jsonb, $8)`,
        [
          command.approvalRequestId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.snapshotId,
          artifact.next_request_number,
          JSON.stringify(approvalPolicy),
          command.actorId,
        ],
      );
      if (requirementReadiness !== undefined) {
        await client.query(
          `insert into requirement_readiness_snapshots
            (id, workspace_id, project_id, artifact_id, review_snapshot_id,
             template_snapshot_id, template_hash, body_hash, readiness_hash,
             evidence_json, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
          [
            uuidv7(),
            command.workspaceId,
            command.projectId,
            command.artifactId,
            command.snapshotId,
            requirementReadiness.templateSnapshotId,
            requirementReadiness.templateHash,
            requirementReadiness.bodyHash,
            requirementReadiness.readinessHash,
            JSON.stringify(requirementReadiness.evidence),
            command.actorId,
          ],
        );
      }
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts
            set state = 'IN_REVIEW', revision = $4, open_approval_request_id = $5,
                next_snapshot_number = next_snapshot_number + 1,
                next_request_number = next_request_number + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [
          command.workspaceId,
          command.projectId,
          command.artifactId,
          nextRevision,
          command.approvalRequestId,
        ],
      );
      await client.query(
        `update artifact_deltas
            set state = 'IN_REVIEW', approval_request_id = $2,
                revision = revision + 1, updated_at = now()
          where id = (select delta_id from artifact_draft_revisions where id = $1)`,
        [source.id, command.approvalRequestId],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.review.submitted',
        eventType: 'artifact.review-submitted.v1',
        revision: nextRevision,
        state: 'IN_REVIEW',
        contentHash: source.content_hash,
        snapshotId: command.snapshotId,
        approvalRequestId: command.approvalRequestId,
      });
    });
  }

  async decideApproval(command: DecideArtifactApprovalCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'decide-artifact-approval', command);
      if (replay !== undefined) return replay;
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      this.assertRevision(artifact, command);
      const requestResult = await client.query<RequestRow & SnapshotRow>(
        `select request.id, request.snapshot_id, request.state, request.revision,
                request.required_slots, request.binding_decision_id,
                snapshot.artifact_id, snapshot.draft_revision_id, snapshot.snapshot_number,
                snapshot.schema_version, snapshot.policy_version, snapshot.canonicalization,
                snapshot.hash_algorithm, snapshot.content_hash, snapshot.canonical_body,
                snapshot.body_json, snapshot.submitted_by, snapshot.created_at
           from artifact_approval_requests request
           join artifact_review_snapshots snapshot on snapshot.id = request.snapshot_id
          where request.workspace_id = $1 and request.project_id = $2
            and request.artifact_id = $3 and request.id = $4
          for update of request, snapshot`,
        [command.workspaceId, command.projectId, command.artifactId, command.requestId],
      );
      const request = requestResult.rows[0];
      if (request === undefined) throw safeNotFound(command.correlationId);
      if (request.state !== 'OPEN' || artifact.open_approval_request_id !== request.id) {
        const binding = await client.query<{ decision: 'APPROVE' | 'REJECT' }>(
          `select decision from artifact_approval_decisions
            where request_id = $1 and scope = 'EXTERNAL_BINDING'`,
          [request.id],
        );
        throw new ApplicationError({
          code: 'APPROVAL_CLOSED',
          message: 'This approval request is already closed.',
          correlationId: command.correlationId,
          details: {
            requestState: request.state,
            ...(binding.rows[0] === undefined
              ? {}
              : {
                  bindingDecision: binding.rows[0].decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                }),
          },
        });
      }
      const slot = request.required_slots.find((item) => item.key === command.command.slotKey);
      if (slot === undefined || !roles.includes(slot.role))
        throw safeNotFound(command.correlationId);
      if (!validateDecisionComment(command.command.decision, command.command.comment)) {
        throw validation('A human comment is required for this decision.', command.correlationId);
      }
      await client.query(
        `insert into artifact_approval_decisions
          (id, workspace_id, project_id, artifact_id, request_id, snapshot_id, slot_key,
           scope, decision, actor_id, actor_role, comment, snapshot_hash)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          command.decisionId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          request.id,
          request.snapshot_id,
          slot.key,
          slot.scope,
          command.command.decision,
          command.actorId,
          slot.role,
          command.command.comment,
          request.content_hash,
        ],
      );
      const decisionRows = await client.query<{
        slot_key: string;
        decision: 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED';
      }>(`select slot_key, decision from artifact_approval_decisions where request_id = $1`, [
        request.id,
      ]);
      const satisfied = approvalSlotsSatisfied(
        request.required_slots,
        decisionRows.rows.map((item) => ({
          slotKey: item.slot_key,
          decision: item.decision,
        })),
      );
      const isNegative =
        command.command.decision === 'REJECT' || command.command.decision === 'CHANGES_REQUESTED';
      const nextState: Artifact['state'] = isNegative
        ? 'CHANGES_REQUESTED'
        : satisfied
          ? 'APPROVED'
          : 'IN_REVIEW';
      const requestState: RequestRow['state'] =
        command.command.decision === 'REJECT'
          ? 'REJECTED'
          : command.command.decision === 'CHANGES_REQUESTED'
            ? 'CHANGES_REQUESTED'
            : satisfied
              ? 'APPROVED'
              : 'OPEN';
      const nextRevision = artifact.revision + 1;
      let baselineId: string | undefined;
      let baselineNumber: string | undefined;
      if (satisfied && command.command.decision === 'APPROVE') {
        if (command.baselineId === null) {
          throw validation(
            'A baseline ID is required for the closing approval.',
            command.correlationId,
          );
        }
        baselineId = command.baselineId;
        baselineNumber = `${artifact.next_baseline_major}.0`;
        if (artifact.current_baseline_id !== null) {
          await client.query(
            `update artifact_baselines set state = 'SUPERSEDED'
              where artifact_id = $1 and id = $2 and state = 'CURRENT'`,
            [artifact.id, artifact.current_baseline_id],
          );
        }
        await client.query(
          `insert into artifact_baselines
            (id, workspace_id, project_id, artifact_id, major_number, source_snapshot_id,
             content_hash, schema_version, predecessor_baseline_id, audience_id, state, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   (select audience_id from artifact_review_snapshots where id = $6),
                   'CURRENT', $10)`,
          [
            baselineId,
            command.workspaceId,
            command.projectId,
            command.artifactId,
            artifact.next_baseline_major,
            request.snapshot_id,
            request.content_hash,
            request.schema_version,
            artifact.current_baseline_id,
            command.actorId,
          ],
        );
        await client.query(
          `update artifact_deltas
              set state = 'APPLIED', successor_baseline_id = $2,
                  revision = revision + 1, updated_at = now()
            where id = (
              select draft.delta_id
                from artifact_review_snapshots snapshot
                join artifact_draft_revisions draft on draft.id = snapshot.draft_revision_id
               where snapshot.id = $1
            )`,
          [request.snapshot_id, baselineId],
        );
      } else if (isNegative) {
        await client.query(
          `update artifact_deltas
              set state = $2, revision = revision + 1, updated_at = now()
            where id = (
              select draft.delta_id
                from artifact_review_snapshots snapshot
                join artifact_draft_revisions draft on draft.id = snapshot.draft_revision_id
               where snapshot.id = $1
            )`,
          [
            request.snapshot_id,
            command.command.decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED',
          ],
        );
      }
      if (requestState !== 'OPEN') {
        await client.query(
          `update artifact_approval_requests
              set state = $2, revision = revision + 1,
                  binding_decision_id = case when $3::boolean then $4 else binding_decision_id end,
                  closed_by = $5, closed_at = now(), close_comment = $6
            where id = $1`,
          [
            request.id,
            requestState,
            slot.scope === 'EXTERNAL_BINDING',
            command.decisionId,
            command.actorId,
            command.command.comment,
          ],
        );
      } else if (slot.scope === 'EXTERNAL_BINDING') {
        await client.query(
          `update artifact_approval_requests
              set revision = revision + 1, binding_decision_id = $2
            where id = $1`,
          [request.id, command.decisionId],
        );
      } else {
        await client.query(
          `update artifact_approval_requests set revision = revision + 1 where id = $1`,
          [request.id],
        );
      }
      await client.query(
        `update artifacts
            set state = $4::artifact_lifecycle_state, revision = $5,
                open_approval_request_id =
                  case when $4::artifact_lifecycle_state = 'IN_REVIEW'
                    then $6::uuid else null::uuid end,
                current_baseline_id = coalesce($7::uuid, current_baseline_id),
                next_baseline_major = case when $7::uuid is null then next_baseline_major
                                           else next_baseline_major + 1 end,
                updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [
          command.workspaceId,
          command.projectId,
          command.artifactId,
          nextState,
          nextRevision,
          request.id,
          baselineId ?? null,
        ],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.approval.decided',
        eventType: satisfied ? 'artifact.baseline-created.v1' : 'artifact.approval-decided.v1',
        revision: nextRevision,
        state: nextState,
        contentHash: request.content_hash,
        decisionId: command.decisionId,
        ...(slot.scope === 'EXTERNAL_BINDING'
          ? {
              bindingDecision:
                command.command.decision === 'APPROVE'
                  ? ('APPROVED' as const)
                  : ('REJECTED' as const),
            }
          : {}),
        ...(baselineId === undefined || baselineNumber === undefined
          ? {}
          : { baselineId, baselineNumber }),
      });
    });
  }

  async cancelApprovalRequest(
    command: CancelApprovalRequestCommand,
  ): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'cancel-artifact-review', command);
      if (replay !== undefined) return replay;
      const { artifact } = await this.lockAuthorizedArtifact(client, command, ['PM']);
      this.assertRevision(artifact, command);
      const result = await client.query<RequestRow>(
        `select * from artifact_approval_requests
          where workspace_id = $1 and project_id = $2 and artifact_id = $3 and id = $4
          for update`,
        [command.workspaceId, command.projectId, command.artifactId, command.requestId],
      );
      const request = result.rows[0];
      if (request === undefined) throw safeNotFound(command.correlationId);
      if (request.state !== 'OPEN') {
        throw new ApplicationError({
          code: 'APPROVAL_CLOSED',
          message: 'This approval request is already closed.',
          correlationId: command.correlationId,
          details: { requestState: request.state },
        });
      }
      await client.query(
        `update artifact_approval_requests
            set state = 'CANCELLED', revision = revision + 1, closed_by = $2,
                closed_at = now(), close_comment = $3
          where id = $1`,
        [request.id, command.actorId, command.command.comment],
      );
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set state = 'CHANGES_REQUESTED', revision = $4,
                open_approval_request_id = null, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.artifactId, nextRevision],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.review.cancelled',
        eventType: 'artifact.review-closed.v1',
        revision: nextRevision,
        state: 'CHANGES_REQUESTED',
      });
    });
  }

  async setAudience(command: SetArtifactAudienceCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'set-artifact-audience', command);
      if (replay !== undefined) return replay;
      const { artifact } = await this.lockAuthorizedArtifact(client, command, ['PM']);
      this.assertRevision(artifact, command);
      if (
        artifact.audience === 'CLIENT_VISIBLE' &&
        command.command.audience === 'TEAM_ONLY' &&
        (command.command.reason === null || command.command.reason.length < 8)
      ) {
        throw validation(
          'A reason is required when removing client access.',
          command.correlationId,
        );
      }
      await client.query(
        `insert into artifact_audiences
          (id, workspace_id, project_id, artifact_id, declared_audience,
           effective_audience, source, actor_id, reason)
         values ($1, $2, $3, $4, $5, $5, 'EXPLICIT', $6, $7)`,
        [
          command.audienceRecordId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.command.audience,
          command.actorId,
          command.command.reason,
        ],
      );
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set audience = $4, root_audience_id = $5, revision = $6,
                updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.command.audience,
          command.audienceRecordId,
          nextRevision,
        ],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.audience.changed',
        eventType: 'artifact.audience-changed.v1',
        revision: nextRevision,
        state: artifact.state,
      });
    });
  }

  async createDelta(command: CreateArtifactDeltaCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'create-artifact-delta', command);
      if (replay !== undefined) return replay;
      const { artifact } = await this.lockAuthorizedArtifact(client, command, ['PM']);
      this.assertRevision(artifact, command);
      if (artifact.state !== 'APPROVED' || artifact.current_baseline_id === null) {
        throw this.invalidTransition(command, artifact.state, ['APPROVED']);
      }
      const source = await client.query<SnapshotRow>(
        `select snapshot.*
           from artifact_baselines baseline
           join artifact_review_snapshots snapshot on snapshot.id = baseline.source_snapshot_id
          where baseline.workspace_id = $1 and baseline.project_id = $2
            and baseline.artifact_id = $3 and baseline.id = $4
          for update of baseline, snapshot`,
        [command.workspaceId, command.projectId, command.artifactId, artifact.current_baseline_id],
      );
      const snapshot = source.rows[0];
      if (snapshot === undefined) throw safeNotFound(command.correlationId);
      await client.query(
        `insert into artifact_deltas
          (id, workspace_id, project_id, artifact_id, base_baseline_id,
           proposed_draft_revision_id, audience_id, state, revision, rationale, created_by)
         values ($1, $2, $3, $4, $5, $6,
                 (select audience_id from artifact_baselines where id = $5),
                 'DRAFT', 1, $7, $8)`,
        [
          command.deltaId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          artifact.current_baseline_id,
          command.draftRevisionId,
          command.command.rationale,
          command.actorId,
        ],
      );
      await client.query(
        `insert into artifact_draft_revisions
          (id, workspace_id, project_id, artifact_id, draft_number, parent_revision_id,
           source_baseline_id, delta_id, schema_version, canonicalization, hash_algorithm,
           content_hash, canonical_body, body_json, audience_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb,
                 (select audience_id from artifact_baselines where id = $7), $15)`,
        [
          command.draftRevisionId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          artifact.next_draft_number,
          artifact.current_draft_revision_id,
          artifact.current_baseline_id,
          command.deltaId,
          snapshot.schema_version,
          snapshot.canonicalization,
          snapshot.hash_algorithm,
          snapshot.content_hash,
          snapshot.canonical_body,
          JSON.stringify(snapshot.body_json),
          command.actorId,
        ],
      );
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts
            set state = 'DRAFT', revision = $4, current_draft_revision_id = $5,
                next_draft_number = next_draft_number + 1, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [
          command.workspaceId,
          command.projectId,
          command.artifactId,
          nextRevision,
          command.draftRevisionId,
        ],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.delta.created',
        eventType: 'artifact.draft-revision-saved.v1',
        revision: nextRevision,
        state: 'DRAFT',
        contentHash: snapshot.content_hash,
        draftRevisionId: command.draftRevisionId,
      });
    });
  }

  async createComment(command: CreateArtifactCommentCommand): Promise<ArtifactComment> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'create-artifact-comment', command);
      if (replay !== undefined) {
        const comments = await this.listComments(
          command.actorId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.targetId,
        );
        const comment = comments.find((item) => item.id === command.commentId);
        if (comment === undefined) throw safeNotFound(command.correlationId);
        return comment;
      }
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      this.assertRevision(artifact, command);
      if (command.command.audience === 'CLIENT_VISIBLE' && artifact.audience === 'TEAM_ONLY') {
        throw validation('A child cannot broaden its parent audience.', command.correlationId);
      }
      if (roles.includes('CLIENT_STAKEHOLDER') && command.command.audience !== 'CLIENT_VISIBLE') {
        throw safeNotFound(command.correlationId);
      }
      if (command.command.mentionUserIds.length > 0) {
        const eligible = await client.query<{ user_id: string }>(
          `select distinct membership.user_id
             from project_memberships membership
             join project_membership_roles role
               on role.project_id = membership.project_id and role.user_id = membership.user_id
            where membership.workspace_id = $1 and membership.project_id = $2
              and membership.state = 'ACTIVE' and membership.user_id = any($3::text[])
              and ($4::artifact_audience = 'CLIENT_VISIBLE'
                   or role.role <> 'CLIENT_STAKEHOLDER')`,
          [
            command.workspaceId,
            command.projectId,
            command.command.mentionUserIds,
            command.command.audience,
          ],
        );
        if (eligible.rows.length !== new Set(command.command.mentionUserIds).size) {
          throw validation(
            'One or more mentioned members are not eligible.',
            command.correlationId,
          );
        }
      }
      await client.query(
        `insert into artifact_audiences
          (id, workspace_id, project_id, artifact_id, declared_audience,
           effective_audience, source, parent_audience_id, actor_id)
         values ($1, $2, $3, $4, $5,
                 case when $6 = 'TEAM_ONLY' then 'TEAM_ONLY'::artifact_audience else $5 end,
                 'INHERITED', $7, $8)`,
        [
          command.audienceRecordId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.command.audience,
          artifact.audience,
          await this.rootAudienceId(client, artifact.id),
          command.actorId,
        ],
      );
      await client.query(
        `insert into artifact_comments
          (id, workspace_id, project_id, artifact_id, target_type, target_id,
           body, audience_id, state, revision, author_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 1, $9)`,
        [
          command.commentId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.targetType,
          command.targetId,
          command.command.body,
          command.audienceRecordId,
          command.actorId,
        ],
      );
      for (const userId of new Set(command.command.mentionUserIds)) {
        await client.query(
          `insert into artifact_comment_mentions
            (comment_id, user_id, workspace_id, project_id, artifact_id)
           values ($1, $2, $3, $4, $5)`,
          [command.commentId, userId, command.workspaceId, command.projectId, command.artifactId],
        );
      }
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set revision = $4, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.artifactId, nextRevision],
      );
      await this.completeMutation(client, command, {
        action: 'artifacts.comment.created',
        eventType: 'artifact.comment-created.v1',
        revision: nextRevision,
        state: artifact.state,
      });
      return artifactCommentSchema.parse({
        id: command.commentId,
        artifactId: command.artifactId,
        targetType: command.targetType,
        targetId: command.targetId,
        body: command.command.body,
        audience: artifact.audience === 'TEAM_ONLY' ? 'TEAM_ONLY' : command.command.audience,
        state: 'OPEN',
        revision: 1,
        authorId: command.actorId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async mutateComment(command: MutateArtifactCommentCommand): Promise<ArtifactComment> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'mutate-artifact-comment', command);
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      const result = await client.query<{
        id: string;
        artifact_id: string;
        target_type: string;
        target_id: string;
        body: string | null;
        effective_audience: ArtifactAudience;
        state: 'OPEN' | 'RESOLVED' | 'REMOVED';
        revision: number;
        author_id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `select comment.id, comment.artifact_id, comment.target_type, comment.target_id,
                comment.body, audience.effective_audience, comment.state, comment.revision,
                comment.author_id, comment.created_at, comment.updated_at
           from artifact_comments comment
           join artifact_audiences audience on audience.id = comment.audience_id
          where comment.workspace_id = $1 and comment.project_id = $2
            and comment.artifact_id = $3 and comment.id = $4
          for update of comment`,
        [command.workspaceId, command.projectId, command.artifactId, command.commentId],
      );
      const row = result.rows[0];
      const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
      if (row === undefined || (clientOnly && row.effective_audience !== 'CLIENT_VISIBLE')) {
        throw safeNotFound(command.correlationId);
      }
      if (replay !== undefined) {
        return artifactCommentSchema.parse({
          id: row.id,
          artifactId: row.artifact_id,
          targetType: row.target_type,
          targetId: row.target_id,
          body: row.body,
          audience: row.effective_audience,
          state: row.state,
          revision: row.revision,
          authorId: row.author_id,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        });
      }
      this.assertRevision(artifact, command);
      if (row.revision !== command.expectedCommentRevision) {
        throw new ApplicationError({
          code: 'REVISION_CONFLICT',
          message: 'The comment changed. Review the current revision and retry.',
          correlationId: command.correlationId,
          currentRevision: row.revision,
        });
      }
      if (row.state === 'REMOVED') {
        throw this.invalidTransition(command, row.state, []);
      }
      const isAuthor = row.author_id === command.actorId;
      const isReviewer = roles.some((role) => role === 'PM' || role === 'LEAD');
      if (command.command.action === 'EDIT') {
        if (!isAuthor && !roles.includes('PM')) throw safeNotFound(command.correlationId);
        if (command.command.mentionUserIds.length > 0) {
          const eligible = await client.query<{ user_id: string }>(
            `select distinct membership.user_id
               from project_memberships membership
               join project_membership_roles role
                 on role.project_id = membership.project_id and role.user_id = membership.user_id
              where membership.workspace_id = $1 and membership.project_id = $2
                and membership.state = 'ACTIVE' and membership.user_id = any($3::text[])
                and ($4::artifact_audience = 'CLIENT_VISIBLE'
                     or role.role <> 'CLIENT_STAKEHOLDER')`,
            [
              command.workspaceId,
              command.projectId,
              command.command.mentionUserIds,
              row.effective_audience,
            ],
          );
          if (eligible.rows.length !== new Set(command.command.mentionUserIds).size) {
            throw validation(
              'One or more mentioned members are not eligible.',
              command.correlationId,
            );
          }
        }
        await client.query(
          `update artifact_comments
              set body = $2, revision = revision + 1, updated_at = now()
            where id = $1`,
          [command.commentId, command.command.body],
        );
        await client.query(`delete from artifact_comment_mentions where comment_id = $1`, [
          command.commentId,
        ]);
        for (const userId of new Set(command.command.mentionUserIds)) {
          await client.query(
            `insert into artifact_comment_mentions
              (comment_id, user_id, workspace_id, project_id, artifact_id)
             values ($1, $2, $3, $4, $5)`,
            [command.commentId, userId, command.workspaceId, command.projectId, command.artifactId],
          );
        }
      } else if (command.command.action === 'RESOLVE') {
        if (!isReviewer) throw safeNotFound(command.correlationId);
        if (row.state !== 'OPEN') throw this.invalidTransition(command, row.state, ['OPEN']);
        await client.query(
          `update artifact_comments
              set state = 'RESOLVED', resolved_by = $2, resolved_at = now(),
                  revision = revision + 1, updated_at = now()
            where id = $1`,
          [command.commentId, command.actorId],
        );
      } else if (command.command.action === 'REOPEN') {
        if (!isReviewer) throw safeNotFound(command.correlationId);
        if (row.state !== 'RESOLVED') {
          throw this.invalidTransition(command, row.state, ['RESOLVED']);
        }
        await client.query(
          `update artifact_comments
              set state = 'OPEN', resolved_by = null, resolved_at = null,
                  revision = revision + 1, updated_at = now()
            where id = $1`,
          [command.commentId],
        );
      } else {
        if (!isAuthor && !roles.includes('PM')) throw safeNotFound(command.correlationId);
        await client.query(
          `update artifact_comments
              set state = 'REMOVED', body = null, removed_by = $2, removed_at = now(),
                  revision = revision + 1, updated_at = now()
            where id = $1`,
          [command.commentId, command.actorId],
        );
        await client.query(`delete from artifact_comment_mentions where comment_id = $1`, [
          command.commentId,
        ]);
      }
      const nextArtifactRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set revision = $4, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.artifactId, nextArtifactRevision],
      );
      await this.completeMutation(client, command, {
        action: `artifacts.comment.${command.command.action.toLowerCase()}`,
        eventType: 'artifact.comment-state-changed.v1',
        revision: nextArtifactRevision,
        state: artifact.state,
      });
      const updated = await client.query<{
        body: string | null;
        state: 'OPEN' | 'RESOLVED' | 'REMOVED';
        revision: number;
        updated_at: Date;
      }>(`select body, state, revision, updated_at from artifact_comments where id = $1`, [
        command.commentId,
      ]);
      return artifactCommentSchema.parse({
        id: row.id,
        artifactId: row.artifact_id,
        targetType: row.target_type,
        targetId: row.target_id,
        body: updated.rows[0]?.body ?? null,
        audience: row.effective_audience,
        state: updated.rows[0]?.state,
        revision: updated.rows[0]?.revision,
        authorId: row.author_id,
        createdAt: row.created_at.toISOString(),
        updatedAt: updated.rows[0]?.updated_at.toISOString(),
      });
    });
  }

  async registerAttachment(
    command: RegisterArtifactAttachmentCommand,
  ): Promise<ArtifactAttachment> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'register-artifact-attachment', command);
      if (replay !== undefined) {
        const attachments = await this.listAttachments(
          command.actorId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.targetId,
        );
        const attachment = attachments.find((item) => item.id === command.attachmentId);
        if (attachment === undefined) throw safeNotFound(command.correlationId);
        return attachment;
      }
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      this.assertRevision(artifact, command);
      if (roles.includes('CLIENT_STAKEHOLDER')) throw safeNotFound(command.correlationId);
      if (command.command.audience === 'CLIENT_VISIBLE' && artifact.audience === 'TEAM_ONLY') {
        throw validation('A child cannot broaden its parent audience.', command.correlationId);
      }
      const rootAudienceId = await this.rootAudienceId(client, artifact.id);
      await client.query(
        `insert into artifact_audiences
          (id, workspace_id, project_id, artifact_id, declared_audience,
           effective_audience, source, parent_audience_id, actor_id)
         values ($1, $2, $3, $4, $5,
                 case when $6 = 'TEAM_ONLY' then 'TEAM_ONLY'::artifact_audience else $5 end,
                 'INHERITED', $7, $8)`,
        [
          command.audienceRecordId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.command.audience,
          artifact.audience,
          rootAudienceId,
          command.actorId,
        ],
      );
      await client.query(
        `insert into artifact_attachments
          (id, workspace_id, project_id, artifact_id, target_type, target_id,
           display_name, media_type, byte_size, object_reference, audience_id,
           state, revision, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', 1, $12)`,
        [
          command.attachmentId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.targetType,
          command.targetId,
          command.command.displayName,
          command.command.mediaType,
          command.command.byteSize,
          command.command.objectReference,
          command.audienceRecordId,
          command.actorId,
        ],
      );
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set revision = $4, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.artifactId, nextRevision],
      );
      await this.completeMutation(client, command, {
        action: 'artifacts.attachment.registered',
        eventType: 'artifact.attachment-state-changed.v1',
        revision: nextRevision,
        state: artifact.state,
      });
      return artifactAttachmentSchema.parse({
        id: command.attachmentId,
        artifactId: command.artifactId,
        targetType: command.targetType,
        targetId: command.targetId,
        displayName: command.command.displayName,
        mediaType: command.command.mediaType,
        byteSize: command.command.byteSize,
        audience: artifact.audience === 'TEAM_ONLY' ? 'TEAM_ONLY' : command.command.audience,
        state: 'PENDING',
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async removeAttachment(command: RemoveArtifactAttachmentCommand): Promise<ArtifactAttachment> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'remove-artifact-attachment', command);
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      if (roles.includes('CLIENT_STAKEHOLDER')) throw safeNotFound(command.correlationId);
      const result = await client.query<{
        id: string;
        artifact_id: string;
        target_type: string;
        target_id: string;
        display_name: string;
        media_type: string;
        byte_size: number;
        effective_audience: ArtifactAudience;
        state: 'PENDING' | 'AVAILABLE' | 'REMOVED' | 'QUARANTINED' | 'FAILED';
        revision: number;
        created_by: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `select attachment.id, attachment.artifact_id, attachment.target_type,
                attachment.target_id, attachment.display_name, attachment.media_type,
                attachment.byte_size::integer as byte_size, audience.effective_audience, attachment.state,
                attachment.revision, attachment.created_by, attachment.created_at,
                attachment.updated_at
           from artifact_attachments attachment
           join artifact_audiences audience on audience.id = attachment.audience_id
          where attachment.workspace_id = $1 and attachment.project_id = $2
            and attachment.artifact_id = $3 and attachment.id = $4
          for update of attachment`,
        [command.workspaceId, command.projectId, command.artifactId, command.attachmentId],
      );
      const row = result.rows[0];
      if (row === undefined) throw safeNotFound(command.correlationId);
      if (replay === undefined) {
        this.assertRevision(artifact, command);
        if (row.revision !== command.expectedAttachmentRevision) {
          throw new ApplicationError({
            code: 'REVISION_CONFLICT',
            message: 'The attachment changed. Review the current revision and retry.',
            correlationId: command.correlationId,
            currentRevision: row.revision,
          });
        }
        if (row.state === 'REMOVED') {
          throw this.invalidTransition(command, row.state, [
            'PENDING',
            'AVAILABLE',
            'QUARANTINED',
            'FAILED',
          ]);
        }
        if (row.created_by !== command.actorId && !roles.includes('PM')) {
          throw safeNotFound(command.correlationId);
        }
        await client.query(
          `update artifact_attachments
              set state = 'REMOVED', revision = revision + 1, updated_at = now()
            where id = $1`,
          [command.attachmentId],
        );
        const nextRevision = artifact.revision + 1;
        await client.query(
          `update artifacts set revision = $4, updated_at = now()
            where workspace_id = $1 and project_id = $2 and id = $3`,
          [command.workspaceId, command.projectId, command.artifactId, nextRevision],
        );
        await this.completeMutation(client, command, {
          action: 'artifacts.attachment.removed',
          eventType: 'artifact.attachment-state-changed.v1',
          revision: nextRevision,
          state: artifact.state,
        });
      }
      const current = await client.query<{
        state: 'PENDING' | 'AVAILABLE' | 'REMOVED' | 'QUARANTINED' | 'FAILED';
        revision: number;
        updated_at: Date;
      }>(`select state, revision, updated_at from artifact_attachments where id = $1`, [
        command.attachmentId,
      ]);
      return artifactAttachmentSchema.parse({
        id: row.id,
        artifactId: row.artifact_id,
        targetType: row.target_type,
        targetId: row.target_id,
        displayName: row.display_name,
        mediaType: row.media_type,
        byteSize: row.byte_size,
        audience: row.effective_audience,
        state: current.rows[0]?.state,
        revision: current.rows[0]?.revision,
        createdAt: row.created_at.toISOString(),
        updatedAt: current.rows[0]?.updated_at.toISOString(),
      });
    });
  }

  async requestExport(command: RequestArtifactExportCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'request-artifact-export', command);
      if (replay !== undefined) return replay;
      const { artifact, roles } = await this.lockAuthorizedArtifact(client, command);
      this.assertRevision(artifact, command);
      if (!['REVIEW_SNAPSHOT', 'BASELINE'].includes(command.targetType)) {
        throw validation(
          'Exports require an immutable review snapshot or baseline.',
          command.correlationId,
        );
      }
      const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
      const target = await client.query(
        command.targetType === 'BASELINE'
          ? `select 1
               from artifact_baselines baseline
               join artifact_audiences audience on audience.id = baseline.audience_id
              where baseline.workspace_id = $1 and baseline.project_id = $2
                and baseline.artifact_id = $3 and baseline.id = $4
                and ($5::boolean = false or audience.effective_audience = 'CLIENT_VISIBLE')`
          : `select 1
               from artifact_review_snapshots snapshot
               join artifact_audiences audience on audience.id = snapshot.audience_id
              where snapshot.workspace_id = $1 and snapshot.project_id = $2
                and snapshot.artifact_id = $3 and snapshot.id = $4
                and ($5::boolean = false or audience.effective_audience = 'CLIENT_VISIBLE')`,
        [command.workspaceId, command.projectId, command.artifactId, command.targetId, clientOnly],
      );
      if ((target.rowCount ?? 0) !== 1) throw safeNotFound(command.correlationId);
      const audience: ArtifactAudience = clientOnly ? 'CLIENT_VISIBLE' : artifact.audience;
      const dedupeKey = createHash('sha256')
        .update(
          [
            command.artifactId,
            command.targetType,
            command.targetId,
            audience,
            command.command.format,
            command.actorId,
          ].join(':'),
        )
        .digest('hex');
      await client.query(
        `insert into artifact_export_requests
          (id, workspace_id, project_id, artifact_id, target_type, target_id,
           format, audience, requester_id, state, revision, dedupe_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', 1, $10)`,
        [
          command.exportId,
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.targetType,
          command.targetId,
          command.command.format,
          audience,
          command.actorId,
          dedupeKey,
        ],
      );
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set revision = $4, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.artifactId, nextRevision],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.export.requested',
        eventType: 'artifact.export-requested.v1',
        revision: nextRevision,
        state: artifact.state,
        exportId: command.exportId,
      });
    });
  }

  async cancelExport(command: CancelArtifactExportCommand): Promise<ArtifactMutationResult> {
    return this.transaction(async (client) => {
      const replay = await this.beginIdempotent(client, 'cancel-artifact-export', command);
      if (replay !== undefined) return replay;
      const { artifact } = await this.lockAuthorizedArtifact(client, command);
      this.assertRevision(artifact, command);
      const cancelled = await client.query(
        `update artifact_export_requests
            set state = 'CANCELLED', revision = revision + 1,
                failure_code = 'CANCELLED_BY_REQUESTER', updated_at = now()
          where workspace_id = $1 and project_id = $2 and artifact_id = $3
            and id = $4 and requester_id = $5 and state = 'PENDING'
          returning id`,
        [
          command.workspaceId,
          command.projectId,
          command.artifactId,
          command.exportId,
          command.actorId,
        ],
      );
      if ((cancelled.rowCount ?? 0) !== 1) {
        throw new ApplicationError({
          code: 'JOB_NOT_CANCELLABLE',
          message: 'The export can no longer be cancelled.',
          correlationId: command.correlationId,
        });
      }
      const nextRevision = artifact.revision + 1;
      await client.query(
        `update artifacts set revision = $4, updated_at = now()
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [command.workspaceId, command.projectId, command.artifactId, nextRevision],
      );
      return this.completeMutation(client, command, {
        action: 'artifacts.export.cancelled',
        eventType: 'artifact.export-cancelled.v1',
        revision: nextRevision,
        state: artifact.state,
        exportId: command.exportId,
      });
    });
  }

  private adapter(kind: string, version: string, command: { correlationId: string }) {
    try {
      return this.registry.get(kind, version);
    } catch {
      throw validation('Unknown artifact kind or schema version.', command.correlationId);
    }
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
    command: ArtifactCommand,
  ): Promise<ArtifactMutationResult | undefined> {
    const hash = commandHash(operation, command);
    const inserted = await client.query(
      `insert into idempotency_records
        (workspace_id, idempotency_key, request_hash, status, correlation_id)
       values ($1, $2, $3, 'PROCESSING', $4)
       on conflict do nothing returning idempotency_key`,
      [command.workspaceId, command.idempotencyKey, hash, command.correlationId],
    );
    if ((inserted.rowCount ?? 0) > 0) return undefined;
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
        message: 'The command is already processing. Retry shortly.',
        correlationId: command.correlationId,
      });
    }
    return artifactMutationResultSchema.parse({ ...row.result, replayed: true });
  }

  private async completeMutation(
    client: PoolClient,
    command: ArtifactCommand,
    input: {
      action: string;
      eventType:
        | 'artifact.created.v1'
        | 'artifact.draft-revision-saved.v1'
        | 'artifact.review-submitted.v1'
        | 'artifact.approval-decided.v1'
        | 'artifact.review-closed.v1'
        | 'artifact.baseline-created.v1'
        | 'artifact.audience-changed.v1'
        | 'artifact.comment-created.v1'
        | 'artifact.comment-state-changed.v1'
        | 'artifact.attachment-state-changed.v1'
        | 'artifact.export-requested.v1'
        | 'artifact.export-cancelled.v1';
      revision: number;
      state: Artifact['state'];
      contentHash?: string;
      draftRevisionId?: string;
      snapshotId?: string;
      approvalRequestId?: string;
      decisionId?: string;
      bindingDecision?: 'APPROVED' | 'REJECTED';
      baselineId?: string;
      baselineNumber?: string;
      exportId?: string;
    },
  ): Promise<ArtifactMutationResult> {
    await client.query(
      `insert into audit_events
        (id, workspace_id, project_id, actor_id, action, target_type, target_id,
         correlation_id, after_summary)
       values ($1, $2, $3, $4, $5, 'Artifact', $6, $7, $8::jsonb)`,
      [
        uuidv7(),
        command.workspaceId,
        command.projectId,
        command.actorId,
        input.action,
        command.artifactId,
        command.correlationId,
        JSON.stringify({
          revision: input.revision,
          state: input.state,
          ...(input.snapshotId === undefined ? {} : { snapshotId: input.snapshotId }),
          ...(input.baselineId === undefined ? {} : { baselineId: input.baselineId }),
        }),
      ],
    );
    const eventId = uuidv7();
    await client.query(
      `insert into outbox_events
        (id, workspace_id, aggregate_type, aggregate_id, aggregate_revision,
         event_type, schema_version, payload, correlation_id)
       values ($1, $2, 'ARTIFACT', $3, $4, $5, '1', $6::jsonb, $7)`,
      [
        eventId,
        command.workspaceId,
        command.artifactId,
        input.revision,
        input.eventType,
        JSON.stringify({
          eventId,
          workspaceId: command.workspaceId,
          aggregateType: 'ARTIFACT',
          aggregateId: command.artifactId,
          aggregateRevision: input.revision,
          eventType: input.eventType,
          schemaVersion: '1',
          payload: {
            artifactId: command.artifactId,
            projectId: command.projectId,
            state: input.state,
            audience: await this.currentAudience(client, command.artifactId),
            ...(input.contentHash === undefined ? {} : { contentHash: input.contentHash }),
            ...(input.exportId === undefined ? {} : { exportId: input.exportId }),
          },
          correlationId: command.correlationId,
        }),
        command.correlationId,
      ],
    );
    const result = artifactMutationResultSchema.parse({
      schemaVersion: '1',
      artifactId: command.artifactId,
      revision: input.revision,
      state: input.state,
      replayed: false,
      correlationId: command.correlationId,
      ...(input.draftRevisionId === undefined ? {} : { draftRevisionId: input.draftRevisionId }),
      ...(input.snapshotId === undefined ? {} : { snapshotId: input.snapshotId }),
      ...(input.approvalRequestId === undefined
        ? {}
        : { approvalRequestId: input.approvalRequestId }),
      ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
      ...(input.bindingDecision === undefined ? {} : { bindingDecision: input.bindingDecision }),
      ...(input.baselineId === undefined ? {} : { baselineId: input.baselineId }),
      ...(input.baselineNumber === undefined ? {} : { baselineNumber: input.baselineNumber }),
      ...(input.exportId === undefined ? {} : { exportId: input.exportId }),
    });
    await client.query(
      `update idempotency_records
          set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
        where workspace_id = $1 and idempotency_key = $2`,
      [command.workspaceId, command.idempotencyKey, JSON.stringify(result)],
    );
    return result;
  }

  private async roles(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ArtifactRole[]> {
    const result = await client.query<{ role: ArtifactRole }>(
      `select role.role
         from workspace_memberships workspace
         join project_memberships membership
           on membership.workspace_id = workspace.workspace_id
          and membership.user_id = workspace.user_id
         join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id
          and role.user_id = membership.user_id
        where workspace.workspace_id = $1 and workspace.user_id = $2
          and workspace.state = 'ACTIVE' and membership.project_id = $3
          and membership.state = 'ACTIVE'`,
      [workspaceId, actorId, projectId],
    );
    return result.rows.map((row) => row.role);
  }

  private async authorizedArtifact(
    client: Pick<DatabasePool, 'query'> | PoolClient,
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<{ artifact: ArtifactRow; roles: ArtifactRole[] }> {
    const roles = await this.roles(client, actorId, workspaceId, projectId);
    if (roles.length === 0) throw safeNotFound();
    const result = await client.query<ArtifactRow>(
      `select * from artifacts
        where workspace_id = $1 and project_id = $2 and id = $3`,
      [workspaceId, projectId, artifactId],
    );
    const artifact = result.rows[0];
    if (artifact === undefined || !canViewArtifactAudience(roles, artifact.audience)) {
      throw safeNotFound();
    }
    return { artifact, roles };
  }

  private async lockAuthorizedArtifact(
    client: PoolClient,
    command: ArtifactCommand,
    requiredRoles?: ArtifactRole[],
  ): Promise<{ artifact: ArtifactRow; roles: ArtifactRole[] }> {
    const roles = await this.roles(client, command.actorId, command.workspaceId, command.projectId);
    if (
      roles.length === 0 ||
      (requiredRoles !== undefined && !roles.some((role) => requiredRoles.includes(role)))
    ) {
      throw safeNotFound(command.correlationId);
    }
    const result = await client.query<ArtifactRow>(
      `select * from artifacts
        where workspace_id = $1 and project_id = $2 and id = $3 for update`,
      [command.workspaceId, command.projectId, command.artifactId],
    );
    const artifact = result.rows[0];
    if (artifact === undefined || !canViewArtifactAudience(roles, artifact.audience)) {
      throw safeNotFound(command.correlationId);
    }
    return { artifact, roles };
  }

  private async requireRole(
    client: PoolClient,
    command: ArtifactCommand,
    roles: ArtifactRole[],
  ): Promise<void> {
    const actorRoles = await this.roles(
      client,
      command.actorId,
      command.workspaceId,
      command.projectId,
    );
    if (!actorRoles.some((role) => roles.includes(role))) throw safeNotFound(command.correlationId);
  }

  private assertRevision(artifact: ArtifactRow, command: ArtifactCommand): void {
    if (artifact.revision !== command.expectedRevision) {
      throw new ApplicationError({
        code: 'REVISION_CONFLICT',
        message: 'The artifact changed. Review the current revision and retry.',
        correlationId: command.correlationId,
        currentRevision: artifact.revision,
        details: {
          artifactState: artifact.state,
          lastUpdatedAt: artifact.updated_at.toISOString(),
          reloadUrl: `/workspaces/${command.workspaceId}/projects/${command.projectId}/artifacts/${command.artifactId}`,
        },
      });
    }
  }

  private invalidTransition(
    command: ArtifactCommand,
    state: string,
    allowedStates: string[],
  ): ApplicationError {
    return new ApplicationError({
      code: 'INVALID_TRANSITION',
      message: 'The artifact cannot perform that action in its current state.',
      correlationId: command.correlationId,
      details: { artifactState: state, allowedStates },
    });
  }

  private async currentAudience(client: PoolClient, artifactId: string): Promise<ArtifactAudience> {
    const result = await client.query<{ audience: ArtifactAudience }>(
      `select audience from artifacts where id = $1`,
      [artifactId],
    );
    return result.rows[0]?.audience ?? 'TEAM_ONLY';
  }

  private async rootAudienceId(client: PoolClient, artifactId: string): Promise<string> {
    const result = await client.query<{ root_audience_id: string }>(
      `select root_audience_id from artifacts where id = $1`,
      [artifactId],
    );
    const id = result.rows[0]?.root_audience_id;
    if (id === undefined) throw safeNotFound();
    return id;
  }
}
