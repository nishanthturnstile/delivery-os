import { createHash } from 'node:crypto';

import { ApplicationError, type PlatformCommandStore } from '@delivery-os/application';
import {
  outboxJobSchema,
  platformProbeResultSchema,
  type OutboxJob,
  type PlatformProbeCommand,
  type PlatformProbeResult,
} from '@delivery-os/contracts';
import { recordPlatformProbe, type PlatformProbe } from '@delivery-os/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import type { DatabasePool } from './pool';

type ProbeRow = QueryResultRow & {
  id: string;
  workspace_id: string;
  revision: number;
  value: number;
};

type IdempotencyRow = QueryResultRow & {
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
};

export type PendingOutboxEvent = Readonly<{
  id: string;
  payload: OutboxJob;
  attempts: number;
}>;

function requestHash(command: PlatformProbeCommand): string {
  const canonical = JSON.stringify({
    aggregateId: command.aggregateId,
    workspaceId: command.authorization.workspaceId,
    expectedRevision: command.expectedRevision,
    delta: command.command.delta,
    reason: command.command.reason,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function toProbe(row: ProbeRow | undefined): PlatformProbe | undefined {
  return row === undefined
    ? undefined
    : {
        id: row.id,
        workspaceId: row.workspace_id,
        revision: row.revision,
        value: row.value,
      };
}

export class PostgresPlatformStore implements PlatformCommandStore {
  constructor(private readonly pool: DatabasePool) {}

  async execute(command: PlatformProbeCommand): Promise<PlatformProbeResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await this.executeTransaction(client, command);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async executeTransaction(
    client: PoolClient,
    command: PlatformProbeCommand,
  ): Promise<PlatformProbeResult> {
    const workspaceId = command.authorization.workspaceId;
    const hash = requestHash(command);
    const inserted = await client.query(
      `insert into idempotency_records
         (workspace_id, idempotency_key, request_hash, status, correlation_id)
       values ($1, $2, $3, 'PROCESSING', $4)
       on conflict do nothing
       returning idempotency_key`,
      [workspaceId, command.idempotencyKey, hash, command.correlationId],
    );

    if ((inserted.rowCount ?? 0) === 0) {
      return this.replayResult(client, command, hash);
    }

    const currentResult = await client.query<ProbeRow>(
      `select id, workspace_id, revision, value
         from platform_probes
        where workspace_id = $1 and id = $2
        for update`,
      [workspaceId, command.aggregateId],
    );
    const current = toProbe(currentResult.rows[0]);
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== command.expectedRevision) {
      throw new ApplicationError({
        code: 'REVISION_CONFLICT',
        message: 'The resource changed. Reload it and retry.',
        correlationId: command.correlationId,
        currentRevision,
      });
    }

    const next = recordPlatformProbe(current, {
      id: command.aggregateId,
      workspaceId,
      delta: command.command.delta,
    });
    const auditEventId = uuidv7();
    const outboxEventId = uuidv7();
    const occurredAt = new Date().toISOString();

    await this.upsertProbe(client, next);
    await client.query(
      `insert into audit_events
         (id, workspace_id, actor_id, agent_client_id, action, target_type,
          target_id, correlation_id, reason, before_summary, after_summary, occurred_at)
       values ($1, $2, $3, $4, 'platform.probe.recorded', 'PlatformProbe',
               $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        auditEventId,
        workspaceId,
        command.authorization.userId,
        command.authorization.oauthClientId ?? null,
        command.aggregateId,
        command.correlationId,
        command.command.reason,
        current === undefined
          ? null
          : JSON.stringify({ revision: current.revision, value: current.value }),
        JSON.stringify({ revision: next.revision, value: next.value }),
        occurredAt,
      ],
    );

    const payload = outboxJobSchema.parse({
      schemaVersion: '1',
      eventId: outboxEventId,
      eventType: 'platform.probe.recorded.v1',
      workspaceId,
      aggregateId: command.aggregateId,
      aggregateRevision: next.revision,
      correlationId: command.correlationId,
      occurredAt,
    });
    await client.query(
      `insert into outbox_events
         (id, workspace_id, aggregate_type, aggregate_id, aggregate_revision,
          event_type, schema_version, payload, correlation_id, occurred_at)
       values ($1, $2, 'PlatformProbe', $3, $4, $5, '1', $6::jsonb, $7, $8)`,
      [
        outboxEventId,
        workspaceId,
        command.aggregateId,
        next.revision,
        payload.eventType,
        JSON.stringify(payload),
        command.correlationId,
        occurredAt,
      ],
    );

    const result = platformProbeResultSchema.parse({
      schemaVersion: '1',
      entityId: next.id,
      revision: next.revision,
      state: 'ACTIVE',
      value: next.value,
      outboxEventId,
      auditEventId,
      correlationId: command.correlationId,
      replayed: false,
    });
    await client.query(
      `update idempotency_records
          set status = 'COMPLETED', result = $3::jsonb, completed_at = now()
        where workspace_id = $1 and idempotency_key = $2`,
      [workspaceId, command.idempotencyKey, JSON.stringify(result)],
    );
    return result;
  }

  private async replayResult(
    client: PoolClient,
    command: PlatformProbeCommand,
    hash: string,
  ): Promise<PlatformProbeResult> {
    const existing = await client.query<IdempotencyRow>(
      `select request_hash, status, result
         from idempotency_records
        where workspace_id = $1 and idempotency_key = $2
        for update`,
      [command.authorization.workspaceId, command.idempotencyKey],
    );
    const row = existing.rows[0];
    if (row?.status !== 'COMPLETED' || row.result === null) {
      throw new ApplicationError({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'The command is already being processed. Retry shortly.',
        correlationId: command.correlationId,
      });
    }
    if (row.request_hash !== hash) {
      throw new ApplicationError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'The idempotency key was already used for another request.',
        correlationId: command.correlationId,
      });
    }
    return platformProbeResultSchema.parse({ ...row.result, replayed: true });
  }

  private async upsertProbe(client: PoolClient, probe: PlatformProbe): Promise<void> {
    await client.query(
      `insert into platform_probes (id, workspace_id, revision, value)
       values ($1, $2, $3, $4)
       on conflict (workspace_id, id) do update
         set revision = excluded.revision, value = excluded.value, updated_at = now()`,
      [probe.id, probe.workspaceId, probe.revision, probe.value],
    );
  }
}

export class PostgresOutboxRepository {
  constructor(private readonly pool: DatabasePool) {}

  async listPending(limit = 100): Promise<PendingOutboxEvent[]> {
    const result = await this.pool.query<
      QueryResultRow & { id: string; payload: unknown; attempts: number }
    >(
      `select id, payload, attempts
         from outbox_events
        where status in ('PENDING', 'FAILED') and available_at <= now()
        order by occurred_at
        limit $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      payload: outboxJobSchema.parse(row.payload),
      attempts: row.attempts,
    }));
  }

  async markDispatched(eventId: string): Promise<void> {
    await this.pool.query(
      `update outbox_events
          set status = 'DISPATCHED', dispatched_at = now(), attempts = attempts + 1,
              last_error_code = null
        where id = $1`,
      [eventId],
    );
  }

  async markFailed(eventId: string, safeErrorCode: string): Promise<void> {
    await this.pool.query(
      `update outbox_events
          set status = 'FAILED', attempts = attempts + 1, last_error_code = $2,
              available_at = now() + interval '10 seconds'
        where id = $1`,
      [eventId, safeErrorCode],
    );
  }

  async recordProcessed(event: OutboxJob, consumer: string): Promise<boolean> {
    const result = await this.pool.query(
      `insert into processed_events (event_id, consumer, correlation_id)
       values ($1, $2, $3)
       on conflict do nothing
       returning event_id`,
      [event.eventId, consumer, event.correlationId],
    );
    return (result.rowCount ?? 0) === 1;
  }
}
