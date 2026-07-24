import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const idempotencyStatus = pgEnum('idempotency_status', ['PROCESSING', 'COMPLETED']);
export const outboxStatus = pgEnum('outbox_status', ['PENDING', 'DISPATCHED', 'FAILED']);

export const platformProbes = pgTable(
  'platform_probes',
  {
    id: uuid('id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    revision: integer('revision').notNull(),
    value: integer('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    check('platform_probes_revision_check', sql`${table.revision} > 0`),
    check('platform_probes_value_check', sql`${table.value} >= 0`),
    index('platform_probes_workspace_idx').on(table.workspaceId),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    workspaceId: uuid('workspace_id').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: idempotencyStatus('status').notNull(),
    result: jsonb('result'),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.idempotencyKey] }),
    check(
      'idempotency_completion_check',
      sql`(${table.status} = 'PROCESSING' and ${table.result} is null and ${table.completedAt} is null)
        or (${table.status} = 'COMPLETED' and ${table.result} is not null and ${table.completedAt} is not null)`,
    ),
    index('idempotency_created_idx').on(table.createdAt),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id'),
    actorId: uuid('actor_id').notNull(),
    agentClientId: text('agent_client_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    reason: text('reason'),
    beforeSummary: jsonb('before_summary'),
    afterSummary: jsonb('after_summary').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_workspace_occurred_idx').on(table.workspaceId, table.occurredAt),
    index('audit_events_target_idx').on(table.targetType, table.targetId),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateRevision: integer('aggregate_revision').notNull(),
    eventType: text('event_type').notNull(),
    schemaVersion: text('schema_version').notNull(),
    payload: jsonb('payload').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    status: outboxStatus('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
  },
  (table) => [
    uniqueIndex('outbox_aggregate_revision_uidx').on(
      table.workspaceId,
      table.aggregateType,
      table.aggregateId,
      table.aggregateRevision,
    ),
    index('outbox_pending_idx').on(table.status, table.availableAt),
    check('outbox_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

export const processedEvents = pgTable('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  consumer: text('consumer').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});
