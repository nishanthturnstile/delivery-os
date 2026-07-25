import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
  varchar,
} from 'drizzle-orm/pg-core';

export const idempotencyStatus = pgEnum('idempotency_status', ['PROCESSING', 'COMPLETED']);
export const outboxStatus = pgEnum('outbox_status', ['PENDING', 'DISPATCHED', 'FAILED']);
export const workspaceRole = pgEnum('workspace_role', ['ADMIN', 'MEMBER']);
export const membershipState = pgEnum('membership_state', ['ACTIVE', 'DEACTIVATED']);
export const invitationState = pgEnum('invitation_state', [
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
]);

export const authUsers = pgTable(
  'auth_users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    twoFactorEnabled: boolean('two_factor_enabled').default(false),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    notificationPreferences: jsonb('notification_preferences')
      .$type<{ email: boolean }>()
      .default({ email: true })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('auth_users_email_uidx').on(table.email),
    check('auth_users_normalized_email_check', sql`${table.email} = lower(trim(${table.email}))`),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    authenticationMethod: varchar('authentication_method', { length: 32 })
      .default('password')
      .notNull(),
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
    activeWorkspaceId: uuid('active_workspace_id'),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_uidx').on(table.token),
    index('auth_sessions_user_idx').on(table.userId),
    index('auth_sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('auth_accounts_user_idx').on(table.userId),
    uniqueIndex('auth_accounts_provider_account_uidx').on(table.providerId, table.accountId),
  ],
);

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('auth_verifications_identifier_idx').on(table.identifier),
    index('auth_verifications_expiry_idx').on(table.expiresAt),
  ],
);

export const authTwoFactors = pgTable(
  'auth_two_factors',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (table) => [
    index('auth_two_factors_user_idx').on(table.userId),
    index('auth_two_factors_secret_idx').on(table.secret),
    check(
      'auth_two_factors_failed_count_check',
      sql`${table.failedVerificationCount} is null or ${table.failedVerificationCount} >= 0`,
    ),
  ],
);

export const authRateLimits = pgTable(
  'auth_rate_limits',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('auth_rate_limits_key_uidx').on(table.key),
    check('auth_rate_limits_count_check', sql`${table.count} >= 0`),
  ],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey(),
    revision: integer('revision').default(1).notNull(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    primaryColor: varchar('primary_color', { length: 7 }).default('#5146e5').notNull(),
    timeZone: text('time_zone').default('UTC').notNull(),
    defaultWorkingHours: jsonb('default_working_hours')
      .$type<{ days: number[]; start: string; end: string }>()
      .notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('workspaces_revision_check', sql`${table.revision} > 0`),
    check('workspaces_name_check', sql`length(trim(${table.name})) between 2 and 120`),
    check('workspaces_primary_color_check', sql`${table.primaryColor} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id),
    role: workspaceRole('role').notNull(),
    state: membershipState('state').default('ACTIVE').notNull(),
    revision: integer('revision').default(1).notNull(),
    invitedBy: text('invited_by').references(() => authUsers.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }).defaultNow().notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_memberships_user_state_idx').on(table.userId, table.state),
    index('workspace_memberships_workspace_state_role_idx').on(
      table.workspaceId,
      table.state,
      table.role,
    ),
    check('workspace_memberships_revision_check', sql`${table.revision} > 0`),
    check(
      'workspace_memberships_deactivation_check',
      sql`(${table.state} = 'ACTIVE' and ${table.deactivatedAt} is null)
        or (${table.state} = 'DEACTIVATED' and ${table.deactivatedAt} is not null)`,
    ),
  ],
);

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceRole('role').notNull(),
    state: invitationState('state').default('PENDING').notNull(),
    tokenDigest: text('token_digest').notNull(),
    revision: integer('revision').default(1).notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => authUsers.id),
    acceptedBy: text('accepted_by').references(() => authUsers.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('workspace_invitations_token_digest_uidx').on(table.tokenDigest),
    index('workspace_invitations_workspace_email_idx').on(table.workspaceId, table.email),
    index('workspace_invitations_expiry_idx').on(table.state, table.expiresAt),
    check('workspace_invitations_revision_check', sql`${table.revision} > 0`),
    check('workspace_invitations_email_check', sql`${table.email} = lower(trim(${table.email}))`),
  ],
);

export const workspaceSelections = pgTable('workspace_selections', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
