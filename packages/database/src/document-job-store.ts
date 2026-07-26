import type { DocumentJobClaim, DocumentJobRepository } from '@delivery-os/application';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

export class PostgresDocumentJobRepository implements DocumentJobRepository {
  constructor(private readonly pool: DatabasePool) {}

  async enqueue(
    input: Parameters<DocumentJobRepository['enqueue']>[0],
  ): ReturnType<DocumentJobRepository['enqueue']> {
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `with inserted as (
         insert into document_jobs
           (id, workspace_id, project_id, source_artifact_id, source_generation_id,
            intake_set_id, job_type, input_hash, config_version, correlation_id, maximum_attempts)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (workspace_id, project_id, job_type, input_hash, config_version) do nothing
         returning id
       )
       select id, true as inserted from inserted
       union all
       select id, false as inserted from document_jobs
        where workspace_id = $2 and project_id = $3 and job_type = $7
          and input_hash = $8 and config_version = $9
       limit 1`,
      [
        input.id,
        input.workspaceId,
        input.projectId,
        input.sourceArtifactId,
        input.sourceGenerationId,
        input.intakeSetId,
        input.jobType,
        input.inputHash,
        input.configVersion,
        input.correlationId,
        input.maximumAttempts ?? 3,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('DOCUMENT_JOB_ENQUEUE_FAILED');
    return { id: row.id, replayed: !row.inserted };
  }

  async claim(
    workerId: string,
    jobTypes: readonly DocumentJobClaim['jobType'][],
  ): Promise<DocumentJobClaim | null> {
    return this.transaction(async (client) => {
      const selected = await client.query<{
        id: string;
        workspace_id: string;
        project_id: string;
        source_artifact_id: string | null;
        source_generation_id: string | null;
        intake_set_id: string | null;
        job_type: DocumentJobClaim['jobType'];
        input_hash: string;
        config_version: string;
        correlation_id: string;
        attempt_count: number;
      }>(
        `select id, workspace_id, project_id, source_artifact_id, source_generation_id,
                intake_set_id, job_type, input_hash, config_version, correlation_id, attempt_count
           from document_jobs
          where state in ('QUEUED', 'RETRY_WAIT') and available_at <= now()
            and job_type = any($1::document_job_type[])
          order by available_at, id
          for update skip locked limit 1`,
        [jobTypes],
      );
      const row = selected.rows[0];
      if (row === undefined) return null;
      const attemptId = uuidv7();
      const attemptNumber = row.attempt_count + 1;
      await client.query(
        `update document_jobs
            set state = 'RUNNING', attempt_count = $2, revision = revision + 1,
                started_at = now(), safe_error_code = null, updated_at = now()
          where id = $1`,
        [row.id, attemptNumber],
      );
      await client.query(
        `insert into document_job_attempts
          (id, workspace_id, project_id, job_id, attempt_number, worker_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [attemptId, row.workspace_id, row.project_id, row.id, attemptNumber, workerId],
      );
      return {
        id: row.id,
        attemptId,
        attemptNumber,
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        sourceArtifactId: row.source_artifact_id,
        sourceGenerationId: row.source_generation_id,
        intakeSetId: row.intake_set_id,
        jobType: row.job_type,
        inputHash: row.input_hash,
        configVersion: row.config_version,
        correlationId: row.correlation_id,
      };
    });
  }

  async complete(claim: DocumentJobClaim): Promise<void> {
    await this.transaction(async (client) => {
      const updated = await client.query(
        `update document_jobs
            set state = 'SUCCEEDED', progress_completed = progress_total,
                revision = revision + 1, completed_at = now(), updated_at = now()
          where id = $1 and workspace_id = $2 and project_id = $3
            and state = 'RUNNING' and attempt_count = $4
          returning id`,
        [claim.id, claim.workspaceId, claim.projectId, claim.attemptNumber],
      );
      if ((updated.rowCount ?? 0) === 0) return;
      await client.query(
        `update document_job_attempts
            set state = 'SUCCEEDED', completed_at = now()
          where id = $1 and job_id = $2 and state = 'RUNNING'`,
        [claim.attemptId, claim.id],
      );
    });
  }

  async fail(
    claim: DocumentJobClaim,
    input: { safeErrorCode: string; retryable: boolean; retryDelaySeconds: number },
  ): Promise<'RETRY_WAIT' | 'NEEDS_ATTENTION' | 'DEAD_LETTER'> {
    return this.transaction(async (client) => {
      const job = await client.query<{ attempt_count: number; maximum_attempts: number }>(
        `select attempt_count, maximum_attempts from document_jobs
          where id = $1 and workspace_id = $2 and project_id = $3
            and state = 'RUNNING' and attempt_count = $4 for update`,
        [claim.id, claim.workspaceId, claim.projectId, claim.attemptNumber],
      );
      const row = job.rows[0];
      if (row === undefined) return 'DEAD_LETTER';
      const state =
        input.retryable && row.attempt_count < row.maximum_attempts
          ? 'RETRY_WAIT'
          : input.retryable
            ? 'DEAD_LETTER'
            : 'NEEDS_ATTENTION';
      await client.query(
        `update document_jobs
            set state = $2::document_job_state, safe_error_code = $3, revision = revision + 1,
                available_at = case when $2::text = 'RETRY_WAIT'
                  then now() + make_interval(secs => $4) else available_at end,
                completed_at = case when $2::text <> 'RETRY_WAIT' then now() else null end,
                updated_at = now()
          where id = $1`,
        [claim.id, state, input.safeErrorCode, input.retryDelaySeconds],
      );
      await client.query(
        `update document_job_attempts
            set state = $2, safe_error_code = $3, completed_at = now()
          where id = $1 and state = 'RUNNING'`,
        [claim.attemptId, state, input.safeErrorCode],
      );
      return state;
    });
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
