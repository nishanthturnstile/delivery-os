import { createHash } from 'node:crypto';

import {
  ApplicationError,
  type RequirementCommandStore,
  type RequirementQueryStore,
  type RequirementTemplateStore,
} from '@delivery-os/application';
import {
  requirementBodySchema,
  type RequirementBody,
  type RequirementFieldDefinition,
} from '@delivery-os/contracts';
import {
  mergeRequirementTemplate,
  requirementRecordFingerprint,
  sha256CanonicalJson,
} from '@delivery-os/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

type ReplayRow = QueryResultRow & {
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
};

interface IdempotentInput {
  workspaceId: string;
  idempotencyKey: string;
  correlationId: string;
}

type AuditedInput = IdempotentInput & {
  actorId: string;
  projectId?: string;
};

function notFound(correlationId = uuidv7()): ApplicationError {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
    correlationId,
  });
}

function conflict(correlationId: string): ApplicationError {
  return new ApplicationError({
    code: 'REVISION_CONFLICT',
    message: 'The Requirement changed. Refresh and try again.',
    correlationId,
  });
}

function hash(operation: string, input: object): string {
  return createHash('sha256').update(JSON.stringify({ operation, input })).digest('hex');
}

export class PostgresRequirementStore
  implements RequirementTemplateStore, RequirementCommandStore, RequirementQueryStore
{
  constructor(private readonly pool: DatabasePool) {}

  async createIntakeSet(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    artifactId: string;
    actorId: string;
    expectedRevision: number;
    sourceGenerationIds: string[];
    extractionJobId: string;
    workflowConfigHash: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ id: string; sourceManifestHash: string }> {
    if (input.sourceGenerationIds.length === 0) throw notFound(input.correlationId);
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'create-requirement-intake-set', input);
      if (replay !== undefined) {
        return replay as { id: string; sourceManifestHash: string };
      }
      await this.requireProjectEditor(client, input.actorId, input.workspaceId, input.projectId);
      const artifact = await client.query<{ revision: number }>(
        `select revision from artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
            and kind_key = 'REQUIREMENT' and state in ('DRAFT', 'CHANGES_REQUESTED')
          for update`,
        [input.workspaceId, input.projectId, input.artifactId],
      );
      const artifactRow = artifact.rows[0];
      if (artifactRow === undefined) throw notFound(input.correlationId);
      if (artifactRow.revision !== input.expectedRevision) throw conflict(input.correlationId);
      const sources = await client.query<{
        id: string;
        expected_sha256: string;
        audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
      }>(
        `select generation.id, generation.expected_sha256, source.audience
           from source_generations generation
           join source_artifacts source
             on source.workspace_id = generation.workspace_id
            and source.project_id = generation.project_id
            and source.id = generation.source_artifact_id
          where generation.workspace_id = $1 and generation.project_id = $2
            and generation.id = any($3::uuid[])
            and source.current_generation_id = generation.id
            and source.processing_state = 'SUCCEEDED'
            and source.retention_state = 'ACTIVE'`,
        [input.workspaceId, input.projectId, input.sourceGenerationIds],
      );
      const byId = new Map(sources.rows.map((source) => [source.id, source]));
      if (
        byId.size !== input.sourceGenerationIds.length ||
        new Set(input.sourceGenerationIds).size !== input.sourceGenerationIds.length
      ) {
        throw notFound(input.correlationId);
      }
      const manifest = input.sourceGenerationIds.map((sourceGenerationId) => {
        const source = byId.get(sourceGenerationId);
        if (source === undefined) throw notFound(input.correlationId);
        return {
          sourceGenerationId,
          sha256: source.expected_sha256,
          audience: source.audience,
        };
      });
      const sourceManifestHash = sha256CanonicalJson(
        JSON.parse(JSON.stringify(manifest)) as Parameters<typeof sha256CanonicalJson>[0],
      ).contentHash;
      await client.query(
        `insert into intake_sets
          (id, workspace_id, project_id, source_manifest_hash, created_by)
         values ($1, $2, $3, $4, $5)`,
        [input.id, input.workspaceId, input.projectId, sourceManifestHash, input.actorId],
      );
      for (const [ordinal, source] of manifest.entries()) {
        await client.query(
          `insert into intake_set_sources
            (workspace_id, project_id, intake_set_id, source_generation_id, ordinal, audience)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            input.workspaceId,
            input.projectId,
            input.id,
            source.sourceGenerationId,
            ordinal,
            source.audience,
          ],
        );
      }
      await client.query(
        `insert into requirement_intake_sets
          (workspace_id, project_id, artifact_id, intake_set_id, created_by)
         values ($1, $2, $3, $4, $5)`,
        [input.workspaceId, input.projectId, input.artifactId, input.id, input.actorId],
      );
      await client.query(
        `insert into document_jobs
          (id, workspace_id, project_id, intake_set_id, job_type, input_hash,
           config_version, correlation_id)
         values ($1, $2, $3, $4, 'EXTRACT', $5, $6, $7)`,
        [
          input.extractionJobId,
          input.workspaceId,
          input.projectId,
          input.id,
          sourceManifestHash,
          input.workflowConfigHash,
          input.correlationId,
        ],
      );
      const result = { id: input.id, sourceManifestHash };
      await this.audit(client, input, input.artifactId, 1, 'requirement.intake-set-created', {
        intakeSetId: input.id,
        sourceManifestHash,
        sourceCount: manifest.length,
      });
      await this.finish(client, input, result);
      return result;
    });
  }

  async publishTemplate(
    input: Parameters<RequirementTemplateStore['publishTemplate']>[0],
  ): ReturnType<RequirementTemplateStore['publishTemplate']> {
    const definitions = mergeRequirementTemplate(input.extension);
    const templateHash = sha256CanonicalJson(
      JSON.parse(JSON.stringify(definitions)) as Parameters<typeof sha256CanonicalJson>[0],
    ).contentHash;
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'publish-requirement-template', input);
      if (replay !== undefined)
        return replay as { id: string; version: number; templateHash: string };
      await this.requireWorkspaceAdmin(
        client,
        input.actorId,
        input.workspaceId,
        input.correlationId,
      );
      const latest = await client.query<{ version: number; revision: number }>(
        `select version, revision from requirement_template_versions
          where workspace_id = $1 order by version desc limit 1 for update`,
        [input.workspaceId],
      );
      if ((latest.rows[0]?.revision ?? 0) !== input.expectedRevision) {
        throw conflict(input.correlationId);
      }
      const version = (latest.rows[0]?.version ?? 0) + 1;
      await client.query(
        `insert into requirement_template_versions
          (id, workspace_id, version, base_version, state, revision, template_hash,
           definitions_json, published_by, published_at, created_by)
         values ($1, $2, $3, '1', 'PUBLISHED', 1, $4, $5::jsonb, $6, now(), $6)`,
        [
          input.templateVersionId,
          input.workspaceId,
          version,
          templateHash,
          JSON.stringify(definitions),
          input.actorId,
        ],
      );
      const result = { id: input.templateVersionId, version, templateHash };
      await this.audit(
        client,
        input,
        input.templateVersionId,
        1,
        'requirement.template-published',
        result,
      );
      await this.finish(client, input, result);
      return result;
    });
  }

  async snapshotTemplate(
    input: Parameters<RequirementTemplateStore['snapshotTemplate']>[0],
  ): ReturnType<RequirementTemplateStore['snapshotTemplate']> {
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'snapshot-requirement-template', input);
      if (replay !== undefined) {
        return replay as { id: string; templateHash: string; fields: RequirementFieldDefinition[] };
      }
      await this.requireProjectMember(client, input.actorId, input.workspaceId, input.projectId);
      const selected = await client.query<{
        template_hash: string;
        definitions_json: RequirementFieldDefinition[];
      }>(
        `select template_hash, definitions_json from requirement_template_versions
          where id = $1 and workspace_id = $2 and state = 'PUBLISHED'`,
        [input.templateVersionId, input.workspaceId],
      );
      const template = selected.rows[0];
      if (template === undefined) throw notFound(input.correlationId);
      await client.query(
        `insert into project_requirement_template_snapshots
          (id, workspace_id, project_id, template_version_id, template_hash,
           definitions_json, created_by)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)
         on conflict (project_id, template_version_id) do nothing`,
        [
          input.snapshotId,
          input.workspaceId,
          input.projectId,
          input.templateVersionId,
          template.template_hash,
          JSON.stringify(template.definitions_json),
          input.actorId,
        ],
      );
      const stored = await client.query<{
        id: string;
        template_hash: string;
        definitions_json: RequirementFieldDefinition[];
      }>(
        `select id, template_hash, definitions_json
           from project_requirement_template_snapshots
          where workspace_id = $1 and project_id = $2 and template_version_id = $3`,
        [input.workspaceId, input.projectId, input.templateVersionId],
      );
      const row = stored.rows[0];
      if (row === undefined) throw notFound(input.correlationId);
      const result = { id: row.id, templateHash: row.template_hash, fields: row.definitions_json };
      await this.finish(client, input, result);
      return result;
    });
  }

  async saveField(
    input: Parameters<RequirementCommandStore['saveField']>[0],
  ): ReturnType<RequirementCommandStore['saveField']> {
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'save-requirement-field', input);
      if (replay !== undefined) return replay as { revision: number };
      await this.requireProjectEditor(client, input.actorId, input.workspaceId, input.projectId);
      const artifact = await client.query<{ revision: number; kind_key: string }>(
        `select revision, kind_key from artifacts
          where workspace_id = $1 and project_id = $2 and id = $3 for update`,
        [input.workspaceId, input.projectId, input.artifactId],
      );
      const row = artifact.rows[0];
      if (row?.kind_key !== 'REQUIREMENT') throw notFound(input.correlationId);
      if (row.revision !== input.expectedRevision) throw conflict(input.correlationId);
      const latest = await client.query<{ revision: number }>(
        `select revision from requirement_field_revisions
          where artifact_id = $1 and field_key = $2 order by revision desc limit 1`,
        [input.artifactId, input.fieldKey],
      );
      const fieldRevision = (latest.rows[0]?.revision ?? 0) + 1;
      await client.query(
        `insert into requirement_field_revisions
          (id, workspace_id, project_id, artifact_id, field_key, revision, state, value_json,
           audience, human_note, risk_owner_id, risk_review_date, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
        [
          input.fieldRevisionId,
          input.workspaceId,
          input.projectId,
          input.artifactId,
          input.fieldKey,
          fieldRevision,
          input.state,
          input.value === null ? null : JSON.stringify(input.value),
          input.audience,
          input.humanNote,
          input.riskOwnerId,
          input.riskReviewDate,
          input.actorId,
        ],
      );
      const revision = row.revision + 1;
      await client.query(`update artifacts set revision = $2, updated_at = now() where id = $1`, [
        input.artifactId,
        revision,
      ]);
      const result = { revision };
      await this.audit(client, input, input.artifactId, revision, 'requirement.field-saved', {
        fieldKey: input.fieldKey,
        state: input.state,
        audience: input.audience,
      });
      await this.finish(client, input, result);
      return result;
    });
  }

  async createCitation(
    input: Parameters<RequirementCommandStore['createCitation']>[0],
  ): ReturnType<RequirementCommandStore['createCitation']> {
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'create-requirement-citation', input);
      if (replay !== undefined) return replay as { id: string };
      await this.requireProjectEditor(client, input.actorId, input.workspaceId, input.projectId);
      const evidence = await client.query<{ audience: string }>(
        `select source.audience
           from source_generations generation
           join source_artifacts source
             on source.workspace_id = generation.workspace_id
            and source.project_id = generation.project_id
            and source.id = generation.source_artifact_id
           join source_locators locator
             on locator.workspace_id = generation.workspace_id
            and locator.project_id = generation.project_id
            and locator.source_generation_id = generation.id
          where generation.workspace_id = $1 and generation.project_id = $2
            and generation.id = $3 and locator.id = $4
            and $5::uuid[] <@ (
              select coalesce(array_agg(block.id), '{}'::uuid[])
                from normalized_blocks block
               where block.workspace_id = generation.workspace_id
                 and block.project_id = generation.project_id
                 and block.source_generation_id = generation.id
                 and block.source_locator_id = locator.id
            )`,
        [
          input.workspaceId,
          input.projectId,
          input.sourceGenerationId,
          input.locatorId,
          input.blockIds,
        ],
      );
      const row = evidence.rows[0];
      if (row === undefined) throw notFound(input.correlationId);
      const audience =
        row.audience === 'TEAM_ONLY' || input.audience === 'TEAM_ONLY'
          ? 'TEAM_ONLY'
          : 'CLIENT_VISIBLE';
      await client.query(
        `insert into requirement_citations
          (id, workspace_id, project_id, source_generation_id, locator_id, block_ids,
           locator_excerpt_hash, audience)
         values ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)`,
        [
          input.citationId,
          input.workspaceId,
          input.projectId,
          input.sourceGenerationId,
          input.locatorId,
          input.blockIds,
          input.locatorExcerptHash,
          audience,
        ],
      );
      const result = { id: input.citationId };
      await this.finish(client, input, result);
      return result;
    });
  }

  async getBody(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<RequirementBody> {
    const roles = await this.requireProjectMember(this.pool, actorId, workspaceId, projectId);
    const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
    const snapshot = await this.pool.query<{ id: string; template_hash: string }>(
      `select snapshot.id, snapshot.template_hash
         from artifacts artifact
         join project_requirement_template_snapshots snapshot
           on snapshot.workspace_id = artifact.workspace_id
          and snapshot.project_id = artifact.project_id
        where artifact.workspace_id = $1 and artifact.project_id = $2 and artifact.id = $3
          and artifact.kind_key = 'REQUIREMENT'
        order by snapshot.created_at desc limit 1`,
      [workspaceId, projectId, artifactId],
    );
    const template = snapshot.rows[0];
    if (template === undefined) throw notFound();
    const fields = await this.pool.query<{
      field_key: string;
      value_json: unknown;
      state: RequirementBody['fields'][number]['state'];
      audience: RequirementBody['fields'][number]['audience'];
      human_note: string | null;
      risk_owner_id: string | null;
      risk_review_date: string | null;
    }>(
      `select distinct on (field_key)
              field_key, value_json, state, audience, human_note, risk_owner_id, risk_review_date
         from requirement_field_revisions
        where workspace_id = $1 and project_id = $2 and artifact_id = $3
          and ($4::boolean = false or audience = 'CLIENT_VISIBLE')
        order by field_key, revision desc`,
      [workspaceId, projectId, artifactId, clientOnly],
    );
    return requirementBodySchema.parse({
      templateSnapshotId: template.id,
      templateHash: template.template_hash,
      fields: fields.rows.map((field) => ({
        key: field.field_key,
        value: field.value_json,
        state: field.state,
        audience: field.audience,
        citationIds: [],
        humanNote: field.human_note,
        riskOwnerId: field.risk_owner_id,
        riskReviewDate: field.risk_review_date,
      })),
    });
  }

  async appendClaim(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    artifactId: string;
    intakeSetId: string;
    fieldKey: string;
    value: unknown;
    citationIds: string[];
    workflowKind: 'MANUAL' | 'FAKE_AI' | 'LIVE_AI';
    workflowVersion: string;
    workflowConfigHash: string;
  }): Promise<{ id: string; replayed: boolean; audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE' }> {
    return this.transaction(async (client) => {
      const citations = await client.query<{ id: string; audience: string }>(
        `select citation.id, citation.audience
           from requirement_citations citation
           join intake_set_sources intake_source
             on intake_source.workspace_id = citation.workspace_id
            and intake_source.project_id = citation.project_id
            and intake_source.source_generation_id = citation.source_generation_id
           join requirement_intake_sets requirement_intake
             on requirement_intake.workspace_id = intake_source.workspace_id
            and requirement_intake.project_id = intake_source.project_id
            and requirement_intake.intake_set_id = intake_source.intake_set_id
          where citation.workspace_id = $1 and citation.project_id = $2
            and citation.id = any($3::uuid[])
            and requirement_intake.artifact_id = $4
            and requirement_intake.intake_set_id = $5`,
        [
          input.workspaceId,
          input.projectId,
          input.citationIds,
          input.artifactId,
          input.intakeSetId,
        ],
      );
      if (citations.rows.length !== input.citationIds.length || citations.rows.length === 0) {
        throw notFound();
      }
      const audience = citations.rows.some((citation) => citation.audience === 'TEAM_ONLY')
        ? 'TEAM_ONLY'
        : 'CLIENT_VISIBLE';
      const fingerprint = requirementRecordFingerprint({
        kind: 'CLAIM',
        intakeSetId: input.intakeSetId,
        fieldKey: input.fieldKey,
        value: input.value as string,
      });
      const inserted = await client.query<{ id: string }>(
        `insert into requirement_claims
          (id, workspace_id, project_id, intake_set_id, field_key, fingerprint, value_json,
           citation_ids, audience, workflow_kind, workflow_version, workflow_config_hash)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::uuid[], $9, $10, $11, $12)
         on conflict (intake_set_id, fingerprint) do nothing returning id`,
        [
          input.id,
          input.workspaceId,
          input.projectId,
          input.intakeSetId,
          input.fieldKey,
          fingerprint,
          JSON.stringify(input.value),
          input.citationIds,
          audience,
          input.workflowKind,
          input.workflowVersion,
          input.workflowConfigHash,
        ],
      );
      if (inserted.rows[0] !== undefined) return { id: input.id, replayed: false, audience };
      const existing = await client.query<{ id: string; audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE' }>(
        `select id, audience from requirement_claims
          where intake_set_id = $1 and fingerprint = $2`,
        [input.intakeSetId, fingerprint],
      );
      const existingRow = existing.rows[0];
      if (existingRow === undefined) throw notFound();
      return { id: existingRow.id, replayed: true, audience: existingRow.audience };
    });
  }

  async loadExtractionContext(
    workspaceId: string,
    projectId: string,
    intakeSetId: string,
  ): Promise<{
    artifactId: string;
    actorId: string;
    templateHash: string;
    blocks: {
      id: string;
      sourceGenerationId: string;
      locatorId: string;
      text: string;
      audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
    }[];
  }> {
    const context = await this.pool.query<{
      artifact_id: string;
      created_by: string;
      template_hash: string;
    }>(
      `select intake.artifact_id, intake.created_by,
              draft.body_json ->> 'templateHash' as template_hash
         from requirement_intake_sets intake
         join artifacts artifact
           on artifact.workspace_id = intake.workspace_id
          and artifact.project_id = intake.project_id and artifact.id = intake.artifact_id
         join artifact_draft_revisions draft on draft.id = artifact.current_draft_revision_id
        where intake.workspace_id = $1 and intake.project_id = $2
          and intake.intake_set_id = $3
          and artifact.kind_key = 'REQUIREMENT'
          and artifact.state in ('DRAFT', 'CHANGES_REQUESTED')`,
      [workspaceId, projectId, intakeSetId],
    );
    const row = context.rows[0];
    if (row === undefined || !/^[a-f0-9]{64}$/.test(row.template_hash)) throw notFound();
    const blocks = await this.pool.query<{
      id: string;
      source_generation_id: string;
      source_locator_id: string;
      text: string;
      audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
    }>(
      `select block.id, block.source_generation_id, block.source_locator_id,
              block.text, block.audience
         from intake_set_sources intake_source
         join normalized_blocks block
           on block.workspace_id = intake_source.workspace_id
          and block.project_id = intake_source.project_id
          and block.source_generation_id = intake_source.source_generation_id
        where intake_source.workspace_id = $1 and intake_source.project_id = $2
          and intake_source.intake_set_id = $3
        order by intake_source.ordinal, block.ordinal, block.id
        limit 20001`,
      [workspaceId, projectId, intakeSetId],
    );
    if (blocks.rows.length === 0 || blocks.rows.length > 20_000) throw notFound();
    return {
      artifactId: row.artifact_id,
      actorId: row.created_by,
      templateHash: row.template_hash,
      blocks: blocks.rows.map((block) => ({
        id: block.id,
        sourceGenerationId: block.source_generation_id,
        locatorId: block.source_locator_id,
        text: block.text,
        audience: block.audience,
      })),
    };
  }

  async dispositionClaim(input: {
    workspaceId: string;
    projectId: string;
    artifactId: string;
    actorId: string;
    expectedRevision: number;
    claimId: string;
    dispositionId: string;
    disposition: 'ACCEPTED' | 'EDITED' | 'REJECTED';
    editedValue: unknown;
    note: string | null;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ revision: number }> {
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'disposition-requirement-claim', input);
      if (replay !== undefined) return replay as { revision: number };
      await this.requireProjectEditor(client, input.actorId, input.workspaceId, input.projectId);
      if (
        (input.disposition === 'EDITED' && (input.editedValue === null || !input.note?.trim())) ||
        (input.disposition === 'REJECTED' && !input.note?.trim())
      ) {
        throw new Error('HUMAN_DISPOSITION_NOTE_REQUIRED');
      }
      const artifact = await client.query<{ revision: number }>(
        `select revision from artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
            and kind_key = 'REQUIREMENT' and state in ('DRAFT', 'CHANGES_REQUESTED')
          for update`,
        [input.workspaceId, input.projectId, input.artifactId],
      );
      const artifactRow = artifact.rows[0];
      if (artifactRow === undefined) throw notFound(input.correlationId);
      if (artifactRow.revision !== input.expectedRevision) throw conflict(input.correlationId);
      const inserted = await client.query(
        `insert into requirement_claim_dispositions
          (id, workspace_id, project_id, claim_id, disposition, edited_value_json, note, actor_id)
         select $1, $2, $3, claim.id, $5, $6::jsonb, $7, $8
           from requirement_claims claim
           join requirement_intake_sets intake
             on intake.workspace_id = claim.workspace_id
            and intake.project_id = claim.project_id
            and intake.intake_set_id = claim.intake_set_id
          where claim.workspace_id = $2 and claim.project_id = $3 and claim.id = $4
            and intake.artifact_id = $9
         on conflict (claim_id) do nothing returning id`,
        [
          input.dispositionId,
          input.workspaceId,
          input.projectId,
          input.claimId,
          input.disposition,
          input.editedValue === null ? null : JSON.stringify(input.editedValue),
          input.note,
          input.actorId,
          input.artifactId,
        ],
      );
      if ((inserted.rowCount ?? 0) !== 1) throw notFound(input.correlationId);
      const revision = artifactRow.revision + 1;
      await client.query(`update artifacts set revision = $2, updated_at = now() where id = $1`, [
        input.artifactId,
        revision,
      ]);
      const result = { revision };
      await this.audit(
        client,
        input,
        input.artifactId,
        revision,
        'requirement.claim-disposition-recorded',
        { claimId: input.claimId, disposition: input.disposition },
      );
      await this.finish(client, input, result);
      return result;
    });
  }

  async createConflict(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    artifactId: string;
    fieldKey: string;
    claimIds: string[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }): Promise<{ id: string; replayed: boolean }> {
    if (input.claimIds.length < 2) throw new Error('CONFLICT_REQUIRES_MULTIPLE_CLAIMS');
    const fingerprint = requirementRecordFingerprint({
      kind: 'CONFLICT',
      artifactId: input.artifactId,
      fieldKey: input.fieldKey,
      claimIds: input.claimIds,
    });
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `with inserted as (
         insert into requirement_conflicts
          (id, workspace_id, project_id, artifact_id, field_key, fingerprint, claim_ids, severity)
         select $1, $2, $3, $4, $5, $6, $7::uuid[], $8
          where (select count(*) from requirement_claims claim
                  join requirement_intake_sets intake
                    on intake.workspace_id = claim.workspace_id
                   and intake.project_id = claim.project_id
                   and intake.intake_set_id = claim.intake_set_id
                 where claim.workspace_id = $2 and claim.project_id = $3
                   and intake.artifact_id = $4 and claim.id = any($7::uuid[]))
                = cardinality($7::uuid[])
         on conflict (artifact_id, fingerprint) do nothing returning id
       )
       select id, true as inserted from inserted
       union all select id, false as inserted from requirement_conflicts
        where artifact_id = $4 and fingerprint = $6 limit 1`,
      [
        input.id,
        input.workspaceId,
        input.projectId,
        input.artifactId,
        input.fieldKey,
        fingerprint,
        input.claimIds,
        input.severity,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw notFound();
    return { id: row.id, replayed: !row.inserted };
  }

  async resolveConflict(input: {
    workspaceId: string;
    projectId: string;
    artifactId: string;
    actorId: string;
    conflictId: string;
    resolutionId: string;
    expectedArtifactRevision: number;
    expectedConflictRevision: number;
    selectedClaimId: string | null;
    authoredValue: unknown;
    note: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ revision: number }> {
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'resolve-requirement-conflict', input);
      if (replay !== undefined) return replay as { revision: number };
      await this.requireProjectEditor(client, input.actorId, input.workspaceId, input.projectId);
      if (
        (input.selectedClaimId === null) === (input.authoredValue === null) ||
        input.note.trim().length < 2
      ) {
        throw new Error('CONFLICT_RESOLUTION_INVALID');
      }
      const artifact = await client.query<{ revision: number }>(
        `select revision from artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
            and kind_key = 'REQUIREMENT' and state in ('DRAFT', 'CHANGES_REQUESTED')
          for update`,
        [input.workspaceId, input.projectId, input.artifactId],
      );
      const artifactRow = artifact.rows[0];
      if (artifactRow === undefined) throw notFound(input.correlationId);
      if (artifactRow.revision !== input.expectedArtifactRevision) {
        throw conflict(input.correlationId);
      }
      const locked = await client.query<{ revision: number; claim_ids: string[] }>(
        `select revision, claim_ids from requirement_conflicts
          where workspace_id = $1 and project_id = $2 and artifact_id = $3
            and id = $4 and state = 'OPEN'
          for update`,
        [input.workspaceId, input.projectId, input.artifactId, input.conflictId],
      );
      const conflictRow = locked.rows[0];
      if (conflictRow === undefined) throw notFound(input.correlationId);
      if (conflictRow.revision !== input.expectedConflictRevision) {
        throw conflict(input.correlationId);
      }
      if (
        input.selectedClaimId !== null &&
        !conflictRow.claim_ids.includes(input.selectedClaimId)
      ) {
        throw notFound(input.correlationId);
      }
      await client.query(
        `insert into requirement_conflict_resolutions
          (id, workspace_id, project_id, conflict_id, selected_claim_id,
           authored_value_json, note, actor_id)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          input.resolutionId,
          input.workspaceId,
          input.projectId,
          input.conflictId,
          input.selectedClaimId,
          input.authoredValue === null ? null : JSON.stringify(input.authoredValue),
          input.note,
          input.actorId,
        ],
      );
      await client.query(
        `update requirement_conflicts set state = 'RESOLVED', revision = revision + 1
          where id = $1`,
        [input.conflictId],
      );
      const revision = artifactRow.revision + 1;
      await client.query(`update artifacts set revision = $2, updated_at = now() where id = $1`, [
        input.artifactId,
        revision,
      ]);
      const result = { revision };
      await this.audit(client, input, input.artifactId, revision, 'requirement.conflict-resolved', {
        conflictId: input.conflictId,
      });
      await this.finish(client, input, result);
      return result;
    });
  }

  async createGap(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    artifactId: string;
    fieldKey: string;
    reason: 'MISSING' | 'WEAK_SUPPORT' | 'CONFLICT' | 'CONDITIONALLY_REQUIRED';
    blocking: boolean;
  }): Promise<{ id: string; replayed: boolean }> {
    const fingerprint = requirementRecordFingerprint({
      kind: 'GAP',
      artifactId: input.artifactId,
      fieldKey: input.fieldKey,
      reason: input.reason,
    });
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `with inserted as (
         insert into requirement_gaps
          (id, workspace_id, project_id, artifact_id, field_key, fingerprint, reason, blocking)
         select $1, $2, $3, artifact.id, $5, $6, $7, $8
           from artifacts artifact
          where artifact.workspace_id = $2 and artifact.project_id = $3
            and artifact.id = $4 and artifact.kind_key = 'REQUIREMENT'
         on conflict (artifact_id, fingerprint) do nothing returning id
       )
       select id, true as inserted from inserted
       union all select id, false as inserted from requirement_gaps
        where artifact_id = $4 and fingerprint = $6 limit 1`,
      [
        input.id,
        input.workspaceId,
        input.projectId,
        input.artifactId,
        input.fieldKey,
        fingerprint,
        input.reason,
        input.blocking,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw notFound();
    return { id: row.id, replayed: !row.inserted };
  }

  async dispositionGap(input: {
    workspaceId: string;
    projectId: string;
    artifactId: string;
    actorId: string;
    gapId: string;
    dispositionId: string;
    expectedArtifactRevision: number;
    expectedGapRevision: number;
    disposition: 'RESOLVED' | 'NOT_APPLICABLE' | 'ACCEPTED_RISK';
    fieldRevisionId: string | null;
    justification: string | null;
    riskOwnerId: string | null;
    riskConsequence: string | null;
    riskReviewDate: string | null;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ revision: number }> {
    return this.transaction(async (client) => {
      const replay = await this.begin(client, 'disposition-requirement-gap', input);
      if (replay !== undefined) return replay as { revision: number };
      await this.requireProjectEditor(client, input.actorId, input.workspaceId, input.projectId);
      const artifact = await client.query<{ revision: number }>(
        `select revision from artifacts
          where workspace_id = $1 and project_id = $2 and id = $3
            and kind_key = 'REQUIREMENT' and state in ('DRAFT', 'CHANGES_REQUESTED')
          for update`,
        [input.workspaceId, input.projectId, input.artifactId],
      );
      const artifactRow = artifact.rows[0];
      if (artifactRow === undefined) throw notFound(input.correlationId);
      if (artifactRow.revision !== input.expectedArtifactRevision) {
        throw conflict(input.correlationId);
      }
      const gap = await client.query<{ revision: number }>(
        `select revision from requirement_gaps
          where workspace_id = $1 and project_id = $2 and artifact_id = $3
            and id = $4 and state = 'OPEN'
          for update`,
        [input.workspaceId, input.projectId, input.artifactId, input.gapId],
      );
      if (gap.rows[0] === undefined) throw notFound(input.correlationId);
      if (gap.rows[0].revision !== input.expectedGapRevision) throw conflict(input.correlationId);
      const valid =
        (input.disposition === 'RESOLVED' && input.fieldRevisionId !== null) ||
        (input.disposition === 'NOT_APPLICABLE' &&
          (input.justification?.trim().length ?? 0) >= 8) ||
        (input.disposition === 'ACCEPTED_RISK' &&
          input.riskOwnerId !== null &&
          input.riskReviewDate !== null &&
          (input.justification?.trim().length ?? 0) >= 8 &&
          (input.riskConsequence?.trim().length ?? 0) >= 8);
      if (!valid) throw new Error('GAP_DISPOSITION_INVALID');
      await client.query(
        `insert into requirement_gap_dispositions
          (id, workspace_id, project_id, gap_id, disposition, field_revision_id,
           justification, risk_owner_id, risk_consequence, risk_review_date, actor_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          input.dispositionId,
          input.workspaceId,
          input.projectId,
          input.gapId,
          input.disposition,
          input.fieldRevisionId,
          input.justification,
          input.riskOwnerId,
          input.riskConsequence,
          input.riskReviewDate,
          input.actorId,
        ],
      );
      await client.query(
        `update requirement_gaps set state = 'RESOLVED', revision = revision + 1 where id = $1`,
        [input.gapId],
      );
      const revision = artifactRow.revision + 1;
      await client.query(`update artifacts set revision = $2, updated_at = now() where id = $1`, [
        input.artifactId,
        revision,
      ]);
      const result = { revision };
      await this.audit(
        client,
        input,
        input.artifactId,
        revision,
        'requirement.gap-disposition-recorded',
        { gapId: input.gapId, disposition: input.disposition },
      );
      await this.finish(client, input, result);
      return result;
    });
  }

  async listIntelligence(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<{ claims: unknown[]; conflicts: unknown[]; gaps: unknown[] }> {
    const roles = await this.requireProjectMember(this.pool, actorId, workspaceId, projectId);
    const clientOnly = roles.includes('CLIENT_STAKEHOLDER');
    const artifact = await this.pool.query(
      `select 1 from artifacts
        where workspace_id = $1 and project_id = $2 and id = $3
          and kind_key = 'REQUIREMENT'
          and ($4::boolean = false or audience = 'CLIENT_VISIBLE')`,
      [workspaceId, projectId, artifactId, clientOnly],
    );
    if ((artifact.rowCount ?? 0) !== 1) throw notFound();
    const claims = await this.pool.query(
      `select claim.id, claim.field_key, claim.value_json, claim.citation_ids, claim.audience,
              disposition.disposition, disposition.edited_value_json, disposition.note
         from requirement_claims claim
         join requirement_intake_sets intake
           on intake.workspace_id = claim.workspace_id
          and intake.project_id = claim.project_id
          and intake.intake_set_id = claim.intake_set_id
         left join requirement_claim_dispositions disposition on disposition.claim_id = claim.id
        where claim.workspace_id = $1 and claim.project_id = $2
          and intake.artifact_id = $3
          and ($4::boolean = false or claim.audience = 'CLIENT_VISIBLE')
        order by claim.created_at, claim.id`,
      [workspaceId, projectId, artifactId, clientOnly],
    );
    const conflicts = await this.pool.query(
      `select conflict.id, conflict.field_key, conflict.claim_ids, conflict.severity,
              conflict.state, conflict.revision
         from requirement_conflicts conflict
        where conflict.workspace_id = $1 and conflict.project_id = $2
          and conflict.artifact_id = $3
          and ($4::boolean = false or not exists (
            select 1 from requirement_claims claim
             where claim.id = any(conflict.claim_ids) and claim.audience = 'TEAM_ONLY'
          ))
        order by conflict.id`,
      [workspaceId, projectId, artifactId, clientOnly],
    );
    const gaps = await this.pool.query(
      `select gap.id, gap.field_key, gap.reason, gap.blocking, gap.state, gap.revision
         from requirement_gaps gap
        where gap.workspace_id = $1 and gap.project_id = $2 and gap.artifact_id = $3
          and ($4::boolean = false or exists (
            select 1 from requirement_field_revisions field
             where field.artifact_id = gap.artifact_id and field.field_key = gap.field_key
               and field.audience = 'CLIENT_VISIBLE'
               and field.revision = (
                 select max(latest.revision) from requirement_field_revisions latest
                  where latest.artifact_id = field.artifact_id
                    and latest.field_key = field.field_key
               )
          ))
        order by gap.id`,
      [workspaceId, projectId, artifactId, clientOnly],
    );
    return { claims: claims.rows, conflicts: conflicts.rows, gaps: gaps.rows };
  }

  private async requireWorkspaceAdmin(
    client: Pick<DatabasePool, 'query'>,
    actorId: string,
    workspaceId: string,
    correlationId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1 from workspace_memberships
        where workspace_id = $1 and user_id = $2 and state = 'ACTIVE' and role = 'ADMIN'`,
      [workspaceId, actorId],
    );
    if ((result.rowCount ?? 0) !== 1) throw notFound(correlationId);
  }

  private async requireProjectMember(
    client: Pick<DatabasePool, 'query'>,
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<string[]> {
    const result = await client.query<{ roles: string[] }>(
      `select coalesce(array_agg(role.role), '{}'::project_role[])::text[] as roles
         from project_memberships membership
         left join project_membership_roles role
           on role.workspace_id = membership.workspace_id
          and role.project_id = membership.project_id and role.user_id = membership.user_id
        where membership.workspace_id = $1 and membership.project_id = $2
          and membership.user_id = $3 and membership.state = 'ACTIVE'
        group by membership.user_id`,
      [workspaceId, projectId, actorId],
    );
    const roles = result.rows[0]?.roles;
    if (roles === undefined) throw notFound();
    return roles;
  }

  private async requireProjectEditor(
    client: Pick<DatabasePool, 'query'>,
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const roles = await this.requireProjectMember(client, actorId, workspaceId, projectId);
    if (!roles.some((role) => ['PM', 'LEAD', 'CONTRIBUTOR'].includes(role))) throw notFound();
  }

  private async begin(
    client: PoolClient,
    operation: string,
    input: IdempotentInput & object,
  ): Promise<unknown> {
    const requestHash = hash(operation, input);
    const inserted = await client.query(
      `insert into idempotency_records
        (workspace_id, idempotency_key, request_hash, status, correlation_id)
       values ($1, $2, $3, 'PROCESSING', $4)
       on conflict do nothing`,
      [input.workspaceId, input.idempotencyKey, requestHash, input.correlationId],
    );
    if ((inserted.rowCount ?? 0) === 1) return undefined;
    const existing = await client.query<ReplayRow>(
      `select request_hash, status, result from idempotency_records
        where workspace_id = $1 and idempotency_key = $2 for update`,
      [input.workspaceId, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (row?.request_hash !== requestHash || row.status !== 'COMPLETED') {
      throw new ApplicationError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This idempotency key cannot be reused.',
        correlationId: input.correlationId,
      });
    }
    return row.result;
  }

  private async finish(client: PoolClient, input: IdempotentInput, result: unknown): Promise<void> {
    await client.query(
      `update idempotency_records
          set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
        where workspace_id = $1 and idempotency_key = $2`,
      [input.workspaceId, input.idempotencyKey, JSON.stringify(result)],
    );
  }

  private async audit(
    client: PoolClient,
    input: AuditedInput,
    targetId: string,
    revision: number,
    action: string,
    summary: unknown,
  ): Promise<void> {
    const eventId = uuidv7();
    await client.query(
      `insert into audit_events
        (id, workspace_id, project_id, actor_id, action, target_type, target_id,
         correlation_id, after_summary)
       values ($1, $2, $3, $4, $5, 'Requirement', $6, $7, $8::jsonb)`,
      [
        uuidv7(),
        input.workspaceId,
        input.projectId ?? null,
        input.actorId,
        action,
        targetId,
        input.correlationId,
        JSON.stringify(summary),
      ],
    );
    await client.query(
      `insert into outbox_events
        (id, workspace_id, aggregate_type, aggregate_id, aggregate_revision,
         event_type, schema_version, payload, correlation_id)
       values ($1, $2, 'Requirement', $3, $4, $5, '1', $6::jsonb, $7)`,
      [
        eventId,
        input.workspaceId,
        targetId,
        revision,
        `${action}.v1`,
        JSON.stringify({
          schemaVersion: '1',
          eventId,
          workspaceId: input.workspaceId,
          projectId: input.projectId ?? null,
          aggregateRevision: revision,
          correlationId: input.correlationId,
        }),
        input.correlationId,
      ],
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
}
