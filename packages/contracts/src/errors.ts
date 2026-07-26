import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'MFA_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'REVISION_CONFLICT',
  'INVALID_TRANSITION',
  'READINESS_FAILED',
  'APPROVAL_CLOSED',
  'MATERIAL_CHANGE_REQUIRED',
  'DEPENDENCY_CYCLE',
  'QUOTA_EXCEEDED',
  'JOB_NOT_CANCELLABLE',
  'VALIDATION_FAILED',
  'IDEMPOTENCY_KEY_REUSED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1).max(240),
    correlationId: z.uuid(),
    currentRevision: z.number().int().nonnegative().optional(),
    details: z
      .object({
        allowedStates: z.array(z.string().min(1).max(40)).optional(),
        artifactState: z.string().min(1).max(40).optional(),
        requestState: z.string().min(1).max(40).optional(),
        bindingDecision: z.enum(['APPROVED', 'REJECTED']).optional(),
        lastUpdatedAt: z.iso.datetime().optional(),
        reloadUrl: z.string().startsWith('/').max(2_048).optional(),
        unmetCriteria: z
          .array(
            z.object({
              code: z.string().min(1).max(80),
              message: z.string().min(1).max(240),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
  schemaVersion: z.literal('1'),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
