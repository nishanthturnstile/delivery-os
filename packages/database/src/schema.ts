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
export const artifactLifecycleState = pgEnum('artifact_lifecycle_state', [
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
]);
export const artifactAudience = pgEnum('artifact_audience', ['TEAM_ONLY', 'CLIENT_VISIBLE']);
export const artifactAudienceSource = pgEnum('artifact_audience_source', ['EXPLICIT', 'INHERITED']);
export const artifactApprovalRequestState = pgEnum('artifact_approval_request_state', [
  'OPEN',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'CANCELLED',
]);
export const artifactApprovalScope = pgEnum('artifact_approval_scope', [
  'INTERNAL',
  'EXTERNAL_BINDING',
]);
export const artifactApprovalDecision = pgEnum('artifact_approval_decision', [
  'APPROVE',
  'REJECT',
  'CHANGES_REQUESTED',
]);
export const artifactBaselineState = pgEnum('artifact_baseline_state', ['CURRENT', 'SUPERSEDED']);
export const artifactDeltaState = pgEnum('artifact_delta_state', [
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'REJECTED',
  'CANCELLED',
  'APPLIED',
]);
export const artifactTargetType = pgEnum('artifact_target_type', [
  'DRAFT_REVISION',
  'REVIEW_SNAPSHOT',
  'BASELINE',
  'DELTA',
]);
export const artifactCommentState = pgEnum('artifact_comment_state', [
  'OPEN',
  'RESOLVED',
  'REMOVED',
]);
export const artifactAttachmentState = pgEnum('artifact_attachment_state', [
  'PENDING',
  'AVAILABLE',
  'REMOVED',
  'QUARANTINED',
  'FAILED',
]);
export const artifactExportState = pgEnum('artifact_export_state', [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
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

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    kindKey: varchar('kind_key', { length: 64 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 8 }).notNull(),
    policyVersion: varchar('policy_version', { length: 8 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    state: artifactLifecycleState('state').default('DRAFT').notNull(),
    audience: artifactAudience('audience').notNull(),
    rootAudienceId: uuid('root_audience_id').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id),
    revision: integer('revision').default(1).notNull(),
    currentDraftRevisionId: uuid('current_draft_revision_id').notNull(),
    openApprovalRequestId: uuid('open_approval_request_id'),
    currentBaselineId: uuid('current_baseline_id'),
    nextDraftNumber: integer('next_draft_number').default(2).notNull(),
    nextSnapshotNumber: integer('next_snapshot_number').default(1).notNull(),
    nextRequestNumber: integer('next_request_number').default(1).notNull(),
    nextBaselineMajor: integer('next_baseline_major').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('artifacts_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    index('artifacts_project_kind_updated_idx').on(
      table.workspaceId,
      table.projectId,
      table.kindKey,
      table.updatedAt,
      table.id,
    ),
    foreignKey({
      name: 'artifacts_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check('artifacts_revision_check', sql`${table.revision} > 0`),
    check(
      'artifacts_counters_check',
      sql`${table.nextDraftNumber} > 0 and ${table.nextSnapshotNumber} > 0 and ${table.nextRequestNumber} > 0 and ${table.nextBaselineMajor} > 0`,
    ),
    check('artifacts_kind_check', sql`${table.kindKey} ~ '^[A-Z][A-Z0-9_]{1,63}$'`),
    check(
      'artifacts_state_pointer_check',
      sql`(${table.state} = 'IN_REVIEW' and ${table.openApprovalRequestId} is not null)
        or (${table.state} <> 'IN_REVIEW')`,
    ),
  ],
);

export const artifactAudiences = pgTable(
  'artifact_audiences',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    declaredAudience: artifactAudience('declared_audience').notNull(),
    effectiveAudience: artifactAudience('effective_audience').notNull(),
    source: artifactAudienceSource('source').notNull(),
    parentAudienceId: uuid('parent_audience_id'),
    actorId: text('actor_id')
      .notNull()
      .references(() => authUsers.id),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('artifact_audiences_artifact_created_idx').on(table.artifactId, table.createdAt),
    foreignKey({
      name: 'artifact_audiences_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check(
      'artifact_audiences_inheritance_check',
      sql`(${table.source} = 'EXPLICIT' and ${table.parentAudienceId} is null)
        or (${table.source} = 'INHERITED' and ${table.parentAudienceId} is not null)`,
    ),
  ],
);

export const artifactDraftRevisions = pgTable(
  'artifact_draft_revisions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    draftNumber: integer('draft_number').notNull(),
    parentRevisionId: uuid('parent_revision_id'),
    sourceBaselineId: uuid('source_baseline_id'),
    deltaId: uuid('delta_id'),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => artifactAudiences.id),
    schemaVersion: varchar('schema_version', { length: 8 }).notNull(),
    canonicalization: varchar('canonicalization', { length: 32 }).default('JCS_RFC8785').notNull(),
    hashAlgorithm: varchar('hash_algorithm', { length: 16 }).default('SHA256').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    canonicalBody: text('canonical_body').notNull(),
    bodyJson: jsonb('body_json').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('artifact_draft_revisions_number_uidx').on(table.artifactId, table.draftNumber),
    index('artifact_draft_revisions_hash_idx').on(table.artifactId, table.contentHash),
    foreignKey({
      name: 'artifact_draft_revisions_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('artifact_draft_revisions_number_check', sql`${table.draftNumber} > 0`),
    check(
      'artifact_draft_revisions_hash_check',
      sql`length(${table.contentHash}) = 64 and ${table.hashAlgorithm} = 'SHA256' and ${table.canonicalization} = 'JCS_RFC8785'`,
    ),
  ],
);

export const artifactReviewSnapshots = pgTable(
  'artifact_review_snapshots',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    draftRevisionId: uuid('draft_revision_id').notNull(),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => artifactAudiences.id),
    snapshotNumber: integer('snapshot_number').notNull(),
    schemaVersion: varchar('schema_version', { length: 8 }).notNull(),
    policyVersion: varchar('policy_version', { length: 8 }).notNull(),
    canonicalization: varchar('canonicalization', { length: 32 }).notNull(),
    hashAlgorithm: varchar('hash_algorithm', { length: 16 }).notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    canonicalBody: text('canonical_body').notNull(),
    bodyJson: jsonb('body_json').notNull(),
    submittedBy: text('submitted_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('artifact_review_snapshots_number_uidx').on(table.artifactId, table.snapshotNumber),
    foreignKey({
      name: 'artifact_review_snapshots_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'artifact_review_snapshots_draft_fk',
      columns: [table.draftRevisionId],
      foreignColumns: [artifactDraftRevisions.id],
    }),
    check('artifact_review_snapshots_number_check', sql`${table.snapshotNumber} > 0`),
    check('artifact_review_snapshots_hash_check', sql`length(${table.contentHash}) = 64`),
  ],
);

export const artifactApprovalRequests = pgTable(
  'artifact_approval_requests',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => artifactReviewSnapshots.id),
    requestNumber: integer('request_number').notNull(),
    state: artifactApprovalRequestState('state').default('OPEN').notNull(),
    revision: integer('revision').default(1).notNull(),
    requiredSlots: jsonb('required_slots')
      .$type<
        {
          key: string;
          role: string;
          scope: 'INTERNAL' | 'EXTERNAL_BINDING';
          required: boolean;
        }[]
      >()
      .notNull(),
    bindingDecisionId: uuid('binding_decision_id'),
    openedBy: text('opened_by')
      .notNull()
      .references(() => authUsers.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    closedBy: text('closed_by').references(() => authUsers.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closeComment: text('close_comment'),
  },
  (table) => [
    uniqueIndex('artifact_approval_requests_number_uidx').on(table.artifactId, table.requestNumber),
    uniqueIndex('artifact_approval_requests_open_uidx')
      .on(table.artifactId)
      .where(sql`${table.state} = 'OPEN'`),
    index('artifact_approval_requests_inbox_idx').on(
      table.workspaceId,
      table.state,
      table.openedAt,
      table.id,
    ),
    foreignKey({
      name: 'artifact_approval_requests_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check(
      'artifact_approval_requests_close_check',
      sql`(${table.state} = 'OPEN' and ${table.closedAt} is null and ${table.closedBy} is null)
        or (${table.state} <> 'OPEN' and ${table.closedAt} is not null and ${table.closedBy} is not null)`,
    ),
  ],
);

export const artifactApprovalDecisions = pgTable(
  'artifact_approval_decisions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => artifactApprovalRequests.id),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => artifactReviewSnapshots.id),
    slotKey: varchar('slot_key', { length: 64 }).notNull(),
    scope: artifactApprovalScope('scope').notNull(),
    decision: artifactApprovalDecision('decision').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => authUsers.id),
    actorRole: varchar('actor_role', { length: 32 }).notNull(),
    comment: text('comment'),
    snapshotHash: varchar('snapshot_hash', { length: 64 }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('artifact_approval_decisions_slot_uidx').on(table.requestId, table.slotKey),
    uniqueIndex('artifact_approval_decisions_external_binding_uidx')
      .on(table.requestId)
      .where(sql`${table.scope} = 'EXTERNAL_BINDING'`),
    index('artifact_approval_decisions_actor_time_idx').on(table.actorId, table.decidedAt),
    foreignKey({
      name: 'artifact_approval_decisions_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check(
      'artifact_approval_decisions_snapshot_hash_check',
      sql`length(${table.snapshotHash}) = 64`,
    ),
    check(
      'artifact_approval_decisions_comment_check',
      sql`${table.decision} = 'APPROVE' or length(trim(${table.comment})) >= 2`,
    ),
  ],
);

export const artifactBaselines = pgTable(
  'artifact_baselines',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    majorNumber: integer('major_number').notNull(),
    sourceSnapshotId: uuid('source_snapshot_id')
      .notNull()
      .references(() => artifactReviewSnapshots.id),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 8 }).notNull(),
    predecessorBaselineId: uuid('predecessor_baseline_id'),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => artifactAudiences.id),
    state: artifactBaselineState('state').default('CURRENT').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('artifact_baselines_number_uidx').on(table.artifactId, table.majorNumber),
    uniqueIndex('artifact_baselines_snapshot_uidx').on(table.sourceSnapshotId),
    uniqueIndex('artifact_baselines_current_uidx')
      .on(table.artifactId)
      .where(sql`${table.state} = 'CURRENT'`),
    foreignKey({
      name: 'artifact_baselines_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('artifact_baselines_number_check', sql`${table.majorNumber} > 0`),
    check('artifact_baselines_hash_check', sql`length(${table.contentHash}) = 64`),
  ],
);

export const artifactDeltas = pgTable(
  'artifact_deltas',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    baseBaselineId: uuid('base_baseline_id')
      .notNull()
      .references(() => artifactBaselines.id),
    proposedDraftRevisionId: uuid('proposed_draft_revision_id'),
    approvalRequestId: uuid('approval_request_id'),
    successorBaselineId: uuid('successor_baseline_id'),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => artifactAudiences.id),
    state: artifactDeltaState('state').default('DRAFT').notNull(),
    revision: integer('revision').default(1).notNull(),
    rationale: text('rationale').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('artifact_deltas_open_uidx')
      .on(table.artifactId)
      .where(sql`${table.state} in ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED')`),
    foreignKey({
      name: 'artifact_deltas_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('artifact_deltas_revision_check', sql`${table.revision} > 0`),
    check('artifact_deltas_rationale_check', sql`length(trim(${table.rationale})) >= 2`),
  ],
);

export const artifactComments = pgTable(
  'artifact_comments',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    targetType: artifactTargetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    parentCommentId: uuid('parent_comment_id'),
    body: text('body'),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => artifactAudiences.id),
    state: artifactCommentState('state').default('OPEN').notNull(),
    revision: integer('revision').default(1).notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => authUsers.id),
    resolvedBy: text('resolved_by').references(() => authUsers.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    removedBy: text('removed_by').references(() => authUsers.id),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('artifact_comments_target_idx').on(
      table.artifactId,
      table.targetType,
      table.targetId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'artifact_comments_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('artifact_comments_revision_check', sql`${table.revision} > 0`),
    check(
      'artifact_comments_body_check',
      sql`(${table.state} = 'REMOVED' and ${table.body} is null) or (${table.state} <> 'REMOVED' and length(trim(${table.body})) between 1 and 8000)`,
    ),
  ],
);

export const artifactCommentMentions = pgTable(
  'artifact_comment_mentions',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => artifactComments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    mentionedAt: timestamp('mentioned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index('artifact_comment_mentions_user_idx').on(table.userId, table.mentionedAt),
  ],
);

export const artifactAttachments = pgTable(
  'artifact_attachments',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    targetType: artifactTargetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    displayName: varchar('display_name', { length: 240 }).notNull(),
    mediaType: varchar('media_type', { length: 120 }).notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    contentHash: varchar('content_hash', { length: 64 }),
    objectReference: text('object_reference').notNull(),
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => artifactAudiences.id),
    state: artifactAttachmentState('state').default('PENDING').notNull(),
    revision: integer('revision').default(1).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('artifact_attachments_target_idx').on(
      table.artifactId,
      table.targetType,
      table.targetId,
      table.state,
    ),
    foreignKey({
      name: 'artifact_attachments_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('artifact_attachments_revision_check', sql`${table.revision} > 0`),
    check(
      'artifact_attachments_size_check',
      sql`${table.byteSize} > 0 and ${table.byteSize} <= 100000000`,
    ),
  ],
);

export const artifactExportRequests = pgTable(
  'artifact_export_requests',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    targetType: artifactTargetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    format: varchar('format', { length: 16 }).notNull(),
    audience: artifactAudience('audience').notNull(),
    requesterId: text('requester_id')
      .notNull()
      .references(() => authUsers.id),
    state: artifactExportState('state').default('PENDING').notNull(),
    revision: integer('revision').default(1).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 64 }).notNull(),
    objectReference: text('object_reference'),
    contentHash: varchar('content_hash', { length: 64 }),
    failureCode: varchar('failure_code', { length: 120 }),
    permissionCheckedAt: timestamp('permission_checked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('artifact_export_requests_dedupe_uidx').on(
      table.workspaceId,
      table.requesterId,
      table.dedupeKey,
    ),
    index('artifact_export_requests_worker_idx').on(table.state, table.createdAt),
    index('artifact_export_requests_requester_idx').on(
      table.requesterId,
      table.state,
      table.createdAt,
    ),
    foreignKey({
      name: 'artifact_export_requests_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('artifact_export_requests_revision_check', sql`${table.revision} > 0`),
  ],
);
