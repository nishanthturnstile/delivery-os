import { z } from 'zod';

const httpsUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => value.toLowerCase().startsWith('https://'), {
    message: 'URL must use HTTPS.',
  });
const normalizedEmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const dateSchema = z.iso.date();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const clientStateSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const projectTypeSchema = z.enum(['INTERNAL', 'EXTERNAL']);
export const projectLifecycleStateSchema = z.enum([
  'DRAFT',
  'INTAKE',
  'PLANNING',
  'EXECUTION',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
]);
export const projectRoleSchema = z.enum([
  'PM',
  'LEAD',
  'CONTRIBUTOR',
  'VIEWER',
  'CLIENT_STAKEHOLDER',
]);
export const projectMembershipStateSchema = z.enum(['PENDING', 'ACTIVE', 'DEACTIVATED']);
export const projectInvitationStateSchema = z.enum([
  'PENDING',
  'DELIVERY_FAILED',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
]);
export const calendarExceptionKindSchema = z.enum(['WORKING', 'NON_WORKING']);
export const readinessCriterionCodeSchema = z.enum([
  'PROFILE_INCOMPLETE',
  'PM_REQUIRED',
  'CALENDAR_REQUIRED',
  'INTERNAL_MEMBER_REQUIRED',
  'CLIENT_REQUIRED',
  'CLIENT_STAKEHOLDER_REQUIRED',
  'REQUIREMENTS_BASELINE_REQUIRED',
  'TECHNICAL_BASELINE_OR_WAIVER_REQUIRED',
  'UX_BASELINE_OR_WAIVER_REQUIRED',
  'MODULE_MAP_REQUIRED',
  'READY_WORK_ITEM_REQUIRED',
  'ACTIVE_SPRINT_PRESENT',
  'ACTIVE_WORK_PRESENT',
  'COMPLETION_SUMMARY_REQUIRED',
  'TRANSITION_REASON_REQUIRED',
]);

export const readinessCriterionSchema = z.object({
  code: readinessCriterionCodeSchema,
  message: z.string().min(1).max(240),
});

export const projectWorkingCalendarSchema = z
  .object({
    projectId: z.uuidv7(),
    workspaceId: z.uuidv7(),
    revision: z.number().int().positive(),
    timeZone: z.string().trim().min(1).max(100),
    workingWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    dailyStart: timeSchema,
    dailyEnd: timeSchema,
  })
  .refine((value) => value.dailyStart < value.dailyEnd, {
    message: 'Working hours must end after they start.',
    path: ['dailyEnd'],
  });

export const projectCalendarExceptionSchema = z.object({
  projectId: z.uuidv7(),
  workspaceId: z.uuidv7(),
  date: dateSchema,
  kind: calendarExceptionKindSchema,
  workingMinutes: z.number().int().min(1).max(1_440).nullable(),
  reason: z.string().trim().min(1).max(240),
});

export const memberAvailabilitySchema = z
  .object({
    id: z.uuidv7(),
    workspaceId: z.uuidv7(),
    projectId: z.uuidv7(),
    userId: z.uuidv7(),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema,
    allocationPercent: z.number().int().min(0).max(100),
    revision: z.number().int().positive(),
  })
  .refine((value) => value.effectiveFrom <= value.effectiveTo, {
    message: 'Availability must end on or after its start date.',
    path: ['effectiveTo'],
  });

export const clientSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  revision: z.number().int().positive(),
  name: z.string().trim().min(2).max(160),
  logoUrl: httpsUrlSchema.nullable(),
  primaryContactName: z.string().trim().min(1).max(120),
  primaryContactEmail: z.email(),
  industry: z.string().trim().min(1).max(120).nullable(),
  notes: z.string().max(8_000).nullable(),
  state: clientStateSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const projectMembershipSchema = z.object({
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  userId: z.uuidv7(),
  displayName: z.string().trim().min(1).max(120),
  email: z.email(),
  state: projectMembershipStateSchema,
  roles: z.array(projectRoleSchema).min(1),
  revision: z.number().int().positive(),
});

export const projectSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  clientId: z.uuidv7().nullable(),
  revision: z.number().int().positive(),
  capacityRevision: z.number().int().positive(),
  type: projectTypeSchema,
  lifecycleState: projectLifecycleStateSchema,
  name: z.string().trim().min(2).max(160),
  shortDescription: z.string().trim().min(1).max(500),
  targetStart: dateSchema,
  targetEnd: dateSchema,
  completionSummary: z.string().trim().min(1).max(4_000).nullable(),
  holdReason: z.string().trim().min(1).max(1_000).nullable(),
  holdOwnerId: z.uuidv7().nullable(),
  holdReviewDate: dateSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const projectPortfolioItemSchema = projectSchema
  .pick({
    id: true,
    workspaceId: true,
    clientId: true,
    revision: true,
    type: true,
    lifecycleState: true,
    name: true,
    shortDescription: true,
    targetStart: true,
    targetEnd: true,
    updatedAt: true,
  })
  .extend({
    clientName: z.string().nullable(),
    projectManagerId: z.uuidv7(),
    projectManagerName: z.string().min(1).max(120),
    currentSprintLabel: z.string().max(160).nullable(),
    blockerCount: z.number().int().nonnegative().nullable(),
    nextMilestoneName: z.string().max(160).nullable(),
    nextMilestoneDate: dateSchema.nullable(),
  });

export const projectReadinessSchema = z.object({
  projectId: z.uuidv7(),
  currentState: projectLifecycleStateSchema,
  requestedState: projectLifecycleStateSchema,
  ready: z.boolean(),
  unmetCriteria: z.array(readinessCriterionSchema),
});

export const projectLifecycleHistorySchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  fromState: projectLifecycleStateSchema,
  toState: projectLifecycleStateSchema,
  actorId: z.uuidv7(),
  reason: z.string().max(1_000).nullable(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export const projectOutcomeModuleSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(500),
  targetStart: dateSchema,
  targetEnd: dateSchema,
  status: z.literal('OUTLINED'),
  audience: z.enum(['TEAM_ONLY', 'CLIENT_VISIBLE']),
  schemaVersion: z.literal('1'),
});

const mutationEnvelopeSchema = z.object({
  schemaVersion: z.literal('1'),
  workspaceId: z.uuidv7(),
  actorId: z.uuidv7(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.uuidv7(),
  correlationId: z.uuid(),
  mfaVerifiedAt: z.iso.datetime().nullable(),
  overrideReason: z.string().trim().min(8).max(1_000).nullable().default(null),
});

export const createClientCommandSchema = mutationEnvelopeSchema.extend({
  clientId: z.uuidv7(),
  command: z.object({
    name: z.string().trim().min(2).max(160),
    logoUrl: httpsUrlSchema.nullable().default(null),
    primaryContactName: z.string().trim().min(1).max(120),
    primaryContactEmail: normalizedEmailSchema,
    industry: z.string().trim().min(1).max(120).nullable().default(null),
    notes: z.string().trim().max(8_000).nullable().default(null),
  }),
});

export const updateClientCommandSchema = mutationEnvelopeSchema.extend({
  clientId: z.uuidv7(),
  command: createClientCommandSchema.shape.command,
});

export const changeClientStateCommandSchema = mutationEnvelopeSchema.extend({
  clientId: z.uuidv7(),
  command: z.object({
    state: clientStateSchema,
    reason: z.string().trim().min(8).max(1_000),
  }),
});

const calendarInputSchema = z
  .object({
    timeZone: z.string().trim().min(1).max(100),
    workingWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    dailyStart: timeSchema,
    dailyEnd: timeSchema,
  })
  .refine((value) => value.dailyStart < value.dailyEnd, {
    message: 'Working hours must end after they start.',
    path: ['dailyEnd'],
  });

export const createProjectCommandSchema = mutationEnvelopeSchema
  .extend({
    projectId: z.uuidv7(),
    outcomeModuleId: z.uuidv7(),
    projectInvitationId: z.uuidv7().nullable(),
    workspaceInvitationId: z.uuidv7().nullable(),
    command: z
      .object({
        type: projectTypeSchema,
        clientId: z.uuidv7().nullable(),
        name: z.string().trim().min(2).max(160),
        shortDescription: z.string().trim().min(1).max(500),
        targetStart: dateSchema,
        targetEnd: dateSchema,
        projectManagerId: z.uuidv7(),
        leadUserId: z.uuidv7().nullable().default(null),
        contributorIds: z.array(z.uuidv7()).max(100).default([]),
        stakeholderEmail: normalizedEmailSchema.nullable().default(null),
        stakeholderTokenDigest: z.string().length(64).nullable().default(null),
        workspaceTokenDigest: z.string().length(64).nullable().default(null),
        stakeholderExpiresAt: z.iso.datetime().nullable().default(null),
        calendar: calendarInputSchema,
      })
      .superRefine((value, context) => {
        if (value.targetStart > value.targetEnd) {
          context.addIssue({
            code: 'custom',
            message: 'Target end must be on or after target start.',
            path: ['targetEnd'],
          });
        }
        if (value.type === 'EXTERNAL' && value.clientId === null) {
          context.addIssue({
            code: 'custom',
            message: 'External projects require a client.',
            path: ['clientId'],
          });
        }
        if (value.type === 'INTERNAL' && value.clientId !== null) {
          context.addIssue({
            code: 'custom',
            message: 'Internal projects cannot have a client.',
            path: ['clientId'],
          });
        }
        if (value.type === 'EXTERNAL' && value.stakeholderEmail === null) {
          context.addIssue({
            code: 'custom',
            message: 'External projects require a client stakeholder.',
            path: ['stakeholderEmail'],
          });
        }
        if (
          value.type === 'EXTERNAL' &&
          (value.stakeholderTokenDigest === null ||
            value.workspaceTokenDigest === null ||
            value.stakeholderExpiresAt === null)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'External projects require complete stakeholder invitation data.',
            path: ['stakeholderEmail'],
          });
        }
        if (value.type === 'INTERNAL' && value.stakeholderEmail !== null) {
          context.addIssue({
            code: 'custom',
            message: 'Internal projects cannot have a client stakeholder.',
            path: ['stakeholderEmail'],
          });
        }
        if (
          value.type === 'INTERNAL' &&
          (value.stakeholderTokenDigest !== null ||
            value.workspaceTokenDigest !== null ||
            value.stakeholderExpiresAt !== null)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Internal projects cannot carry stakeholder invitation data.',
            path: ['stakeholderEmail'],
          });
        }
      }),
  })
  .superRefine((value, context) => {
    if (
      value.command.type === 'EXTERNAL' &&
      (value.projectInvitationId === null || value.workspaceInvitationId === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'External projects require project and workspace invitation identifiers.',
        path: ['projectInvitationId'],
      });
    }
    if (
      value.command.type === 'INTERNAL' &&
      (value.projectInvitationId !== null || value.workspaceInvitationId !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Internal projects cannot carry invitation identifiers.',
        path: ['projectInvitationId'],
      });
    }
  });

export const updateProjectCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: z
    .object({
      name: z.string().trim().min(2).max(160),
      shortDescription: z.string().trim().min(1).max(500),
      targetStart: dateSchema,
      targetEnd: dateSchema,
      completionSummary: z.string().trim().min(1).max(4_000).nullable().default(null),
    })
    .refine((value) => value.targetStart <= value.targetEnd, {
      message: 'Target end must be on or after target start.',
      path: ['targetEnd'],
    }),
});

export const setProjectRolesCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: z.object({
    targetUserId: z.uuidv7(),
    roles: z.array(projectRoleSchema).min(1).max(4),
  }),
});

export const deactivateProjectMemberCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: z.object({
    targetUserId: z.uuidv7(),
    replacementProjectManagerId: z.uuidv7().nullable().default(null),
    reason: z.string().trim().min(8).max(1_000),
  }),
});

export const inviteProjectStakeholderCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  invitationId: z.uuidv7(),
  workspaceInvitationId: z.uuidv7(),
  command: z.object({
    email: normalizedEmailSchema,
    tokenDigest: z.string().length(64),
    workspaceTokenDigest: z.string().length(64),
    expiresAt: z.iso.datetime(),
  }),
});

export const acceptProjectInvitationCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: z.object({
    invitationId: z.uuidv7(),
    tokenDigest: z.string().length(64),
    verifiedEmail: normalizedEmailSchema,
  }),
});

export const updateProjectCalendarCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: calendarInputSchema,
});

export const setCalendarExceptionCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: z.object({
    date: dateSchema,
    kind: calendarExceptionKindSchema,
    workingMinutes: z.number().int().min(1).max(1_440).nullable().default(null),
    reason: z.string().trim().min(1).max(240),
  }),
});

export const setMemberAvailabilityCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  availabilityId: z.uuidv7(),
  command: z
    .object({
      userId: z.uuidv7(),
      effectiveFrom: dateSchema,
      effectiveTo: dateSchema,
      allocationPercent: z.number().int().min(0).max(100),
    })
    .refine((value) => value.effectiveFrom <= value.effectiveTo, {
      message: 'Availability must end on or after its start date.',
      path: ['effectiveTo'],
    }),
});

export const transitionProjectLifecycleCommandSchema = mutationEnvelopeSchema.extend({
  projectId: z.uuidv7(),
  command: z.object({
    toState: projectLifecycleStateSchema,
    reason: z.string().trim().min(8).max(1_000).nullable().default(null),
    holdOwnerId: z.uuidv7().nullable().default(null),
    holdReviewDate: dateSchema.nullable().default(null),
  }),
});

export const projectListFiltersSchema = z
  .object({
    search: z.string().trim().max(160).default(''),
    clientId: z.uuidv7().optional(),
    lifecycleState: projectLifecycleStateSchema.optional(),
    projectManagerId: z.uuidv7().optional(),
    targetFrom: dateSchema.optional(),
    targetTo: dateSchema.optional(),
    cursorUpdatedAt: z.iso.datetime().optional(),
    cursorId: z.uuidv7().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (value) =>
      (value.cursorUpdatedAt === undefined && value.cursorId === undefined) ||
      (value.cursorUpdatedAt !== undefined && value.cursorId !== undefined),
    { message: 'Cursor timestamp and ID must be supplied together.' },
  );

export const projectMutationResultSchema = z.object({
  schemaVersion: z.literal('1'),
  entityId: z.uuidv7(),
  revision: z.number().int().positive(),
  state: z.string().min(1).max(40),
  auditEventId: z.uuidv7(),
  outboxEventId: z.uuidv7(),
  correlationId: z.uuid(),
  replayed: z.boolean(),
});

export const projectOutboxJobSchema = z.object({
  schemaVersion: z.literal('1'),
  eventId: z.uuidv7(),
  eventType: z.enum([
    'projects.client.created.v1',
    'projects.client.updated.v1',
    'projects.client.state-changed.v1',
    'projects.project.created.v1',
    'projects.project.updated.v1',
    'projects.project.membership-changed.v1',
    'projects.project.invitation-issued.v1',
    'projects.project.invitation-accepted.v1',
    'projects.project.lifecycle-changed.v1',
    'projects.project.capacity-recalculation-requested.v1',
  ]),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7().nullable(),
  aggregateId: z.uuidv7(),
  aggregateRevision: z.number().int().positive(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export type ClientState = z.infer<typeof clientStateSchema>;
export type ProjectType = z.infer<typeof projectTypeSchema>;
export type ProjectLifecycleState = z.infer<typeof projectLifecycleStateSchema>;
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export type ReadinessCriterion = z.infer<typeof readinessCriterionSchema>;
export type Client = z.infer<typeof clientSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectPortfolioItem = z.infer<typeof projectPortfolioItemSchema>;
export type ProjectMembership = z.infer<typeof projectMembershipSchema>;
export type ProjectWorkingCalendar = z.infer<typeof projectWorkingCalendarSchema>;
export type ProjectCalendarException = z.infer<typeof projectCalendarExceptionSchema>;
export type MemberAvailability = z.infer<typeof memberAvailabilitySchema>;
export type ProjectReadiness = z.infer<typeof projectReadinessSchema>;
export type ProjectLifecycleHistory = z.infer<typeof projectLifecycleHistorySchema>;
export type ProjectOutcomeModule = z.infer<typeof projectOutcomeModuleSchema>;
export type CreateClientCommand = z.infer<typeof createClientCommandSchema>;
export type UpdateClientCommand = z.infer<typeof updateClientCommandSchema>;
export type ChangeClientStateCommand = z.infer<typeof changeClientStateCommandSchema>;
export type CreateProjectCommand = z.infer<typeof createProjectCommandSchema>;
export type UpdateProjectCommand = z.infer<typeof updateProjectCommandSchema>;
export type SetProjectRolesCommand = z.infer<typeof setProjectRolesCommandSchema>;
export type DeactivateProjectMemberCommand = z.infer<typeof deactivateProjectMemberCommandSchema>;
export type InviteProjectStakeholderCommand = z.infer<typeof inviteProjectStakeholderCommandSchema>;
export type AcceptProjectInvitationCommand = z.infer<typeof acceptProjectInvitationCommandSchema>;
export type UpdateProjectCalendarCommand = z.infer<typeof updateProjectCalendarCommandSchema>;
export type SetCalendarExceptionCommand = z.infer<typeof setCalendarExceptionCommandSchema>;
export type SetMemberAvailabilityCommand = z.infer<typeof setMemberAvailabilityCommandSchema>;
export type TransitionProjectLifecycleCommand = z.infer<
  typeof transitionProjectLifecycleCommandSchema
>;
export type ProjectListFilters = z.infer<typeof projectListFiltersSchema>;
export type ProjectMutationResult = z.infer<typeof projectMutationResultSchema>;
export type ProjectOutboxJob = z.infer<typeof projectOutboxJobSchema>;
