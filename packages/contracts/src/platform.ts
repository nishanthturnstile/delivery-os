import { z } from 'zod';

export const authorizationContextSchema = z.object({
  userId: z.uuidv7(),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7().optional(),
  workspaceRole: z.enum(['ADMIN', 'MEMBER']),
  projectRoles: z.array(z.enum(['PM', 'LEAD', 'CONTRIBUTOR', 'VIEWER', 'CLIENT_STAKEHOLDER'])),
  oauthClientId: z.string().min(1).max(200).optional(),
  oauthScopes: z.array(z.string().min(1).max(100)).optional(),
  mfaVerifiedAt: z.iso.datetime().optional(),
});

export const platformProbeCommandSchema = z.object({
  schemaVersion: z.literal('1'),
  aggregateId: z.uuidv7(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.uuidv7(),
  correlationId: z.uuid(),
  authorization: authorizationContextSchema,
  command: z.object({
    delta: z.number().int().min(1).max(100),
    reason: z.string().trim().min(3).max(240),
  }),
});

export type AuthorizationContext = z.infer<typeof authorizationContextSchema>;
export type PlatformProbeCommand = z.infer<typeof platformProbeCommandSchema>;

export const platformProbeResultSchema = z.object({
  schemaVersion: z.literal('1'),
  entityId: z.uuidv7(),
  revision: z.number().int().positive(),
  state: z.literal('ACTIVE'),
  value: z.number().int().nonnegative(),
  outboxEventId: z.uuidv7(),
  auditEventId: z.uuidv7(),
  correlationId: z.uuid(),
  replayed: z.boolean(),
});

export type PlatformProbeResult = z.infer<typeof platformProbeResultSchema>;

export const outboxJobSchema = z.object({
  schemaVersion: z.literal('1'),
  eventId: z.uuidv7(),
  eventType: z.literal('platform.probe.recorded.v1'),
  workspaceId: z.uuidv7(),
  aggregateId: z.uuidv7(),
  aggregateRevision: z.number().int().positive(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export type OutboxJob = z.infer<typeof outboxJobSchema>;
