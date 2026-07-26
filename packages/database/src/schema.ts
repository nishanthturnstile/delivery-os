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
export const sourceFormat = pgEnum('source_format', ['PDF', 'DOCX', 'MARKDOWN', 'TEXT']);
export const sourceProcessingState = pgEnum('source_processing_state', [
  'QUEUED',
  'SCANNING',
  'PROCESSING',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'FAILED',
]);
export const sourceRetentionState = pgEnum('source_retention_state', [
  'ACTIVE',
  'RECOVERABLE',
  'PURGING',
  'PURGED',
]);
export const sourceUploadSessionState = pgEnum('source_upload_session_state', [
  'OPEN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);
export const objectManifestPurpose = pgEnum('object_manifest_purpose', [
  'QUARANTINE',
  'PRIMARY',
  'BACKUP',
]);
export const objectManifestState = pgEnum('object_manifest_state', [
  'PENDING',
  'AVAILABLE',
  'DELETING',
  'DELETED',
  'FAILED',
]);
export const documentJobType = pgEnum('document_job_type', [
  'SCAN',
  'PARSE',
  'OCR',
  'EXTRACT',
  'BACKUP',
  'PURGE',
]);
export const documentJobState = pgEnum('document_job_state', [
  'QUEUED',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'DEAD_LETTER',
  'CANCELLED',
]);
export const normalizedBlockKind = pgEnum('normalized_block_kind', [
  'HEADING',
  'PARAGRAPH',
  'LIST_ITEM',
  'TABLE_CELL',
]);
export const normalizedExtractionMethod = pgEnum('normalized_extraction_method', [
  'EMBEDDED_TEXT',
  'OCR',
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

export const sourceArtifacts = pgTable(
  'source_artifacts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    currentGenerationId: uuid('current_generation_id').notNull(),
    displayName: varchar('display_name', { length: 240 }).notNull(),
    format: sourceFormat('format').notNull(),
    audience: artifactAudience('audience').notNull(),
    processingState: sourceProcessingState('processing_state').default('QUEUED').notNull(),
    retentionState: sourceRetentionState('retention_state').default('ACTIVE').notNull(),
    revision: integer('revision').default(1).notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => authUsers.id),
    deletedBy: text('deleted_by').references(() => authUsers.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    recoverableUntil: timestamp('recoverable_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('source_artifacts_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    index('source_artifacts_project_audience_state_idx').on(
      table.workspaceId,
      table.projectId,
      table.audience,
      table.retentionState,
      table.processingState,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'source_artifacts_workspace_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check('source_artifacts_revision_check', sql`${table.revision} > 0`),
    check(
      'source_artifacts_retention_dates_check',
      sql`(${table.retentionState} = 'ACTIVE' and ${table.deletedAt} is null and ${table.recoverableUntil} is null)
        or (${table.retentionState} <> 'ACTIVE' and ${table.deletedAt} is not null)`,
    ),
  ],
);

export const sourceGenerations = pgTable(
  'source_generations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    generationNumber: integer('generation_number').notNull(),
    declaredMediaType: varchar('declared_media_type', { length: 120 }).notNull(),
    detectedMediaType: varchar('detected_media_type', { length: 120 }),
    declaredByteSize: bigint('declared_byte_size', { mode: 'number' }).notNull(),
    actualByteSize: bigint('actual_byte_size', { mode: 'number' }),
    expectedSha256: varchar('expected_sha256', { length: 64 }).notNull(),
    actualSha256: varchar('actual_sha256', { length: 64 }),
    duplicateOfGenerationId: uuid('duplicate_of_generation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('source_generations_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('source_generations_number_uidx').on(
      table.sourceArtifactId,
      table.generationNumber,
    ),
    index('source_generations_content_idx').on(
      table.workspaceId,
      table.projectId,
      table.expectedSha256,
    ),
    foreignKey({
      name: 'source_generations_source_fk',
      columns: [table.workspaceId, table.projectId, table.sourceArtifactId],
      foreignColumns: [sourceArtifacts.workspaceId, sourceArtifacts.projectId, sourceArtifacts.id],
    }).onDelete('cascade'),
    check(
      'source_generations_declared_size_check',
      sql`${table.declaredByteSize} > 0 and ${table.declaredByteSize} <= 52428800`,
    ),
    check(
      'source_generations_actual_size_check',
      sql`${table.actualByteSize} is null or (${table.actualByteSize} > 0 and ${table.actualByteSize} <= 52428800)`,
    ),
    check(
      'source_generations_hash_check',
      sql`${table.expectedSha256} ~ '^[a-f0-9]{64}$'
        and (${table.actualSha256} is null or ${table.actualSha256} ~ '^[a-f0-9]{64}$')`,
    ),
  ],
);

export const sourceProjectQuotas = pgTable(
  'source_project_quotas',
  {
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    retainedBytes: bigint('retained_bytes', { mode: 'number' }).default(0).notNull(),
    reservedBytes: bigint('reserved_bytes', { mode: 'number' }).default(0).notNull(),
    revision: integer('revision').default(1).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.projectId] }),
    foreignKey({
      name: 'source_project_quotas_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check(
      'source_project_quotas_bytes_check',
      sql`${table.retainedBytes} >= 0 and ${table.reservedBytes} >= 0
        and ${table.retainedBytes} + ${table.reservedBytes} <= 524288000`,
    ),
    check('source_project_quotas_revision_check', sql`${table.revision} > 0`),
  ],
);

export const sourceUploadSessions = pgTable(
  'source_upload_sessions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    quarantineManifestId: uuid('quarantine_manifest_id').notNull(),
    state: sourceUploadSessionState('state').default('OPEN').notNull(),
    revision: integer('revision').default(1).notNull(),
    reservedBytes: bigint('reserved_bytes', { mode: 'number' }).notNull(),
    expectedSha256: varchar('expected_sha256', { length: 64 }).notNull(),
    expectedSha256Base64: varchar('expected_sha256_base64', { length: 44 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 120 }),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('source_upload_sessions_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('source_upload_sessions_active_generation_uidx')
      .on(table.sourceGenerationId)
      .where(sql`${table.state} = 'OPEN'`),
    index('source_upload_sessions_expiry_idx')
      .on(table.expiresAt, table.id)
      .where(sql`${table.state} = 'OPEN'`),
    foreignKey({
      name: 'source_upload_sessions_generation_fk',
      columns: [table.workspaceId, table.projectId, table.sourceGenerationId],
      foreignColumns: [
        sourceGenerations.workspaceId,
        sourceGenerations.projectId,
        sourceGenerations.id,
      ],
    }).onDelete('cascade'),
    check(
      'source_upload_sessions_reserved_bytes_check',
      sql`${table.reservedBytes} > 0 and ${table.reservedBytes} <= 52428800`,
    ),
    check('source_upload_sessions_revision_check', sql`${table.revision} > 0`),
    check('source_upload_sessions_hash_check', sql`${table.expectedSha256} ~ '^[a-f0-9]{64}$'`),
    check(
      'source_upload_sessions_completion_check',
      sql`(${table.state} = 'COMPLETED' and ${table.completedAt} is not null)
        or (${table.state} <> 'COMPLETED')`,
    ),
  ],
);

export const sourceQuotaReservations = pgTable(
  'source_quota_reservations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    uploadSessionId: uuid('upload_session_id').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    state: varchar('state', { length: 16 }).default('ACTIVE').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('source_quota_reservations_session_uidx').on(table.uploadSessionId),
    index('source_quota_reservations_active_idx')
      .on(table.workspaceId, table.projectId, table.createdAt)
      .where(sql`${table.state} = 'ACTIVE'`),
    foreignKey({
      name: 'source_quota_reservations_session_fk',
      columns: [table.workspaceId, table.projectId, table.uploadSessionId],
      foreignColumns: [
        sourceUploadSessions.workspaceId,
        sourceUploadSessions.projectId,
        sourceUploadSessions.id,
      ],
    }).onDelete('cascade'),
    check(
      'source_quota_reservations_size_check',
      sql`${table.byteSize} > 0 and ${table.byteSize} <= 52428800`,
    ),
    check(
      'source_quota_reservations_state_check',
      sql`${table.state} in ('ACTIVE', 'CONSUMED', 'RELEASED')`,
    ),
    check(
      'source_quota_reservations_release_check',
      sql`(${table.state} = 'ACTIVE' and ${table.releasedAt} is null)
        or (${table.state} <> 'ACTIVE' and ${table.releasedAt} is not null)`,
    ),
  ],
);

export const objectManifests = pgTable(
  'object_manifests',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    purpose: objectManifestPurpose('purpose').notNull(),
    replica: integer('replica').default(0).notNull(),
    objectKey: text('object_key').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    mediaType: varchar('media_type', { length: 120 }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    state: objectManifestState('state').default('PENDING').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('object_manifests_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('object_manifests_key_uidx').on(table.objectKey),
    uniqueIndex('object_manifests_generation_purpose_replica_uidx').on(
      table.sourceGenerationId,
      table.purpose,
      table.replica,
    ),
    index('object_manifests_reconcile_idx').on(
      table.state,
      table.purpose,
      table.updatedAt,
      table.id,
    ),
    foreignKey({
      name: 'object_manifests_generation_fk',
      columns: [table.workspaceId, table.projectId, table.sourceGenerationId],
      foreignColumns: [
        sourceGenerations.workspaceId,
        sourceGenerations.projectId,
        sourceGenerations.id,
      ],
    }).onDelete('cascade'),
    check(
      'object_manifests_size_check',
      sql`${table.byteSize} > 0 and ${table.byteSize} <= 52428800`,
    ),
    check('object_manifests_hash_check', sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check('object_manifests_replica_check', sql`${table.replica} >= 0`),
  ],
);

export const sourcePurgeReceipts = pgTable(
  'source_purge_receipts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    authorizedBy: text('authorized_by')
      .notNull()
      .references(() => authUsers.id),
    manifestCount: integer('manifest_count').notNull(),
    activeBytesPurged: bigint('active_bytes_purged', { mode: 'number' }).notNull(),
    backupObjectsPurged: integer('backup_objects_purged').notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('source_purge_receipts_source_uidx').on(
      table.workspaceId,
      table.projectId,
      table.sourceArtifactId,
    ),
    index('source_purge_receipts_time_idx').on(table.workspaceId, table.purgedAt, table.id),
    check(
      'source_purge_receipts_counts_check',
      sql`${table.manifestCount} >= 0 and ${table.activeBytesPurged} >= 0 and ${table.backupObjectsPurged} >= 0`,
    ),
  ],
);

export const intakeSets = pgTable(
  'intake_sets',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    revision: integer('revision').default(1).notNull(),
    sourceManifestHash: varchar('source_manifest_hash', { length: 64 }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('intake_sets_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    index('intake_sets_project_time_idx').on(
      table.workspaceId,
      table.projectId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'intake_sets_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    check('intake_sets_revision_check', sql`${table.revision} > 0`),
    check('intake_sets_hash_check', sql`${table.sourceManifestHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const intakeSetSources = pgTable(
  'intake_set_sources',
  {
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    intakeSetId: uuid('intake_set_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    audience: artifactAudience('audience').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.intakeSetId, table.sourceGenerationId] }),
    uniqueIndex('intake_set_sources_ordinal_uidx').on(table.intakeSetId, table.ordinal),
    foreignKey({
      name: 'intake_set_sources_intake_fk',
      columns: [table.workspaceId, table.projectId, table.intakeSetId],
      foreignColumns: [intakeSets.workspaceId, intakeSets.projectId, intakeSets.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'intake_set_sources_generation_fk',
      columns: [table.workspaceId, table.projectId, table.sourceGenerationId],
      foreignColumns: [
        sourceGenerations.workspaceId,
        sourceGenerations.projectId,
        sourceGenerations.id,
      ],
    }).onDelete('cascade'),
    check('intake_set_sources_ordinal_check', sql`${table.ordinal} >= 0`),
  ],
);

export const requirementIntakeSets = pgTable(
  'requirement_intake_sets',
  {
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    intakeSetId: uuid('intake_set_id').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.artifactId, table.intakeSetId] }),
    uniqueIndex('requirement_intake_sets_intake_uidx').on(table.intakeSetId),
    unique('requirement_intake_sets_scope_unique').on(
      table.workspaceId,
      table.projectId,
      table.artifactId,
      table.intakeSetId,
    ),
    index('requirement_intake_sets_artifact_idx').on(
      table.workspaceId,
      table.projectId,
      table.artifactId,
      table.createdAt,
    ),
    foreignKey({
      name: 'requirement_intake_sets_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'requirement_intake_sets_intake_fk',
      columns: [table.workspaceId, table.projectId, table.intakeSetId],
      foreignColumns: [intakeSets.workspaceId, intakeSets.projectId, intakeSets.id],
    }).onDelete('cascade'),
  ],
);

export const aiWorkflowSettings = pgTable(
  'ai_workflow_settings',
  {
    workspaceId: uuid('workspace_id').primaryKey(),
    provider: varchar('provider', { length: 16 }).default('openai').notNull(),
    workflowConfigHash: varchar('workflow_config_hash', { length: 64 }).notNull(),
    globalEnabled: boolean('global_enabled').default(false).notNull(),
    requirementExtractionEnabled: boolean('requirement_extraction_enabled')
      .default(false)
      .notNull(),
    provenanceRetentionDays: integer('provenance_retention_days').default(30).notNull(),
    aggregateQualityMetricsEnabled: boolean('aggregate_quality_metrics_enabled')
      .default(true)
      .notNull(),
    revision: integer('revision').default(1).notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => authUsers.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'ai_workflow_settings_workspace_fk',
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete('cascade'),
    check('ai_workflow_settings_provider_check', sql`${table.provider} in ('openai', 'anthropic')`),
    check('ai_workflow_settings_hash_check', sql`${table.workflowConfigHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'ai_workflow_settings_retention_check',
      sql`${table.provenanceRetentionDays} between 0 and 30`,
    ),
    check('ai_workflow_settings_revision_check', sql`${table.revision} > 0`),
  ],
);

export const aiBudgetMonths = pgTable(
  'ai_budget_months',
  {
    workspaceId: uuid('workspace_id').notNull(),
    budgetMonth: date('budget_month').notNull(),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' }).default(0).notNull(),
    alert50Emitted: boolean('alert_50_emitted').default(false).notNull(),
    alert80Emitted: boolean('alert_80_emitted').default(false).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.budgetMonth] }),
    foreignKey({
      name: 'ai_budget_months_workspace_fk',
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete('cascade'),
    check(
      'ai_budget_months_reserved_check',
      sql`${table.reservedMicrousd} >= 0 and ${table.reservedMicrousd} <= 100000000`,
    ),
  ],
);

export const aiRunReservations = pgTable(
  'ai_run_reservations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    intakeSetId: uuid('intake_set_id').notNull(),
    provider: varchar('provider', { length: 16 }).notNull(),
    modelId: varchar('model_id', { length: 120 }).notNull(),
    workflowConfigHash: varchar('workflow_config_hash', { length: 64 }).notNull(),
    reservedMicrousd: bigint('reserved_microusd', { mode: 'number' }).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    state: varchar('state', { length: 16 }).default('RESERVED').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    unique('ai_run_reservations_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    index('ai_run_reservations_workspace_time_idx').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'ai_run_reservations_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ai_run_reservations_intake_fk',
      columns: [table.workspaceId, table.projectId, table.intakeSetId],
      foreignColumns: [intakeSets.workspaceId, intakeSets.projectId, intakeSets.id],
    }).onDelete('cascade'),
    check('ai_run_reservations_provider_check', sql`${table.provider} in ('openai', 'anthropic')`),
    check('ai_run_reservations_hash_check', sql`${table.workflowConfigHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'ai_run_reservations_amount_check',
      sql`${table.reservedMicrousd} > 0 and ${table.reservedMicrousd} <= 1000000`,
    ),
    check(
      'ai_run_reservations_tokens_check',
      sql`(${table.inputTokens} is null or ${table.inputTokens} >= 0)
        and (${table.outputTokens} is null or ${table.outputTokens} >= 0)`,
    ),
    check(
      'ai_run_reservations_state_check',
      sql`${table.state} in ('RESERVED', 'SUCCEEDED', 'FAILED')`,
    ),
  ],
);

export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    intakeSetId: uuid('intake_set_id').notNull(),
    reservationId: uuid('reservation_id').notNull(),
    provider: varchar('provider', { length: 16 }).notNull(),
    modelId: varchar('model_id', { length: 120 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 120 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 16 }).notNull(),
    workflowConfigHash: varchar('workflow_config_hash', { length: 64 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    outputHash: varchar('output_hash', { length: 64 }).notNull(),
    audience: artifactAudience('audience').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('ai_generations_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('ai_generations_reservation_uidx').on(table.reservationId),
    index('ai_generations_artifact_time_idx').on(
      table.workspaceId,
      table.projectId,
      table.artifactId,
      table.createdAt,
    ),
    foreignKey({
      name: 'ai_generations_reservation_fk',
      columns: [table.workspaceId, table.projectId, table.reservationId],
      foreignColumns: [
        aiRunReservations.workspaceId,
        aiRunReservations.projectId,
        aiRunReservations.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'ai_generations_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'ai_generations_intake_scope_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId, table.intakeSetId],
      foreignColumns: [
        requirementIntakeSets.workspaceId,
        requirementIntakeSets.projectId,
        requirementIntakeSets.artifactId,
        requirementIntakeSets.intakeSetId,
      ],
    }).onDelete('restrict'),
    check('ai_generations_provider_check', sql`${table.provider} in ('openai', 'anthropic')`),
    check(
      'ai_generations_hash_check',
      sql`${table.workflowConfigHash} ~ '^[a-f0-9]{64}$'
        and ${table.inputHash} ~ '^[a-f0-9]{64}$'
        and ${table.outputHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const aiGenerationPayloads = pgTable(
  'ai_generation_payloads',
  {
    generationId: uuid('generation_id')
      .primaryKey()
      .references(() => aiGenerations.id, { onDelete: 'cascade' }),
    ciphertext: text('ciphertext').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ai_generation_payloads_expiry_idx').on(table.expiresAt, table.generationId)],
);

export const documentJobs = pgTable(
  'document_jobs',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id'),
    sourceGenerationId: uuid('source_generation_id'),
    intakeSetId: uuid('intake_set_id'),
    jobType: documentJobType('job_type').notNull(),
    state: documentJobState('state').default('QUEUED').notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    configVersion: varchar('config_version', { length: 160 }).notNull(),
    progressCompleted: integer('progress_completed').default(0).notNull(),
    progressTotal: integer('progress_total').default(1).notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maximumAttempts: integer('maximum_attempts').default(3).notNull(),
    revision: integer('revision').default(1).notNull(),
    safeErrorCode: varchar('safe_error_code', { length: 120 }),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    correlationId: uuid('correlation_id').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('document_jobs_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('document_jobs_dedupe_uidx').on(
      table.workspaceId,
      table.projectId,
      table.jobType,
      table.inputHash,
      table.configVersion,
    ),
    index('document_jobs_worker_idx')
      .on(table.jobType, table.state, table.availableAt, table.id)
      .where(sql`${table.state} in ('QUEUED', 'RETRY_WAIT')`),
    index('document_jobs_attention_idx')
      .on(table.workspaceId, table.projectId, table.state, table.updatedAt, table.id)
      .where(sql`${table.state} in ('NEEDS_ATTENTION', 'DEAD_LETTER')`),
    foreignKey({
      name: 'document_jobs_source_fk',
      columns: [table.workspaceId, table.projectId, table.sourceArtifactId],
      foreignColumns: [sourceArtifacts.workspaceId, sourceArtifacts.projectId, sourceArtifacts.id],
    }).onDelete('cascade'),
    check('document_jobs_hash_check', sql`${table.inputHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'document_jobs_progress_check',
      sql`${table.progressCompleted} >= 0 and ${table.progressTotal} > 0 and ${table.progressCompleted} <= ${table.progressTotal}`,
    ),
    check(
      'document_jobs_attempt_check',
      sql`${table.attemptCount} >= 0 and ${table.maximumAttempts} > 0 and ${table.attemptCount} <= ${table.maximumAttempts}`,
    ),
    check('document_jobs_revision_check', sql`${table.revision} > 0`),
  ],
);

export const documentJobAttempts = pgTable(
  'document_job_attempts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    jobId: uuid('job_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    workerId: varchar('worker_id', { length: 160 }).notNull(),
    state: varchar('state', { length: 24 }).default('RUNNING').notNull(),
    safeErrorCode: varchar('safe_error_code', { length: 120 }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('document_job_attempts_number_uidx').on(table.jobId, table.attemptNumber),
    index('document_job_attempts_running_idx')
      .on(table.claimedAt, table.id)
      .where(sql`${table.state} = 'RUNNING'`),
    foreignKey({
      name: 'document_job_attempts_job_fk',
      columns: [table.workspaceId, table.projectId, table.jobId],
      foreignColumns: [documentJobs.workspaceId, documentJobs.projectId, documentJobs.id],
    }).onDelete('cascade'),
    check('document_job_attempts_number_check', sql`${table.attemptNumber} > 0`),
    check(
      'document_job_attempts_state_check',
      sql`${table.state} in ('RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'NEEDS_ATTENTION', 'DEAD_LETTER', 'CANCELLED')`,
    ),
  ],
);

export const normalizedDocuments = pgTable(
  'normalized_documents',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    parserVersion: varchar('parser_version', { length: 120 }).notNull(),
    rendererVersion: varchar('renderer_version', { length: 120 }).notNull(),
    ocrConfigVersion: varchar('ocr_config_version', { length: 160 }).notNull(),
    sourceSha256: varchar('source_sha256', { length: 64 }).notNull(),
    documentHash: varchar('document_hash', { length: 64 }).notNull(),
    blockCount: integer('block_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('normalized_documents_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('normalized_documents_config_uidx').on(
      table.sourceGenerationId,
      table.parserVersion,
      table.rendererVersion,
      table.ocrConfigVersion,
    ),
    index('normalized_documents_source_time_idx').on(
      table.workspaceId,
      table.projectId,
      table.sourceArtifactId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'normalized_documents_generation_fk',
      columns: [table.workspaceId, table.projectId, table.sourceGenerationId],
      foreignColumns: [
        sourceGenerations.workspaceId,
        sourceGenerations.projectId,
        sourceGenerations.id,
      ],
    }).onDelete('cascade'),
    check(
      'normalized_documents_hash_check',
      sql`${table.sourceSha256} ~ '^[a-f0-9]{64}$' and ${table.documentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check('normalized_documents_block_count_check', sql`${table.blockCount} >= 0`),
  ],
);

export const sourceLocators = pgTable(
  'source_locators',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    normalizedDocumentId: uuid('normalized_document_id').notNull(),
    format: sourceFormat('format').notNull(),
    locatorJson: jsonb('locator_json').notNull(),
    locatorHash: varchar('locator_hash', { length: 64 }).notNull(),
    audience: artifactAudience('audience').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('source_locators_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('source_locators_document_hash_uidx').on(
      table.normalizedDocumentId,
      table.locatorHash,
    ),
    foreignKey({
      name: 'source_locators_document_fk',
      columns: [table.workspaceId, table.projectId, table.normalizedDocumentId],
      foreignColumns: [
        normalizedDocuments.workspaceId,
        normalizedDocuments.projectId,
        normalizedDocuments.id,
      ],
    }).onDelete('cascade'),
    check('source_locators_hash_check', sql`${table.locatorHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const normalizedBlocks = pgTable(
  'normalized_blocks',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceArtifactId: uuid('source_artifact_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    normalizedDocumentId: uuid('normalized_document_id').notNull(),
    sourceLocatorId: uuid('source_locator_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    blockKey: varchar('block_key', { length: 64 }).notNull(),
    kind: normalizedBlockKind('kind').notNull(),
    text: text('text').notNull(),
    extraction: normalizedExtractionMethod('extraction').notNull(),
    confidence: varchar('confidence', { length: 32 }),
    audience: artifactAudience('audience').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('normalized_blocks_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('normalized_blocks_key_uidx').on(table.normalizedDocumentId, table.blockKey),
    uniqueIndex('normalized_blocks_ordinal_uidx').on(table.normalizedDocumentId, table.ordinal),
    index('normalized_blocks_source_idx').on(
      table.workspaceId,
      table.projectId,
      table.sourceArtifactId,
      table.normalizedDocumentId,
      table.ordinal,
    ),
    foreignKey({
      name: 'normalized_blocks_document_fk',
      columns: [table.workspaceId, table.projectId, table.normalizedDocumentId],
      foreignColumns: [
        normalizedDocuments.workspaceId,
        normalizedDocuments.projectId,
        normalizedDocuments.id,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'normalized_blocks_locator_fk',
      columns: [table.workspaceId, table.projectId, table.sourceLocatorId],
      foreignColumns: [sourceLocators.workspaceId, sourceLocators.projectId, sourceLocators.id],
    }).onDelete('cascade'),
    check('normalized_blocks_ordinal_check', sql`${table.ordinal} >= 0`),
    check('normalized_blocks_key_check', sql`${table.blockKey} ~ '^[a-f0-9]{64}$'`),
    check('normalized_blocks_text_check', sql`length(${table.text}) between 1 and 100000`),
    check(
      'normalized_blocks_confidence_check',
      sql`${table.confidence} is null or ${table.confidence} ~ '^(0(\\.[0-9]+)?|1(\\.0+)?)$'`,
    ),
  ],
);

export const ocrPageResults = pgTable(
  'ocr_page_results',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    pageNumber: integer('page_number').notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    rendererVersion: varchar('renderer_version', { length: 120 }).notNull(),
    modelVersion: varchar('model_version', { length: 160 }).notNull(),
    modelDigest: varchar('model_digest', { length: 64 }).notNull(),
    configVersion: varchar('config_version', { length: 160 }).notNull(),
    outputHash: varchar('output_hash', { length: 64 }).notNull(),
    minimumConfidence: varchar('minimum_confidence', { length: 32 }).notNull(),
    needsAttention: boolean('needs_attention').notNull(),
    resultJson: jsonb('result_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('ocr_page_results_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('ocr_page_results_dedupe_uidx').on(
      table.sourceGenerationId,
      table.pageNumber,
      table.inputHash,
      table.rendererVersion,
      table.modelDigest,
      table.configVersion,
    ),
    foreignKey({
      name: 'ocr_page_results_generation_fk',
      columns: [table.workspaceId, table.projectId, table.sourceGenerationId],
      foreignColumns: [
        sourceGenerations.workspaceId,
        sourceGenerations.projectId,
        sourceGenerations.id,
      ],
    }).onDelete('cascade'),
    check('ocr_page_results_page_check', sql`${table.pageNumber} > 0`),
    check(
      'ocr_page_results_hash_check',
      sql`${table.inputHash} ~ '^[a-f0-9]{64}$' and ${table.modelDigest} ~ '^[a-f0-9]{64}$' and ${table.outputHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const requirementTemplateVersions = pgTable(
  'requirement_template_versions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    version: integer('version').notNull(),
    baseVersion: varchar('base_version', { length: 32 }).notNull(),
    state: varchar('state', { length: 16 }).notNull(),
    revision: integer('revision').default(1).notNull(),
    templateHash: varchar('template_hash', { length: 64 }).notNull(),
    definitionsJson: jsonb('definitions_json').notNull(),
    publishedBy: text('published_by').references(() => authUsers.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('requirement_template_versions_number_uidx').on(table.workspaceId, table.version),
    uniqueIndex('requirement_template_versions_hash_uidx').on(
      table.workspaceId,
      table.templateHash,
    ),
    index('requirement_template_versions_published_idx')
      .on(table.workspaceId, table.publishedAt, table.id)
      .where(sql`${table.state} = 'PUBLISHED'`),
    foreignKey({
      name: 'requirement_template_versions_workspace_fk',
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete('cascade'),
    check('requirement_template_versions_version_check', sql`${table.version} > 0`),
    check('requirement_template_versions_revision_check', sql`${table.revision} > 0`),
    check(
      'requirement_template_versions_state_check',
      sql`${table.state} in ('DRAFT', 'PUBLISHED')`,
    ),
    check(
      'requirement_template_versions_publish_check',
      sql`(${table.state} = 'DRAFT' and ${table.publishedAt} is null and ${table.publishedBy} is null)
        or (${table.state} = 'PUBLISHED' and ${table.publishedAt} is not null and ${table.publishedBy} is not null)`,
    ),
    check(
      'requirement_template_versions_hash_check',
      sql`${table.templateHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const projectRequirementTemplateSnapshots = pgTable(
  'project_requirement_template_snapshots',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    templateVersionId: uuid('template_version_id').notNull(),
    templateHash: varchar('template_hash', { length: 64 }).notNull(),
    definitionsJson: jsonb('definitions_json').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('project_requirement_template_snapshots_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('project_requirement_template_snapshots_version_uidx').on(
      table.projectId,
      table.templateVersionId,
    ),
    foreignKey({
      name: 'project_requirement_template_snapshots_project_fk',
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_requirement_template_snapshots_template_fk',
      columns: [table.templateVersionId],
      foreignColumns: [requirementTemplateVersions.id],
    }),
    check(
      'project_requirement_template_snapshots_hash_check',
      sql`${table.templateHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const requirementFieldRevisions = pgTable(
  'requirement_field_revisions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    fieldKey: varchar('field_key', { length: 80 }).notNull(),
    revision: integer('revision').notNull(),
    state: varchar('state', { length: 24 }).notNull(),
    valueJson: jsonb('value_json'),
    audience: artifactAudience('audience').notNull(),
    humanNote: text('human_note'),
    riskOwnerId: text('risk_owner_id').references(() => authUsers.id),
    riskReviewDate: date('risk_review_date'),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('requirement_field_revisions_number_uidx').on(
      table.artifactId,
      table.fieldKey,
      table.revision,
    ),
    index('requirement_field_revisions_current_idx').on(
      table.workspaceId,
      table.projectId,
      table.artifactId,
      table.fieldKey,
      table.revision,
    ),
    foreignKey({
      name: 'requirement_field_revisions_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('requirement_field_revisions_revision_check', sql`${table.revision} > 0`),
    check(
      'requirement_field_revisions_state_check',
      sql`${table.state} in ('UNRESOLVED', 'RESOLVED', 'NOT_APPLICABLE', 'ACCEPTED_RISK')`,
    ),
  ],
);

export const requirementCitations = pgTable(
  'requirement_citations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sourceGenerationId: uuid('source_generation_id').notNull(),
    locatorId: uuid('locator_id').notNull(),
    blockIds: uuid('block_ids').array().notNull(),
    locatorExcerptHash: varchar('locator_excerpt_hash', { length: 64 }).notNull(),
    audience: artifactAudience('audience').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('requirement_citations_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    foreignKey({
      name: 'requirement_citations_generation_fk',
      columns: [table.workspaceId, table.projectId, table.sourceGenerationId],
      foreignColumns: [
        sourceGenerations.workspaceId,
        sourceGenerations.projectId,
        sourceGenerations.id,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'requirement_citations_locator_fk',
      columns: [table.workspaceId, table.projectId, table.locatorId],
      foreignColumns: [sourceLocators.workspaceId, sourceLocators.projectId, sourceLocators.id],
    }).onDelete('cascade'),
    check('requirement_citations_hash_check', sql`${table.locatorExcerptHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const requirementClaims = pgTable(
  'requirement_claims',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    intakeSetId: uuid('intake_set_id').notNull(),
    fieldKey: varchar('field_key', { length: 80 }).notNull(),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    valueJson: jsonb('value_json').notNull(),
    citationIds: uuid('citation_ids').array().notNull(),
    audience: artifactAudience('audience').notNull(),
    workflowKind: varchar('workflow_kind', { length: 16 }).notNull(),
    workflowVersion: varchar('workflow_version', { length: 160 }).notNull(),
    workflowConfigHash: varchar('workflow_config_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('requirement_claims_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('requirement_claims_fingerprint_uidx').on(table.intakeSetId, table.fingerprint),
    foreignKey({
      name: 'requirement_claims_intake_fk',
      columns: [table.workspaceId, table.projectId, table.intakeSetId],
      foreignColumns: [intakeSets.workspaceId, intakeSets.projectId, intakeSets.id],
    }).onDelete('cascade'),
    check(
      'requirement_claims_workflow_check',
      sql`${table.workflowKind} in ('MANUAL', 'FAKE_AI', 'LIVE_AI')`,
    ),
    check(
      'requirement_claims_hash_check',
      sql`${table.fingerprint} ~ '^[a-f0-9]{64}$' and ${table.workflowConfigHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const requirementClaimDispositions = pgTable(
  'requirement_claim_dispositions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    disposition: varchar('disposition', { length: 16 }).notNull(),
    editedValueJson: jsonb('edited_value_json'),
    note: text('note'),
    actorId: text('actor_id')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('requirement_claim_dispositions_claim_uidx').on(table.claimId),
    foreignKey({
      name: 'requirement_claim_dispositions_claim_fk',
      columns: [table.workspaceId, table.projectId, table.claimId],
      foreignColumns: [
        requirementClaims.workspaceId,
        requirementClaims.projectId,
        requirementClaims.id,
      ],
    }).onDelete('cascade'),
    check(
      'requirement_claim_dispositions_kind_check',
      sql`${table.disposition} in ('ACCEPTED', 'EDITED', 'REJECTED')`,
    ),
  ],
);

export const requirementConflicts = pgTable(
  'requirement_conflicts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    fieldKey: varchar('field_key', { length: 80 }).notNull(),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    claimIds: uuid('claim_ids').array().notNull(),
    severity: varchar('severity', { length: 16 }).notNull(),
    state: varchar('state', { length: 16 }).default('OPEN').notNull(),
    revision: integer('revision').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('requirement_conflicts_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('requirement_conflicts_fingerprint_uidx').on(table.artifactId, table.fingerprint),
    foreignKey({
      name: 'requirement_conflicts_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check('requirement_conflicts_state_check', sql`${table.state} in ('OPEN', 'RESOLVED')`),
    check(
      'requirement_conflicts_severity_check',
      sql`${table.severity} in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`,
    ),
  ],
);

export const requirementConflictResolutions = pgTable(
  'requirement_conflict_resolutions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    conflictId: uuid('conflict_id').notNull(),
    selectedClaimId: uuid('selected_claim_id'),
    authoredValueJson: jsonb('authored_value_json'),
    note: text('note').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('requirement_conflict_resolutions_conflict_uidx').on(table.conflictId),
    foreignKey({
      name: 'requirement_conflict_resolutions_conflict_fk',
      columns: [table.workspaceId, table.projectId, table.conflictId],
      foreignColumns: [
        requirementConflicts.workspaceId,
        requirementConflicts.projectId,
        requirementConflicts.id,
      ],
    }).onDelete('cascade'),
    check(
      'requirement_conflict_resolutions_choice_check',
      sql`(${table.selectedClaimId} is null) <> (${table.authoredValueJson} is null)`,
    ),
    check('requirement_conflict_resolutions_note_check', sql`length(trim(${table.note})) >= 2`),
  ],
);

export const requirementGaps = pgTable(
  'requirement_gaps',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    fieldKey: varchar('field_key', { length: 80 }).notNull(),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    blocking: boolean('blocking').notNull(),
    state: varchar('state', { length: 16 }).default('OPEN').notNull(),
    revision: integer('revision').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('requirement_gaps_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('requirement_gaps_fingerprint_uidx').on(table.artifactId, table.fingerprint),
    foreignKey({
      name: 'requirement_gaps_artifact_fk',
      columns: [table.workspaceId, table.projectId, table.artifactId],
      foreignColumns: [artifacts.workspaceId, artifacts.projectId, artifacts.id],
    }).onDelete('cascade'),
    check(
      'requirement_gaps_reason_check',
      sql`${table.reason} in ('MISSING', 'WEAK_SUPPORT', 'CONFLICT', 'CONDITIONALLY_REQUIRED')`,
    ),
    check('requirement_gaps_state_check', sql`${table.state} in ('OPEN', 'RESOLVED')`),
  ],
);

export const requirementGapDispositions = pgTable(
  'requirement_gap_dispositions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    gapId: uuid('gap_id').notNull(),
    disposition: varchar('disposition', { length: 24 }).notNull(),
    fieldRevisionId: uuid('field_revision_id'),
    justification: text('justification'),
    riskOwnerId: text('risk_owner_id').references(() => authUsers.id),
    riskConsequence: text('risk_consequence'),
    riskReviewDate: date('risk_review_date'),
    actorId: text('actor_id')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('requirement_gap_dispositions_gap_uidx').on(table.gapId),
    foreignKey({
      name: 'requirement_gap_dispositions_gap_fk',
      columns: [table.workspaceId, table.projectId, table.gapId],
      foreignColumns: [requirementGaps.workspaceId, requirementGaps.projectId, requirementGaps.id],
    }).onDelete('cascade'),
    check(
      'requirement_gap_dispositions_kind_check',
      sql`${table.disposition} in ('RESOLVED', 'NOT_APPLICABLE', 'ACCEPTED_RISK')`,
    ),
  ],
);

export const requirementReadinessSnapshots = pgTable(
  'requirement_readiness_snapshots',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    reviewSnapshotId: uuid('review_snapshot_id').notNull(),
    templateSnapshotId: uuid('template_snapshot_id').notNull(),
    templateHash: varchar('template_hash', { length: 64 }).notNull(),
    bodyHash: varchar('body_hash', { length: 64 }).notNull(),
    readinessHash: varchar('readiness_hash', { length: 64 }).notNull(),
    evidenceJson: jsonb('evidence_json').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => authUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('requirement_readiness_snapshots_workspace_project_id_unique').on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('requirement_readiness_snapshots_review_uidx').on(table.reviewSnapshotId),
    foreignKey({
      name: 'requirement_readiness_snapshots_review_fk',
      columns: [table.reviewSnapshotId],
      foreignColumns: [artifactReviewSnapshots.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'requirement_readiness_snapshots_template_fk',
      columns: [table.workspaceId, table.projectId, table.templateSnapshotId],
      foreignColumns: [
        projectRequirementTemplateSnapshots.workspaceId,
        projectRequirementTemplateSnapshots.projectId,
        projectRequirementTemplateSnapshots.id,
      ],
    }).onDelete('restrict'),
    check(
      'requirement_readiness_snapshots_hash_check',
      sql`${table.templateHash} ~ '^[a-f0-9]{64}$' and ${table.bodyHash} ~ '^[a-f0-9]{64}$' and ${table.readinessHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
