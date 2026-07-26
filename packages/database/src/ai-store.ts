import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ApplicationError } from '@delivery-os/application';
import type { PoolClient } from 'pg';

import type { DatabasePool } from './pool';

const MONTHLY_LIMIT_MICROUSD = 100_000_000;
const RUN_RESERVATION_MICROUSD = 1_000_000;

type Provider = 'openai' | 'anthropic';
type Audience = 'TEAM_ONLY' | 'CLIENT_VISIBLE';

export type AiGenerationPayload = Readonly<{
  prompt: unknown;
  output: unknown;
}>;

export class AiProvenanceCipher {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.byteLength !== 32 || this.key.toString('base64') !== encodedKey) {
      throw new Error('AI_PROVENANCE_KEY_INVALID');
    }
  }

  encrypt(payload: AiGenerationPayload, associatedData: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(associatedData));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(ciphertext: string, associatedData: string): AiGenerationPayload {
    const [version, encodedNonce, encodedTag, encodedBody, ...extra] = ciphertext.split('.');
    if (
      version !== 'v1' ||
      encodedNonce === undefined ||
      encodedTag === undefined ||
      encodedBody === undefined ||
      extra.length > 0
    ) {
      throw new Error('AI_PROVENANCE_CIPHERTEXT_INVALID');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encodedNonce, 'base64url'),
    );
    decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedBody, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as AiGenerationPayload;
  }
}

export class PostgresAiWorkflowStore {
  constructor(
    private readonly pool: DatabasePool,
    private readonly cipher?: AiProvenanceCipher,
  ) {}

  async configureWorkspace(input: {
    workspaceId: string;
    actorId: string;
    correlationId: string;
    expectedRevision: number;
    provider: Provider;
    workflowConfigHash: string;
    globalEnabled: boolean;
    requirementExtractionEnabled: boolean;
    provenanceRetentionDays: number;
    aggregateQualityMetricsEnabled: boolean;
  }): Promise<{ revision: number }> {
    return this.transaction(async (client) => {
      const admin = await client.query(
        `select 1 from workspace_memberships
          where workspace_id = $1 and user_id = $2 and state = 'ACTIVE' and role = 'ADMIN'`,
        [input.workspaceId, input.actorId],
      );
      if ((admin.rowCount ?? 0) !== 1) {
        throw new ApplicationError({
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          correlationId: input.correlationId,
        });
      }
      const current = await client.query<{ revision: number }>(
        `select revision from ai_workflow_settings where workspace_id = $1 for update`,
        [input.workspaceId],
      );
      const revision = current.rows[0]?.revision ?? 0;
      if (revision !== input.expectedRevision) {
        throw new ApplicationError({
          code: 'REVISION_CONFLICT',
          message: 'The AI workflow settings changed. Refresh and try again.',
          correlationId: input.correlationId,
          currentRevision: revision,
        });
      }
      const nextRevision = revision + 1;
      await client.query(
        `insert into ai_workflow_settings
          (workspace_id, provider, workflow_config_hash, global_enabled,
           requirement_extraction_enabled, provenance_retention_days,
           aggregate_quality_metrics_enabled, revision, updated_by, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         on conflict (workspace_id) do update
           set provider = excluded.provider,
               workflow_config_hash = excluded.workflow_config_hash,
               global_enabled = excluded.global_enabled,
               requirement_extraction_enabled = excluded.requirement_extraction_enabled,
               provenance_retention_days = excluded.provenance_retention_days,
               aggregate_quality_metrics_enabled = excluded.aggregate_quality_metrics_enabled,
               revision = excluded.revision,
               updated_by = excluded.updated_by,
               updated_at = now()`,
        [
          input.workspaceId,
          input.provider,
          input.workflowConfigHash,
          input.globalEnabled,
          input.requirementExtractionEnabled,
          input.provenanceRetentionDays,
          input.aggregateQualityMetricsEnabled,
          nextRevision,
          input.actorId,
        ],
      );
      return { revision: nextRevision };
    });
  }

  async reserveRun(input: {
    reservationId: string;
    workspaceId: string;
    projectId: string;
    artifactId: string;
    intakeSetId: string;
    provider: Provider;
    modelId: string;
    workflowConfigHash: string;
    now?: Date;
  }): Promise<{ replayed: boolean; alerts: readonly (50 | 80)[] }> {
    return this.transaction(async (client) => {
      const existing = await client.query<{
        provider: Provider;
        model_id: string;
        workflow_config_hash: string;
      }>(
        `select provider, model_id, workflow_config_hash from ai_run_reservations
          where workspace_id = $1 and project_id = $2 and id = $3`,
        [input.workspaceId, input.projectId, input.reservationId],
      );
      const replay = existing.rows[0];
      if (replay !== undefined) {
        if (
          replay.provider !== input.provider ||
          replay.model_id !== input.modelId ||
          replay.workflow_config_hash !== input.workflowConfigHash
        ) {
          throw new Error('AI_RESERVATION_ID_REUSED');
        }
        return { replayed: true, alerts: [] };
      }
      const authorized = await client.query<{
        global_enabled: boolean;
        requirement_extraction_enabled: boolean;
        provider: Provider;
        workflow_config_hash: string;
      }>(
        `select setting.global_enabled, setting.requirement_extraction_enabled,
                setting.provider, setting.workflow_config_hash
           from requirement_intake_sets intake
           join ai_workflow_settings setting on setting.workspace_id = intake.workspace_id
          where intake.workspace_id = $1 and intake.project_id = $2
            and intake.artifact_id = $3 and intake.intake_set_id = $4`,
        [input.workspaceId, input.projectId, input.artifactId, input.intakeSetId],
      );
      const setting = authorized.rows[0];
      if (
        setting === undefined ||
        !setting.global_enabled ||
        !setting.requirement_extraction_enabled
      ) {
        throw new Error('AI_WORKFLOW_DISABLED');
      }
      if (
        setting.provider !== input.provider ||
        setting.workflow_config_hash !== input.workflowConfigHash
      ) {
        throw new Error('AI_WORKFLOW_CONFIG_MISMATCH');
      }
      const now = input.now ?? new Date();
      const budgetMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
        2,
        '0',
      )}-01`;
      await client.query(
        `insert into ai_budget_months (workspace_id, budget_month)
         values ($1, $2) on conflict do nothing`,
        [input.workspaceId, budgetMonth],
      );
      const budget = await client.query<{
        reserved_microusd: string;
        alert_50_emitted: boolean;
        alert_80_emitted: boolean;
      }>(
        `select reserved_microusd, alert_50_emitted, alert_80_emitted
           from ai_budget_months
          where workspace_id = $1 and budget_month = $2 for update`,
        [input.workspaceId, budgetMonth],
      );
      const row = budget.rows[0];
      if (row === undefined) throw new Error('AI_BUDGET_STATE_MISSING');
      const prior = Number(row.reserved_microusd);
      const next = prior + RUN_RESERVATION_MICROUSD;
      if (next > MONTHLY_LIMIT_MICROUSD) throw new Error('AI_BUDGET_EXHAUSTED');
      const alerts: (50 | 80)[] = [];
      if (!row.alert_50_emitted && prior < 50_000_000 && next >= 50_000_000) alerts.push(50);
      if (!row.alert_80_emitted && prior < 80_000_000 && next >= 80_000_000) alerts.push(80);
      await client.query(
        `update ai_budget_months
            set reserved_microusd = $3,
                alert_50_emitted = alert_50_emitted or $4,
                alert_80_emitted = alert_80_emitted or $5,
                updated_at = now()
          where workspace_id = $1 and budget_month = $2`,
        [input.workspaceId, budgetMonth, next, alerts.includes(50), alerts.includes(80)],
      );
      await client.query(
        `insert into ai_run_reservations
          (id, workspace_id, project_id, artifact_id, intake_set_id, provider, model_id,
           workflow_config_hash, reserved_microusd)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.reservationId,
          input.workspaceId,
          input.projectId,
          input.artifactId,
          input.intakeSetId,
          input.provider,
          input.modelId,
          input.workflowConfigHash,
          RUN_RESERVATION_MICROUSD,
        ],
      );
      return { replayed: false, alerts };
    });
  }

  async commitSuccess(input: {
    generationId: string;
    reservationId: string;
    workspaceId: string;
    projectId: string;
    artifactId: string;
    intakeSetId: string;
    provider: Provider;
    modelId: string;
    promptVersion: string;
    schemaVersion: string;
    workflowConfigHash: string;
    inputHash: string;
    outputHash: string;
    audience: Audience;
    inputTokens: number;
    outputTokens: number;
    payload: AiGenerationPayload;
  }): Promise<{ replayed: boolean; retainedUntil: Date | null }> {
    return this.transaction(async (client) => {
      const existing = await client.query<{ id: string }>(
        `select id from ai_generations
          where workspace_id = $1 and project_id = $2 and reservation_id = $3`,
        [input.workspaceId, input.projectId, input.reservationId],
      );
      if (existing.rows[0] !== undefined) return { replayed: true, retainedUntil: null };
      const reservation = await client.query<{
        provider: Provider;
        model_id: string;
        workflow_config_hash: string;
        state: string;
      }>(
        `select provider, model_id, workflow_config_hash, state
           from ai_run_reservations
          where workspace_id = $1 and project_id = $2 and id = $3
            and artifact_id = $4 and intake_set_id = $5
          for update`,
        [
          input.workspaceId,
          input.projectId,
          input.reservationId,
          input.artifactId,
          input.intakeSetId,
        ],
      );
      const run = reservation.rows[0];
      if (run?.state !== 'RESERVED') throw new Error('AI_RESERVATION_NOT_FOUND');
      if (
        run.provider !== input.provider ||
        run.model_id !== input.modelId ||
        run.workflow_config_hash !== input.workflowConfigHash
      ) {
        throw new Error('AI_WORKFLOW_CONFIG_MISMATCH');
      }
      const setting = await client.query<{ provenance_retention_days: number }>(
        `select provenance_retention_days from ai_workflow_settings
          where workspace_id = $1 and workflow_config_hash = $2`,
        [input.workspaceId, input.workflowConfigHash],
      );
      const retentionDays = setting.rows[0]?.provenance_retention_days;
      if (retentionDays === undefined) throw new Error('AI_WORKFLOW_CONFIG_MISMATCH');
      await client.query(
        `insert into ai_generations
          (id, workspace_id, project_id, artifact_id, intake_set_id, reservation_id,
           provider, model_id, prompt_version, schema_version, workflow_config_hash,
           input_hash, output_hash, audience)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          input.generationId,
          input.workspaceId,
          input.projectId,
          input.artifactId,
          input.intakeSetId,
          input.reservationId,
          input.provider,
          input.modelId,
          input.promptVersion,
          input.schemaVersion,
          input.workflowConfigHash,
          input.inputHash,
          input.outputHash,
          input.audience,
        ],
      );
      let retainedUntil: Date | null = null;
      if (retentionDays > 0) {
        if (this.cipher === undefined) throw new Error('AI_PROVENANCE_KEY_MISSING');
        retainedUntil = new Date(Date.now() + retentionDays * 86_400_000);
        const associatedData = [
          input.workspaceId,
          input.projectId,
          input.generationId,
          input.inputHash,
          input.outputHash,
        ].join(':');
        await client.query(
          `insert into ai_generation_payloads (generation_id, ciphertext, expires_at)
           values ($1, $2, $3)`,
          [input.generationId, this.cipher.encrypt(input.payload, associatedData), retainedUntil],
        );
      }
      await client.query(
        `update ai_run_reservations
            set state = 'SUCCEEDED', input_tokens = $2, output_tokens = $3, settled_at = now()
          where id = $1`,
        [input.reservationId, input.inputTokens, input.outputTokens],
      );
      return { replayed: false, retainedUntil };
    });
  }

  async recordFailure(input: {
    workspaceId: string;
    projectId: string;
    reservationId: string;
  }): Promise<void> {
    await this.pool.query(
      `update ai_run_reservations set state = 'FAILED', settled_at = now()
        where workspace_id = $1 and project_id = $2 and id = $3 and state = 'RESERVED'`,
      [input.workspaceId, input.projectId, input.reservationId],
    );
  }

  async readPayload(
    actorId: string,
    workspaceId: string,
    projectId: string,
    generationId: string,
  ): Promise<AiGenerationPayload> {
    const result = await this.pool.query<{
      artifact_id: string;
      input_hash: string;
      output_hash: string;
      ciphertext: string;
    }>(
      `select generation.artifact_id, generation.input_hash, generation.output_hash,
              payload.ciphertext
         from ai_generations generation
         join ai_generation_payloads payload on payload.generation_id = generation.id
         join project_memberships membership
           on membership.workspace_id = generation.workspace_id
          and membership.project_id = generation.project_id
          and membership.user_id = $1 and membership.state = 'ACTIVE'
        where generation.workspace_id = $2 and generation.project_id = $3
          and generation.id = $4 and payload.expires_at > now()
          and (generation.audience = 'CLIENT_VISIBLE' or exists (
            select 1 from project_membership_roles role
             where role.workspace_id = generation.workspace_id
               and role.project_id = generation.project_id and role.user_id = $1
               and role.role <> 'CLIENT_STAKEHOLDER'
          ))`,
      [actorId, workspaceId, projectId, generationId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('NOT_FOUND');
    if (this.cipher === undefined) throw new Error('AI_PROVENANCE_KEY_MISSING');
    return this.cipher.decrypt(
      row.ciphertext,
      [workspaceId, projectId, generationId, row.input_hash, row.output_hash].join(':'),
    );
  }

  async purgeExpiredPayloads(now = new Date()): Promise<number> {
    const result = await this.pool.query(
      `delete from ai_generation_payloads where expires_at <= $1`,
      [now],
    );
    return result.rowCount ?? 0;
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
