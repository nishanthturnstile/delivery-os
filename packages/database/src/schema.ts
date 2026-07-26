import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
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
export const clientState = pgEnum('client_state', ['ACTIVE', 'ARCHIVED']);
export const projectType = pgEnum('project_type', ['INTERNAL', 'EXTERNAL']);
export const projectLifecycleState = pgEnum('project_lifecycle_state', [
  'DRAFT',
  'INTAKE',
  'PLANNING',
  'EXECUTION',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
]);
export const projectMembershipState = pgEnum('project_membership_state', [
  'PENDING',
  'ACTIVE',
  'DEACTIVATED',
]);
export const projectRole = pgEnum('project_role', [
  'PM',
  'LEAD',
  'CONTRIBUTOR',
  'VIEWER',
  'CLIENT_STAKEHOLDER',
]);
export const projectInvitationState = pgEnum('project_invitation_state', [
  'PENDING',
  'DELIVERY_FAILED',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
]);
export const calendarExceptionKind = pgEnum('calendar_exception_kind', ['WORKING', 'NON_WORKING']);
export const outcomeModuleAudience = pgEnum('outcome_module_audience', [
  'TEAM_ONLY',
  'CLIENT_VISIBLE',
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

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    revision: integer('revision').default(1).notNull(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    primaryContactName: text('primary_contact_name').notNull(),
    primaryContactEmail: text('primary_contact_email').notNull(),
    industry: text('industry'),
    notes: text('notes'),
    state: clientState('state').default('ACTIVE').notNull(),
    archivedBy: text('archived_by').references(() => authUsers.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archiveReason: text('archive_reason'),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('clients_workspace_id_unique').on(table.workspaceId, table.id),
    index('clients_workspace_state_idx').on(table.workspaceId, table.state),
    index('clients_workspace_name_idx').on(table.workspaceId, table.name),
    check('clients_revision_check', sql`${table.revision} > 0`),
    check('clients_name_check', sql`length(trim(${table.name})) between 2 and 160`),
    check(
      'clients_contact_email_check',
      sql`${table.primaryContactEmail} = lower(trim(${table.primaryContactEmail}))`,
    ),
    check(
      'clients_archive_metadata_check',
      sql`(${table.state} = 'ACTIVE' and ${table.archivedAt} is null and ${table.archivedBy} is null)
        or (${table.state} = 'ARCHIVED' and ${table.archivedAt} is not null and ${table.archivedBy} is not null and length(trim(${table.archiveReason})) >= 8)`,
    ),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id),
    revision: integer('revision').default(1).notNull(),
    capacityRevision: integer('capacity_revision').default(1).notNull(),
    type: projectType('type').notNull(),
    lifecycleState: projectLifecycleState('lifecycle_state').default('DRAFT').notNull(),
    preHoldState: projectLifecycleState('pre_hold_state'),
    preArchiveState: projectLifecycleState('pre_archive_state'),
    name: text('name').notNull(),
    shortDescription: text('short_description').notNull(),
    targetStart: date('target_start').notNull(),
    targetEnd: date('target_end').notNull(),
    completionSummary: text('completion_summary'),
    holdReason: text('hold_reason'),
    holdOwnerId: text('hold_owner_id').references(() => authUsers.id),
    holdReviewDate: date('hold_review_date'),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('projects_workspace_id_unique').on(table.workspaceId, table.id),
    index('projects_workspace_status_updated_idx').on(
      table.workspaceId,
      table.lifecycleState,
      table.updatedAt,
      table.id,
    ),
    index('projects_workspace_client_idx').on(table.workspaceId, table.clientId),
    index('projects_workspace_dates_idx').on(table.workspaceId, table.targetStart, table.targetEnd),
    foreignKey({
      name: 'projects_workspace_client_fk',
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }),
    check('projects_revision_check', sql`${table.revision} > 0`),
    check('projects_capacity_revision_check', sql`${table.capacityRevision} > 0`),
    check('projects_name_check', sql`length(trim(${table.name})) between 2 and 160`),
    check('projects_target_range_check', sql`${table.targetStart} <= ${table.targetEnd}`),
    check(
      'projects_type_client_check',
      sql`(${table.type} = 'INTERNAL' and ${table.clientId} is null)
        or (${table.type} = 'EXTERNAL' and ${table.clientId} is not null)`,
    ),
    check(
      'projects_hold_metadata_check',
      sql`(${table.lifecycleState} <> 'ON_HOLD')
        or (${table.preHoldState} is not null and ${table.holdReason} is not null and ${table.holdOwnerId} is not null and ${table.holdReviewDate} is not null)`,
    ),
    check(
      'projects_archive_metadata_check',
      sql`(${table.lifecycleState} <> 'ARCHIVED')
        or (${table.preArchiveState} in ('COMPLETED', 'CANCELLED'))`,
    ),
  ],
);

export const projectMemberships = pgTable(
  'project_memberships',
  {
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id),
    clientId: uuid('client_id').references(() => clients.id),
    state: projectMembershipState('state').default('ACTIVE').notNull(),
    revision: integer('revision').default(1).notNull(),
    activatedBy: text('activated_by').references(() => authUsers.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    deactivatedBy: text('deactivated_by').references(() => authUsers.id),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    deactivationReason: text('deactivation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    unique('project_memberships_workspace_project_user_unique').on(
      table.workspaceId,
      table.projectId,
      table.userId,
    ),
    index('project_memberships_workspace_user_state_idx').on(
      table.workspaceId,
      table.userId,
      table.state,
    ),
    foreignKey({
      name: 'project_memberships_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_memberships_workspace_client_fk',
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }),
    check('project_memberships_revision_check', sql`${table.revision} > 0`),
    check(
      'project_memberships_state_metadata_check',
      sql`(${table.state} = 'PENDING' and ${table.activatedAt} is null and ${table.deactivatedAt} is null)
        or (${table.state} = 'ACTIVE' and ${table.activatedAt} is not null and ${table.deactivatedAt} is null)
        or (${table.state} = 'DEACTIVATED' and ${table.deactivatedAt} is not null and length(trim(${table.deactivationReason})) >= 8)`,
    ),
  ],
);

export const projectMembershipRoles = pgTable(
  'project_membership_roles',
  {
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: text('user_id').notNull(),
    role: projectRole('role').notNull(),
    assignedBy: text('assigned_by')
      .notNull()
      .references(() => authUsers.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId, table.role] }),
    index('project_membership_roles_workspace_role_idx').on(
      table.workspaceId,
      table.role,
      table.projectId,
    ),
    foreignKey({
      name: 'project_membership_roles_membership_fk',
      columns: [table.workspaceId, table.projectId, table.userId],
      foreignColumns: [
        projectMemberships.workspaceId,
        projectMemberships.projectId,
        projectMemberships.userId,
      ],
    }).onDelete('cascade'),
  ],
);

export const projectInvitations = pgTable(
  'project_invitations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    clientId: uuid('client_id').notNull(),
    email: text('email').notNull(),
    state: projectInvitationState('state').default('PENDING').notNull(),
    tokenDigest: text('token_digest').notNull(),
    revision: integer('revision').default(1).notNull(),
    workspaceInvitationId: uuid('workspace_invitation_id').references(
      () => workspaceInvitations.id,
    ),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => authUsers.id),
    acceptedBy: text('accepted_by').references(() => authUsers.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
    deliveryErrorCode: text('delivery_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('project_invitations_token_digest_uidx').on(table.tokenDigest),
    index('project_invitations_project_email_idx').on(table.projectId, table.email),
    index('project_invitations_pending_expiry_idx').on(table.state, table.expiresAt),
    foreignKey({
      name: 'project_invitations_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_invitations_workspace_client_fk',
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }),
    check('project_invitations_revision_check', sql`${table.revision} > 0`),
    check('project_invitations_email_check', sql`${table.email} = lower(trim(${table.email}))`),
  ],
);

export const projectWorkingCalendars = pgTable(
  'project_working_calendars',
  {
    projectId: uuid('project_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    revision: integer('revision').default(1).notNull(),
    timeZone: text('time_zone').notNull(),
    workingWeekdays: jsonb('working_weekdays').$type<number[]>().notNull(),
    dailyStart: time('daily_start', { withTimezone: false }).notNull(),
    dailyEnd: time('daily_end', { withTimezone: false }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_working_calendars_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check('project_working_calendars_revision_check', sql`${table.revision} > 0`),
    check('project_working_calendars_time_check', sql`${table.dailyStart} < ${table.dailyEnd}`),
  ],
);

export const projectCalendarExceptions = pgTable(
  'project_calendar_exceptions',
  {
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    date: date('date').notNull(),
    kind: calendarExceptionKind('kind').notNull(),
    workingMinutes: integer('working_minutes'),
    reason: text('reason').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.date] }),
    foreignKey({
      name: 'project_calendar_exceptions_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check(
      'project_calendar_exceptions_minutes_check',
      sql`${table.workingMinutes} is null or ${table.workingMinutes} between 1 and 1440`,
    ),
  ],
);

export const memberAvailability = pgTable(
  'member_availability',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: text('user_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to').notNull(),
    allocationPercent: integer('allocation_percent').notNull(),
    revision: integer('revision').default(1).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('member_availability_project_user_range_idx').on(
      table.projectId,
      table.userId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    foreignKey({
      name: 'member_availability_membership_fk',
      columns: [table.workspaceId, table.projectId, table.userId],
      foreignColumns: [
        projectMemberships.workspaceId,
        projectMemberships.projectId,
        projectMemberships.userId,
      ],
    }).onDelete('cascade'),
    check('member_availability_revision_check', sql`${table.revision} > 0`),
    check(
      'member_availability_allocation_check',
      sql`${table.allocationPercent} between 0 and 100`,
    ),
    check('member_availability_range_check', sql`${table.effectiveFrom} <= ${table.effectiveTo}`),
  ],
);

export const projectLifecycleHistory = pgTable(
  'project_lifecycle_history',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    fromState: projectLifecycleState('from_state').notNull(),
    toState: projectLifecycleState('to_state').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => authUsers.id),
    reason: text('reason'),
    holdOwnerId: text('hold_owner_id').references(() => authUsers.id),
    holdReviewDate: date('hold_review_date'),
    correlationId: uuid('correlation_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('project_lifecycle_history_project_occurred_idx').on(table.projectId, table.occurredAt),
    foreignKey({
      name: 'project_lifecycle_history_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
  ],
);

export const projectReadinessFacts = pgTable(
  'project_readiness_facts',
  {
    projectId: uuid('project_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    version: integer('version').default(1).notNull(),
    requirementsBaselineApproved: boolean('requirements_baseline_approved')
      .default(false)
      .notNull(),
    technicalBaselineApprovedOrWaived: boolean('technical_baseline_approved_or_waived')
      .default(false)
      .notNull(),
    uxBaselineApprovedOrWaived: boolean('ux_baseline_approved_or_waived').default(false).notNull(),
    moduleMapApproved: boolean('module_map_approved').default(false).notNull(),
    readyWorkItemCount: integer('ready_work_item_count').default(0).notNull(),
    activeSprintCount: integer('active_sprint_count').default(0).notNull(),
    activeWorkCount: integer('active_work_count').default(0).notNull(),
    lastEventId: uuid('last_event_id'),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_readiness_facts_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check('project_readiness_facts_version_check', sql`${table.version} > 0`),
    check(
      'project_readiness_facts_counts_check',
      sql`${table.readyWorkItemCount} >= 0 and ${table.activeSprintCount} >= 0 and ${table.activeWorkCount} >= 0`,
    ),
  ],
);

export const projectHealth = pgTable(
  'project_health',
  {
    projectId: uuid('project_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    lifecycleState: projectLifecycleState('lifecycle_state').notNull(),
    currentSprintLabel: text('current_sprint_label'),
    blockerCount: integer('blocker_count'),
    nextMilestoneName: text('next_milestone_name'),
    nextMilestoneDate: date('next_milestone_date'),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'project_health_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check(
      'project_health_blocker_count_check',
      sql`${table.blockerCount} is null or ${table.blockerCount} >= 0`,
    ),
  ],
);

export const projectOutcomeModules = pgTable(
  'project_outcome_modules',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    targetStart: date('target_start').notNull(),
    targetEnd: date('target_end').notNull(),
    status: text('status').default('OUTLINED').notNull(),
    audience: outcomeModuleAudience('audience').notNull(),
    schemaVersion: text('schema_version').default('1').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('project_outcome_modules_project_uidx').on(table.projectId),
    foreignKey({
      name: 'project_outcome_modules_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check('project_outcome_modules_status_check', sql`${table.status} = 'OUTLINED'`),
    check('project_outcome_modules_schema_version_check', sql`${table.schemaVersion} = '1'`),
    check(
      'project_outcome_modules_target_range_check',
      sql`${table.targetStart} <= ${table.targetEnd}`,
    ),
  ],
);
