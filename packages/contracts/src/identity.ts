import { z } from 'zod';

export const workspaceRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export const membershipStateSchema = z.enum(['ACTIVE', 'DEACTIVATED']);
export const invitationStateSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);
const httpsUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => value.toLowerCase().startsWith('https://'), {
    message: 'URL must use HTTPS.',
  });

export const workingHoursSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((value) => value.start < value.end, {
    message: 'Working hours must end after they start.',
  });

export const workspaceSchema = z.object({
  id: z.uuidv7(),
  revision: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  logoUrl: httpsUrlSchema.nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  timeZone: z.string().trim().min(1).max(100),
  defaultWorkingHours: workingHoursSchema,
});

export const workspaceMembershipSchema = z.object({
  workspaceId: z.uuidv7(),
  userId: z.uuidv7(),
  displayName: z.string().trim().min(1).max(120),
  email: z.email(),
  role: workspaceRoleSchema,
  state: membershipStateSchema,
  revision: z.number().int().positive(),
});

export const workspaceInvitationSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  email: z.email(),
  role: workspaceRoleSchema,
  state: invitationStateSchema,
  revision: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});

export const workspaceSummarySchema = workspaceSchema.extend({
  role: workspaceRoleSchema,
  membershipRevision: z.number().int().positive(),
});

export const identityContextSchema = z.object({
  user: z.object({
    id: z.uuidv7(),
    name: z.string().min(1).max(120),
    email: z.email(),
    emailVerified: z.boolean(),
    image: httpsUrlSchema.nullable(),
    twoFactorEnabled: z.boolean(),
  }),
  session: z.object({
    id: z.uuidv7(),
    token: z.string().min(1),
    mfaVerifiedAt: z.iso.datetime().nullable(),
    activeWorkspaceId: z.uuidv7().nullable(),
  }),
});

const mutationEnvelopeSchema = z.object({
  schemaVersion: z.literal('1'),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.uuidv7(),
  correlationId: z.uuid(),
});

export const createWorkspaceCommandSchema = mutationEnvelopeSchema.extend({
  workspaceId: z.uuidv7(),
  actorId: z.uuidv7(),
  command: z.object({
    name: z.string().trim().min(2).max(120),
    logoUrl: httpsUrlSchema.nullable().default(null),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#5146e5'),
    timeZone: z.string().trim().min(1).max(100).default('UTC'),
    defaultWorkingHours: workingHoursSchema.default({
      days: [1, 2, 3, 4, 5],
      start: '09:00',
      end: '17:00',
    }),
  }),
});

export const updateWorkspaceCommandSchema = mutationEnvelopeSchema.extend({
  workspaceId: z.uuidv7(),
  actorId: z.uuidv7(),
  mfaVerifiedAt: z.iso.datetime().nullable(),
  command: z.object({
    name: z.string().trim().min(2).max(120),
    logoUrl: httpsUrlSchema.nullable(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    timeZone: z.string().trim().min(1).max(100),
    defaultWorkingHours: workingHoursSchema,
  }),
});

export const issueInvitationCommandSchema = mutationEnvelopeSchema.extend({
  invitationId: z.uuidv7(),
  workspaceId: z.uuidv7(),
  actorId: z.uuidv7(),
  mfaVerifiedAt: z.iso.datetime().nullable(),
  command: z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    role: workspaceRoleSchema,
    tokenDigest: z.string().length(64),
    expiresAt: z.iso.datetime(),
  }),
});

export const acceptInvitationCommandSchema = mutationEnvelopeSchema.extend({
  workspaceId: z.uuidv7(),
  actorId: z.uuidv7(),
  command: z.object({
    invitationId: z.uuidv7(),
    tokenDigest: z.string().length(64),
    verifiedEmail: z.string().trim().toLowerCase().pipe(z.email()),
  }),
});

export const changeMembershipCommandSchema = mutationEnvelopeSchema.extend({
  workspaceId: z.uuidv7(),
  actorId: z.uuidv7(),
  mfaVerifiedAt: z.iso.datetime().nullable(),
  command: z.object({
    targetUserId: z.uuidv7(),
    role: workspaceRoleSchema.optional(),
    deactivate: z.boolean().optional(),
  }),
});

export const switchWorkspaceCommandSchema = z.object({
  schemaVersion: z.literal('1'),
  actorId: z.uuidv7(),
  workspaceId: z.uuidv7(),
  correlationId: z.uuid(),
});

export const updateProfileCommandSchema = z.object({
  schemaVersion: z.literal('1'),
  actorId: z.uuidv7(),
  correlationId: z.uuid(),
  command: z.object({
    displayName: z.string().trim().min(1).max(120),
    avatarUrl: httpsUrlSchema.nullable(),
    emailNotifications: z.boolean(),
  }),
});

export const identityMutationResultSchema = z.object({
  schemaVersion: z.literal('1'),
  entityId: z.uuidv7(),
  revision: z.number().int().positive(),
  state: z.string().min(1).max(40),
  auditEventId: z.uuidv7(),
  outboxEventId: z.uuidv7(),
  correlationId: z.uuid(),
  replayed: z.boolean(),
});

export const identityOutboxJobSchema = z.object({
  schemaVersion: z.literal('1'),
  eventId: z.uuidv7(),
  eventType: z.enum([
    'identity.workspace.created.v1',
    'identity.workspace.updated.v1',
    'identity.invitation.issued.v1',
    'identity.invitation.accepted.v1',
    'identity.membership.changed.v1',
  ]),
  workspaceId: z.uuidv7(),
  aggregateId: z.uuidv7(),
  aggregateRevision: z.number().int().positive(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type CreateWorkspaceCommand = z.infer<typeof createWorkspaceCommandSchema>;
export type UpdateWorkspaceCommand = z.infer<typeof updateWorkspaceCommandSchema>;
export type IssueInvitationCommand = z.infer<typeof issueInvitationCommandSchema>;
export type AcceptInvitationCommand = z.infer<typeof acceptInvitationCommandSchema>;
export type ChangeMembershipCommand = z.infer<typeof changeMembershipCommandSchema>;
export type SwitchWorkspaceCommand = z.infer<typeof switchWorkspaceCommandSchema>;
export type UpdateProfileCommand = z.infer<typeof updateProfileCommandSchema>;
export type IdentityMutationResult = z.infer<typeof identityMutationResultSchema>;
export type IdentityOutboxJob = z.infer<typeof identityOutboxJobSchema>;
