import { z } from 'zod';

import { artifactAudienceSchema } from './artifacts';
import { sourceLocatorSchema } from './ingestion';

export const requirementSectionSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
export const requirementValueTypeSchema = z.enum([
  'short_text',
  'long_text',
  'string_list',
  'structured_list',
  'date',
  'enum',
]);
export const requirementFieldStateSchema = z.enum([
  'UNRESOLVED',
  'RESOLVED',
  'NOT_APPLICABLE',
  'ACCEPTED_RISK',
]);
export const claimDispositionKindSchema = z.enum(['ACCEPTED', 'EDITED', 'REJECTED']);
export const conflictStateSchema = z.enum(['OPEN', 'RESOLVED']);
export const gapReasonSchema = z.enum([
  'MISSING',
  'WEAK_SUPPORT',
  'CONFLICT',
  'CONDITIONALLY_REQUIRED',
]);
export const gapDispositionKindSchema = z.enum(['RESOLVED', 'NOT_APPLICABLE', 'ACCEPTED_RISK']);

export const applicabilityExpressionSchema: z.ZodType<ApplicabilityExpression> = z.lazy(() =>
  z.discriminatedUnion('operator', [
    z.object({
      operator: z.literal('all'),
      operands: z.array(applicabilityExpressionSchema).min(1).max(16),
    }),
    z.object({
      operator: z.literal('any'),
      operands: z.array(applicabilityExpressionSchema).min(1).max(16),
    }),
    z.object({ operator: z.literal('not'), operand: applicabilityExpressionSchema }),
    z.object({
      operator: z.literal('equals'),
      fieldKey: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
      value: z.union([z.string().max(500), z.boolean()]),
    }),
    z.object({
      operator: z.literal('present'),
      fieldKey: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
    }),
  ]),
);

export type ApplicabilityExpression =
  | { operator: 'all'; operands: ApplicabilityExpression[] }
  | { operator: 'any'; operands: ApplicabilityExpression[] }
  | { operator: 'not'; operand: ApplicabilityExpression }
  | { operator: 'equals'; fieldKey: string; value: string | boolean }
  | { operator: 'present'; fieldKey: string };

export const requirementFieldDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
  section: requirementSectionSchema,
  order: z.number().int().nonnegative(),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1_000),
  valueType: requirementValueTypeSchema,
  mandatory: z.boolean(),
  acceptedRiskAllowed: z.boolean(),
  citationExpected: z.boolean(),
  applicability: applicabilityExpressionSchema.nullable(),
  configurableApplicability: z.boolean(),
  system: z.boolean(),
});

export const workspaceTemplateExtensionSchema = z
  .object({
    schemaVersion: z.literal('1'),
    baseTemplateVersion: z.literal('1'),
    optionalFields: z.array(
      requirementFieldDefinitionSchema.extend({
        mandatory: z.literal(false),
        system: z.literal(false),
      }),
    ),
    applicabilityOverrides: z.record(
      z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
      applicabilityExpressionSchema.nullable(),
    ),
  })
  .strict();

const requirementValueSchema = z.union([
  z.string().max(20_000),
  z.array(z.string().max(2_000)).max(500),
  z.array(z.record(z.string().max(80), z.string().max(2_000))).max(500),
]);

export const requirementFieldEntrySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
  value: requirementValueSchema.nullable(),
  state: requirementFieldStateSchema,
  audience: artifactAudienceSchema,
  citationIds: z.array(z.uuidv7()).max(100),
  humanNote: z.string().max(8_000).nullable(),
  riskOwnerId: z.uuidv7().nullable(),
  riskReviewDate: z.iso.date().nullable(),
});

export const requirementBodySchema = z.object({
  templateSnapshotId: z.uuidv7(),
  templateHash: z.string().regex(/^[a-f0-9]{64}$/),
  fields: z.array(requirementFieldEntrySchema).max(200),
});

const requirementMutationEnvelopeSchema = z.object({
  schemaVersion: z.literal('1'),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  artifactId: z.uuidv7(),
  actorId: z.uuidv7(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.uuidv7(),
  correlationId: z.uuid(),
});

export const saveRequirementFieldCommandSchema = requirementMutationEnvelopeSchema.extend({
  fieldRevisionId: z.uuidv7(),
  command: z.object({
    fieldKey: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
    value: requirementValueSchema,
    audience: artifactAudienceSchema,
    citationIds: z.array(z.uuidv7()).max(100).default([]),
    humanNote: z.string().trim().max(8_000).nullable().default(null),
  }),
});

export const dispositionClaimCommandSchema = requirementMutationEnvelopeSchema.extend({
  claimId: z.uuidv7(),
  dispositionId: z.uuidv7(),
  command: z.discriminatedUnion('disposition', [
    z.object({ disposition: z.literal('ACCEPTED'), note: z.string().max(8_000).nullable() }),
    z.object({
      disposition: z.literal('EDITED'),
      value: requirementValueSchema,
      note: z.string().trim().min(2).max(8_000),
    }),
    z.object({
      disposition: z.literal('REJECTED'),
      note: z.string().trim().min(2).max(8_000),
    }),
  ]),
});

export const resolveRequirementConflictCommandSchema = requirementMutationEnvelopeSchema.extend({
  conflictId: z.uuidv7(),
  resolutionId: z.uuidv7(),
  command: z
    .object({
      selectedClaimId: z.uuidv7().nullable(),
      authoredValue: requirementValueSchema.nullable(),
      note: z.string().trim().min(2).max(8_000),
    })
    .superRefine((value, context) => {
      if ((value.selectedClaimId === null) === (value.authoredValue === null)) {
        context.addIssue({
          code: 'custom',
          message: 'Select exactly one claim or author one canonical value.',
          path: ['selectedClaimId'],
        });
      }
    }),
});

export const dispositionRequirementGapCommandSchema = requirementMutationEnvelopeSchema.extend({
  gapId: z.uuidv7(),
  dispositionId: z.uuidv7(),
  command: z.discriminatedUnion('disposition', [
    z.object({
      disposition: z.literal('RESOLVED'),
      fieldRevisionId: z.uuidv7(),
    }),
    z.object({
      disposition: z.literal('NOT_APPLICABLE'),
      justification: z.string().trim().min(8).max(8_000),
    }),
    z.object({
      disposition: z.literal('ACCEPTED_RISK'),
      ownerId: z.uuidv7(),
      rationale: z.string().trim().min(8).max(8_000),
      consequence: z.string().trim().min(8).max(8_000),
      reviewDate: z.iso.date(),
    }),
  ]),
});

export const citationSchema = z.object({
  id: z.uuidv7(),
  workspaceId: z.uuidv7(),
  projectId: z.uuidv7(),
  sourceGenerationId: z.uuidv7(),
  normalizedBlockIds: z.array(z.uuidv7()).min(1).max(50),
  locator: sourceLocatorSchema,
  locatorExcerptHash: z.string().regex(/^[a-f0-9]{64}$/),
  audience: artifactAudienceSchema,
});

export const requirementReadinessSchema = z.object({
  ready: z.boolean(),
  templateSnapshotId: z.uuidv7(),
  templateHash: z.string().regex(/^[a-f0-9]{64}$/),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  blockingFieldKeys: z.array(z.string()),
  blockingConflictIds: z.array(z.uuidv7()),
  blockingGapIds: z.array(z.uuidv7()),
});

export type RequirementBody = z.infer<typeof requirementBodySchema>;
export type RequirementFieldDefinition = z.infer<typeof requirementFieldDefinitionSchema>;
export type WorkspaceTemplateExtension = z.infer<typeof workspaceTemplateExtensionSchema>;
