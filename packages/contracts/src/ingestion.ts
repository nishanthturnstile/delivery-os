import { z } from 'zod';

import { artifactAudienceSchema } from './artifacts';

export const sourceFormatSchema = z.enum(['PDF', 'DOCX', 'MARKDOWN', 'TEXT']);
export const sourceMediaTypeSchema = z.enum([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
]);
export const sourceProcessingStateSchema = z.enum([
  'QUEUED',
  'SCANNING',
  'PROCESSING',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'FAILED',
]);
export const sourceRetentionStateSchema = z.enum(['ACTIVE', 'RECOVERABLE', 'PURGING', 'PURGED']);
export const uploadSessionStateSchema = z.enum([
  'OPEN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);
export const documentJobTypeSchema = z.enum(['SCAN', 'PARSE', 'OCR', 'EXTRACT', 'BACKUP', 'PURGE']);
export const documentJobStateSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'DEAD_LETTER',
  'CANCELLED',
]);
export const normalizedBlockKindSchema = z.enum([
  'HEADING',
  'PARAGRAPH',
  'LIST_ITEM',
  'TABLE_CELL',
]);
export const extractionMethodSchema = z.enum(['EMBEDDED_TEXT', 'OCR']);

const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const base64Sha256Schema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/, 'Expected a base64-encoded 32-byte SHA-256 digest.');

const sourceMutationEnvelopeSchema = z.object({
  schemaVersion: z.literal('1'),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  actorId: z.uuidv7(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.uuidv7(),
  correlationId: z.uuid(),
});

export const createSourceUploadSessionCommandSchema = sourceMutationEnvelopeSchema.extend({
  sourceArtifactId: z.uuidv7(),
  sourceGenerationId: z.uuidv7(),
  uploadSessionId: z.uuidv7(),
  objectManifestId: z.uuidv7(),
  command: z.object({
    displayName: z.string().trim().min(1).max(240),
    declaredMediaType: sourceMediaTypeSchema,
    declaredByteSize: z.number().int().positive().max(52_428_800),
    checksumSha256: sha256HexSchema,
    checksumSha256Base64: base64Sha256Schema,
    audience: artifactAudienceSchema,
  }),
});

export const completeSourceUploadSessionCommandSchema = sourceMutationEnvelopeSchema.extend({
  sourceArtifactId: z.uuidv7(),
  sourceGenerationId: z.uuidv7(),
  uploadSessionId: z.uuidv7(),
  command: z.object({}).strict(),
});

export const cancelSourceUploadSessionCommandSchema = sourceMutationEnvelopeSchema.extend({
  sourceArtifactId: z.uuidv7(),
  uploadSessionId: z.uuidv7(),
  command: z.object({
    reason: z.string().trim().min(2).max(1_000),
  }),
});

export const mutateSourceRetentionCommandSchema = sourceMutationEnvelopeSchema.extend({
  sourceArtifactId: z.uuidv7(),
  command: z.discriminatedUnion('action', [
    z.object({ action: z.literal('DELETE'), reason: z.string().trim().min(2).max(1_000) }),
    z.object({ action: z.literal('RECOVER') }),
  ]),
});

export const retryDocumentJobCommandSchema = sourceMutationEnvelopeSchema.extend({
  sourceArtifactId: z.uuidv7(),
  jobId: z.uuidv7(),
  command: z.object({
    clearingNote: z.string().trim().min(2).max(1_000),
  }),
});

export const sourceLocatorSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('PDF'),
    page: z.number().int().positive(),
    polygon: z.array(z.number()).length(8),
    textItemRange: z
      .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
      .optional(),
  }),
  z.object({
    format: z.literal('DOCX'),
    headingPath: z.array(z.string().max(200)).max(16),
    paragraph: z.number().int().nonnegative().optional(),
    table: z.number().int().nonnegative().optional(),
    row: z.number().int().nonnegative().optional(),
    cell: z.number().int().nonnegative().optional(),
  }),
  z.object({
    format: z.literal('MARKDOWN'),
    headingPath: z.array(z.string().max(200)).max(16),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  z.object({
    format: z.literal('TEXT'),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
]);

export const normalizedBlockSchema = z.object({
  id: z.uuidv7(),
  normalizedDocumentId: z.uuidv7(),
  ordinal: z.number().int().nonnegative(),
  blockKey: sha256HexSchema,
  kind: normalizedBlockKindSchema,
  text: z.string().min(1).max(100_000),
  locator: sourceLocatorSchema,
  extraction: extractionMethodSchema,
  confidence: z
    .string()
    .regex(/^(0(\.\d+)?|1(\.0+)?)$/)
    .optional(),
});

export const sourceArtifactSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  currentGenerationId: z.uuidv7(),
  displayName: z.string().min(1).max(240),
  format: sourceFormatSchema,
  audience: artifactAudienceSchema,
  processingState: sourceProcessingStateSchema,
  retentionState: sourceRetentionStateSchema,
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const sourceUploadSessionResultSchema = z.object({
  schemaVersion: z.literal('1'),
  sourceArtifactId: z.uuidv7(),
  sourceGenerationId: z.uuidv7(),
  uploadSessionId: z.uuidv7(),
  revision: z.number().int().positive(),
  state: uploadSessionStateSchema,
  upload: z
    .object({
      url: z.url(),
      method: z.literal('PUT'),
      requiredHeaders: z.record(z.string(), z.string()),
      expiresAt: z.iso.datetime(),
    })
    .nullable(),
  correlationId: z.uuid(),
});

export const sourceMutationResultSchema = z.object({
  schemaVersion: z.literal('1'),
  sourceArtifactId: z.uuidv7(),
  revision: z.number().int().positive(),
  processingState: sourceProcessingStateSchema,
  retentionState: sourceRetentionStateSchema,
  recoverableUntil: z.iso.datetime().nullable(),
  correlationId: z.uuid(),
  replayed: z.boolean(),
});

export const sourceDownloadResultSchema = z.object({
  schemaVersion: z.literal('1'),
  sourceArtifactId: z.uuidv7(),
  generationId: z.uuidv7(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
  correlationId: z.uuid(),
});

export const sourceOutboxJobSchema = z
  .object({
    schemaVersion: z.literal('1'),
    eventId: z.uuidv7(),
    eventType: z.enum([
      'source.upload-created.v1',
      'source.upload-completed.v1',
      'source.scan-requested.v1',
      'source.upload-failed.v1',
      'source.deleted.v1',
      'source.recovered.v1',
      'source.purge-requested.v1',
      'source.purged.v1',
      'source.parse-completed.v1',
    ]),
    workspaceId: z.uuidv7(),
    projectId: z.uuidv7(),
    sourceArtifactId: z.uuidv7(),
    sourceGenerationId: z.uuidv7().optional(),
    inputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    aggregateRevision: z.number().int().positive(),
    correlationId: z.uuid(),
    occurredAt: z.iso.datetime(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{2,80}$/)
      .optional(),
  })
  .strict();

export type SourceFormat = z.infer<typeof sourceFormatSchema>;
export type SourceLocator = z.infer<typeof sourceLocatorSchema>;
export type NormalizedBlock = z.infer<typeof normalizedBlockSchema>;
export type CreateSourceUploadSessionCommand = z.infer<
  typeof createSourceUploadSessionCommandSchema
>;
export type CompleteSourceUploadSessionCommand = z.infer<
  typeof completeSourceUploadSessionCommandSchema
>;
export type CancelSourceUploadSessionCommand = z.infer<
  typeof cancelSourceUploadSessionCommandSchema
>;
export type MutateSourceRetentionCommand = z.infer<typeof mutateSourceRetentionCommandSchema>;
export type RetryDocumentJobCommand = z.infer<typeof retryDocumentJobCommandSchema>;
export type SourceArtifact = z.infer<typeof sourceArtifactSchema>;
export type SourceUploadSessionResult = z.infer<typeof sourceUploadSessionResultSchema>;
export type SourceMutationResult = z.infer<typeof sourceMutationResultSchema>;
export type SourceDownloadResult = z.infer<typeof sourceDownloadResultSchema>;
export type SourceOutboxJob = z.infer<typeof sourceOutboxJobSchema>;
