import { z } from 'zod';

export const artifactAudienceSchema = z.enum(['TEAM_ONLY', 'CLIENT_VISIBLE']);
export const artifactStateSchema = z.enum(['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED']);
export const approvalRequestStateSchema = z.enum([
  'OPEN',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'CANCELLED',
]);
export const approvalDecisionSchema = z.enum(['APPROVE', 'REJECT', 'CHANGES_REQUESTED']);
export const approvalScopeSchema = z.enum(['INTERNAL', 'EXTERNAL_BINDING']);
export const artifactRoleSchema = z.enum([
  'PM',
  'LEAD',
  'CONTRIBUTOR',
  'VIEWER',
  'CLIENT_STAKEHOLDER',
]);
export const artifactTargetTypeSchema = z.enum([
  'DRAFT_REVISION',
  'REVIEW_SNAPSHOT',
  'BASELINE',
  'DELTA',
]);
export const commentStateSchema = z.enum(['OPEN', 'RESOLVED', 'REMOVED']);
export const attachmentStateSchema = z.enum([
  'PENDING',
  'AVAILABLE',
  'REMOVED',
  'QUARANTINED',
  'FAILED',
]);
export const deltaStateSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'REJECTED',
  'CANCELLED',
  'APPLIED',
]);
export const exportStateSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);

const boundedJsonSchema = z.json().refine((value) => JSON.stringify(value).length <= 262_144, {
  message: 'Artifact body exceeds 256 KiB.',
});

const mutationEnvelopeSchema = z.object({
  schemaVersion: z.literal('1'),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  artifactId: z.uuidv7(),
  actorId: z.uuidv7(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.uuidv7(),
  correlationId: z.uuid(),
});

export const approvalSlotSchema = z.object({
  key: z.string().trim().min(1).max(64),
  role: artifactRoleSchema,
  scope: approvalScopeSchema,
  required: z.boolean(),
});

export const createArtifactCommandSchema = mutationEnvelopeSchema.extend({
  draftRevisionId: z.uuidv7(),
  audienceRecordId: z.uuidv7(),
  command: z.object({
    kind: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    schemaVersion: z.string().regex(/^[1-9]\d{0,7}$/),
    policyVersion: z.string().regex(/^[1-9]\d{0,7}$/),
    title: z.string().trim().min(1).max(200),
    audience: artifactAudienceSchema,
    body: boundedJsonSchema,
  }),
});

export const saveDraftRevisionCommandSchema = mutationEnvelopeSchema.extend({
  draftRevisionId: z.uuidv7(),
  command: z.object({
    schemaVersion: z.string().regex(/^[1-9]\d{0,7}$/),
    body: boundedJsonSchema,
  }),
});

export const submitArtifactForReviewCommandSchema = mutationEnvelopeSchema.extend({
  snapshotId: z.uuidv7(),
  approvalRequestId: z.uuidv7(),
  command: z.object({}).strict(),
});

export const decideArtifactApprovalCommandSchema = mutationEnvelopeSchema
  .extend({
    requestId: z.uuidv7(),
    decisionId: z.uuidv7(),
    baselineId: z.uuidv7().nullable().default(null),
    command: z.object({
      slotKey: z.string().trim().min(1).max(64),
      decision: approvalDecisionSchema,
      comment: z.string().trim().min(2).max(8_000).nullable().default(null),
    }),
  })
  .superRefine((value, context) => {
    if (value.command.decision !== 'APPROVE' && value.command.comment === null) {
      context.addIssue({
        code: 'custom',
        message: 'A human comment is required for a negative decision.',
        path: ['command', 'comment'],
      });
    }
  });

export const cancelApprovalRequestCommandSchema = mutationEnvelopeSchema.extend({
  requestId: z.uuidv7(),
  command: z.object({ comment: z.string().trim().min(2).max(8_000) }),
});

export const setArtifactAudienceCommandSchema = mutationEnvelopeSchema.extend({
  audienceRecordId: z.uuidv7(),
  command: z.object({
    audience: artifactAudienceSchema,
    reason: z.string().trim().min(8).max(1_000).nullable().default(null),
  }),
});

export const createArtifactDeltaCommandSchema = mutationEnvelopeSchema.extend({
  deltaId: z.uuidv7(),
  draftRevisionId: z.uuidv7(),
  command: z.object({
    rationale: z.string().trim().min(2).max(4_000),
  }),
});

const childMutationEnvelopeSchema = mutationEnvelopeSchema.extend({
  targetType: artifactTargetTypeSchema,
  targetId: z.uuidv7(),
});

export const createArtifactCommentCommandSchema = childMutationEnvelopeSchema.extend({
  commentId: z.uuidv7(),
  audienceRecordId: z.uuidv7(),
  command: z.object({
    body: z.string().trim().min(1).max(8_000),
    audience: artifactAudienceSchema,
    mentionUserIds: z.array(z.uuidv7()).max(32).default([]),
  }),
});

export const mutateArtifactCommentCommandSchema = mutationEnvelopeSchema.extend({
  commentId: z.uuidv7(),
  expectedCommentRevision: z.number().int().positive(),
  command: z.discriminatedUnion('action', [
    z.object({
      action: z.literal('EDIT'),
      body: z.string().trim().min(1).max(8_000),
      mentionUserIds: z.array(z.uuidv7()).max(32).default([]),
    }),
    z.object({ action: z.literal('RESOLVE') }),
    z.object({ action: z.literal('REOPEN') }),
    z.object({
      action: z.literal('REMOVE'),
      reason: z.string().trim().min(2).max(1_000),
    }),
  ]),
});

export const registerArtifactAttachmentCommandSchema = childMutationEnvelopeSchema.extend({
  attachmentId: z.uuidv7(),
  audienceRecordId: z.uuidv7(),
  command: z.object({
    displayName: z.string().trim().min(1).max(240),
    mediaType: z.string().trim().min(1).max(120),
    byteSize: z.number().int().positive().max(100_000_000),
    audience: artifactAudienceSchema,
    objectReference: z.string().trim().min(1).max(2_048),
  }),
});

export const removeArtifactAttachmentCommandSchema = mutationEnvelopeSchema.extend({
  attachmentId: z.uuidv7(),
  expectedAttachmentRevision: z.number().int().positive(),
  command: z.object({
    reason: z.string().trim().min(2).max(1_000),
  }),
});

export const requestArtifactExportCommandSchema = childMutationEnvelopeSchema.extend({
  exportId: z.uuidv7(),
  command: z.object({ format: z.literal('JSON') }),
});

export const cancelArtifactExportCommandSchema = mutationEnvelopeSchema.extend({
  exportId: z.uuidv7(),
  command: z.object({ reason: z.string().trim().min(2).max(1_000) }),
});

export const artifactSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  kind: z.string().min(2).max(64),
  schemaVersion: z.string().min(1).max(8),
  policyVersion: z.string().min(1).max(8),
  title: z.string().min(1).max(200),
  state: artifactStateSchema,
  audience: artifactAudienceSchema,
  revision: z.number().int().positive(),
  currentDraftRevisionId: z.uuidv7(),
  openApprovalRequestId: z.uuidv7().nullable(),
  currentBaselineId: z.uuidv7().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const artifactDraftRevisionSchema = z.object({
  id: z.uuidv7(),
  artifactId: z.uuidv7(),
  number: z.number().int().positive(),
  parentRevisionId: z.uuidv7().nullable(),
  schemaVersion: z.string().min(1).max(8),
  canonicalization: z.literal('JCS_RFC8785'),
  hashAlgorithm: z.literal('SHA256'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  body: z.json(),
  createdBy: z.uuidv7(),
  createdAt: z.iso.datetime(),
});

export const reviewSnapshotSchema = artifactDraftRevisionSchema
  .omit({ parentRevisionId: true })
  .extend({
    draftRevisionId: z.uuidv7(),
    policyVersion: z.string().min(1).max(8),
  });

export const approvalDecisionRecordSchema = z.object({
  id: z.uuidv7(),
  requestId: z.uuidv7(),
  snapshotId: z.uuidv7(),
  slotKey: z.string().min(1).max(64),
  scope: approvalScopeSchema,
  decision: approvalDecisionSchema,
  actorId: z.uuidv7(),
  actorRole: artifactRoleSchema,
  comment: z.string().max(8_000).nullable(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  decidedAt: z.iso.datetime(),
});

export const artifactBaselineSchema = z.object({
  id: z.uuidv7(),
  artifactId: z.uuidv7(),
  majorNumber: z.number().int().positive(),
  displayNumber: z.string().regex(/^[1-9]\d*\.0$/),
  sourceSnapshotId: z.uuidv7(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  schemaVersion: z.string().min(1).max(8),
  state: z.enum(['CURRENT', 'SUPERSEDED']),
  createdAt: z.iso.datetime(),
});

export const artifactCommentSchema = z.object({
  id: z.uuidv7(),
  artifactId: z.uuidv7(),
  targetType: artifactTargetTypeSchema,
  targetId: z.uuidv7(),
  body: z.string().max(8_000).nullable(),
  audience: artifactAudienceSchema,
  state: commentStateSchema,
  revision: z.number().int().positive(),
  authorId: z.uuidv7(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const artifactAttachmentSchema = z.object({
  id: z.uuidv7(),
  artifactId: z.uuidv7(),
  targetType: artifactTargetTypeSchema,
  targetId: z.uuidv7(),
  displayName: z.string().min(1).max(240),
  mediaType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  audience: artifactAudienceSchema,
  state: attachmentStateSchema,
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const artifactExportSchema = z.object({
  id: z.uuidv7(),
  artifactId: z.uuidv7(),
  targetType: artifactTargetTypeSchema,
  targetId: z.uuidv7(),
  format: z.literal('JSON'),
  audience: artifactAudienceSchema,
  state: exportStateSchema,
  revision: z.number().int().positive(),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const artifactMutationResultSchema = z.object({
  schemaVersion: z.literal('1'),
  artifactId: z.uuidv7(),
  revision: z.number().int().positive(),
  state: artifactStateSchema,
  replayed: z.boolean(),
  draftRevisionId: z.uuidv7().optional(),
  snapshotId: z.uuidv7().optional(),
  approvalRequestId: z.uuidv7().optional(),
  decisionId: z.uuidv7().optional(),
  bindingDecision: z.enum(['APPROVED', 'REJECTED']).optional(),
  baselineId: z.uuidv7().optional(),
  baselineNumber: z
    .string()
    .regex(/^[1-9]\d*\.0$/)
    .optional(),
  exportId: z.uuidv7().optional(),
  correlationId: z.uuid(),
});

export const artifactOutboxJobSchema = z.object({
  eventId: z.uuidv7(),
  workspaceId: z.uuidv7(),
  aggregateType: z.literal('ARTIFACT'),
  aggregateId: z.uuidv7(),
  aggregateRevision: z.number().int().positive(),
  eventType: z.enum([
    'artifact.created.v1',
    'artifact.draft-revision-saved.v1',
    'artifact.review-submitted.v1',
    'artifact.approval-decided.v1',
    'artifact.review-closed.v1',
    'artifact.baseline-created.v1',
    'artifact.audience-changed.v1',
    'artifact.comment-created.v1',
    'artifact.comment-state-changed.v1',
    'artifact.attachment-state-changed.v1',
    'artifact.export-requested.v1',
    'artifact.export-cancelled.v1',
  ]),
  schemaVersion: z.literal('1'),
  payload: z.object({
    artifactId: z.uuidv7(),
    projectId: z.uuidv7(),
    state: artifactStateSchema,
    audience: artifactAudienceSchema,
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    exportId: z.uuidv7().optional(),
  }),
  correlationId: z.uuid(),
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactDraftRevision = z.infer<typeof artifactDraftRevisionSchema>;
export type ReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;
export type ApprovalDecisionRecord = z.infer<typeof approvalDecisionRecordSchema>;
export type ArtifactBaseline = z.infer<typeof artifactBaselineSchema>;
export type ArtifactComment = z.infer<typeof artifactCommentSchema>;
export type ArtifactAttachment = z.infer<typeof artifactAttachmentSchema>;
export type ArtifactExport = z.infer<typeof artifactExportSchema>;
export type CreateArtifactCommand = z.infer<typeof createArtifactCommandSchema>;
export type SaveDraftRevisionCommand = z.infer<typeof saveDraftRevisionCommandSchema>;
export type SubmitArtifactForReviewCommand = z.infer<typeof submitArtifactForReviewCommandSchema>;
export type DecideArtifactApprovalCommand = z.infer<typeof decideArtifactApprovalCommandSchema>;
export type CancelApprovalRequestCommand = z.infer<typeof cancelApprovalRequestCommandSchema>;
export type SetArtifactAudienceCommand = z.infer<typeof setArtifactAudienceCommandSchema>;
export type CreateArtifactDeltaCommand = z.infer<typeof createArtifactDeltaCommandSchema>;
export type CreateArtifactCommentCommand = z.infer<typeof createArtifactCommentCommandSchema>;
export type MutateArtifactCommentCommand = z.infer<typeof mutateArtifactCommentCommandSchema>;
export type RegisterArtifactAttachmentCommand = z.infer<
  typeof registerArtifactAttachmentCommandSchema
>;
export type RemoveArtifactAttachmentCommand = z.infer<typeof removeArtifactAttachmentCommandSchema>;
export type RequestArtifactExportCommand = z.infer<typeof requestArtifactExportCommandSchema>;
export type CancelArtifactExportCommand = z.infer<typeof cancelArtifactExportCommandSchema>;
export type ArtifactMutationResult = z.infer<typeof artifactMutationResultSchema>;
export type ArtifactOutboxJob = z.infer<typeof artifactOutboxJobSchema>;
