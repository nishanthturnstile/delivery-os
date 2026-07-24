import { RecordPlatformProbe, ApplicationError } from '@delivery-os/application';
import { platformProbeCommandSchema, type PlatformProbeCommand } from '@delivery-os/contracts';
import {
  checkDatabase,
  createDatabasePool,
  PostgresOutboxRepository,
  PostgresPlatformStore,
} from '@delivery-os/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os';
const pool = createDatabasePool(databaseUrl);

function command(
  overrides: Partial<{
    aggregateId: string;
    workspaceId: string;
    idempotencyKey: string;
    expectedRevision: number;
    delta: number;
    role: 'ADMIN' | 'MEMBER';
    correlationId: string;
  }> = {},
): PlatformProbeCommand {
  return platformProbeCommandSchema.parse({
    schemaVersion: '1',
    aggregateId: overrides.aggregateId ?? uuidv7(),
    expectedRevision: overrides.expectedRevision ?? 0,
    idempotencyKey: overrides.idempotencyKey ?? uuidv7(),
    correlationId: overrides.correlationId ?? crypto.randomUUID(),
    authorization: {
      userId: uuidv7(),
      workspaceId: overrides.workspaceId ?? uuidv7(),
      workspaceRole: overrides.role ?? 'ADMIN',
      projectRoles: [],
    },
    command: {
      delta: overrides.delta ?? 1,
      reason: 'W0 integration validation',
    },
  });
}

beforeEach(async () => {
  await pool.query(
    'truncate table processed_events, outbox_events, audit_events, idempotency_records, platform_probes',
  );
});

afterAll(async () => {
  await pool.end();
});

describe('transactional platform command kernel', () => {
  it('returns the stored result for a duplicate command with one domain outcome', async () => {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const input = command();

    const first = await handler.execute(input);
    const replay = await handler.execute(input);

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({
      entityId: first.entityId,
      revision: 1,
      value: 1,
      auditEventId: first.auditEventId,
      outboxEventId: first.outboxEventId,
      replayed: true,
    });
    const counts = await pool.query<{
      probes: string;
      audits: string;
      outbox: string;
      idempotency: string;
    }>(
      `select
         (select count(*) from platform_probes)::text as probes,
         (select count(*) from audit_events)::text as audits,
         (select count(*) from outbox_events)::text as outbox,
         (select count(*) from idempotency_records)::text as idempotency`,
    );
    expect(counts.rows[0]).toEqual({
      probes: '1',
      audits: '1',
      outbox: '1',
      idempotency: '1',
    });
  });

  it('rejects a stale revision and exposes only the safe current revision', async () => {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const workspaceId = uuidv7();
    const aggregateId = uuidv7();
    await handler.execute(command({ workspaceId, aggregateId }));

    await expect(
      handler.execute(command({ workspaceId, aggregateId, expectedRevision: 0 })),
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      currentRevision: 1,
    });
    const probe = await pool.query<{ revision: number; value: number }>(
      'select revision, value from platform_probes where workspace_id = $1 and id = $2',
      [workspaceId, aggregateId],
    );
    expect(probe.rows[0]).toEqual({ revision: 1, value: 1 });
  });

  it('rejects an idempotency key reused for different intent', async () => {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const workspaceId = uuidv7();
    const idempotencyKey = uuidv7();
    const first = command({ workspaceId, idempotencyKey });
    await handler.execute(first);

    await expect(
      handler.execute(
        command({
          workspaceId,
          idempotencyKey,
          aggregateId: first.aggregateId,
          delta: 2,
          expectedRevision: 1,
        }),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('denies commands by default for a non-admin context', async () => {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const error = await handler
      .execute(command({ role: 'MEMBER' }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('survives dispatcher reconstruction and deduplicates replayed jobs', async () => {
    const correlationId = crypto.randomUUID();
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const result = await handler.execute(command({ correlationId }));

    const firstDispatcher = new PostgresOutboxRepository(pool);
    const beforeRestart = await firstDispatcher.listPending();
    expect(beforeRestart).toHaveLength(1);

    const restartedDispatcher = new PostgresOutboxRepository(pool);
    const afterRestart = await restartedDispatcher.listPending();
    expect(afterRestart[0]?.id).toBe(result.outboxEventId);
    expect(afterRestart[0]?.payload.correlationId).toBe(correlationId);

    const event = afterRestart[0]?.payload;
    expect(event).toBeDefined();
    if (event === undefined) throw new Error('Expected a pending event');
    await restartedDispatcher.markDispatched(event.eventId);
    expect(await restartedDispatcher.recordProcessed(event, 'test-consumer')).toBe(true);
    expect(await restartedDispatcher.recordProcessed(event, 'test-consumer')).toBe(false);
  });

  it('records safe outbox retry state and database readiness', async () => {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const result = await handler.execute(command());
    const outbox = new PostgresOutboxRepository(pool);
    await outbox.markFailed(result.outboxEventId, 'QUEUE_UNAVAILABLE');

    const retry = await pool.query<{ status: string; attempts: number; code: string }>(
      `select status, attempts, last_error_code as code from outbox_events where id = $1`,
      [result.outboxEventId],
    );
    expect(retry.rows[0]).toEqual({
      status: 'FAILED',
      attempts: 1,
      code: 'QUEUE_UNAVAILABLE',
    });
    await expect(checkDatabase(pool)).resolves.toBeGreaterThanOrEqual(0);
  });

  it('enforces append-only audit rows in PostgreSQL', async () => {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const result = await handler.execute(command());
    await expect(
      pool.query(`update audit_events set action = 'tampered' where id = $1`, [
        result.auditEventId,
      ]),
    ).rejects.toThrow(/append-only/);
  });
});
