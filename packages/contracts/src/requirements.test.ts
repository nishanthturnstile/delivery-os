import { describe, expect, it } from 'vitest';

import {
  dispositionRequirementGapCommandSchema,
  resolveRequirementConflictCommandSchema,
  workspaceTemplateExtensionSchema,
} from './requirements';

const envelope = {
  schemaVersion: '1',
  workspaceId: '01967b7c-1c80-7000-8000-000000000001',
  projectId: '01967b7c-1c80-7000-8000-000000000002',
  artifactId: '01967b7c-1c80-7000-8000-000000000003',
  actorId: '01967b7c-1c80-7000-8000-000000000004',
  expectedRevision: 3,
  idempotencyKey: '01967b7c-1c80-7000-8000-000000000005',
  correlationId: '57b94b04-4786-453f-8e03-40de8718ad3e',
};

describe('M3 Requirement contracts', () => {
  it('allows only optional workspace fields and the closed applicability AST', () => {
    const extension = {
      schemaVersion: '1',
      baseTemplateVersion: '1',
      optionalFields: [
        {
          key: 'pilot_review_notes',
          section: 'H',
          order: 90,
          label: 'Pilot review notes',
          description: 'Optional notes.',
          valueType: 'long_text',
          mandatory: false,
          acceptedRiskAllowed: false,
          citationExpected: false,
          applicability: null,
          configurableApplicability: false,
          system: false,
        },
      ],
      applicabilityOverrides: {
        localization_requirements: {
          operator: 'equals',
          fieldKey: 'project_type',
          value: 'EXTERNAL',
        },
      },
    };
    expect(workspaceTemplateExtensionSchema.safeParse(extension).success).toBe(true);
    expect(
      workspaceTemplateExtensionSchema.safeParse({
        ...extension,
        optionalFields: [{ ...extension.optionalFields[0], mandatory: true }],
      }).success,
    ).toBe(false);
    expect(
      workspaceTemplateExtensionSchema.safeParse({
        ...extension,
        applicabilityOverrides: {
          localization_requirements: { operator: 'execute', code: 'return true' },
        },
      }).success,
    ).toBe(false);
  });

  it('requires exactly one human conflict resolution value and a note', () => {
    const base = {
      ...envelope,
      conflictId: '01967b7c-1c80-7000-8000-000000000006',
      resolutionId: '01967b7c-1c80-7000-8000-000000000007',
      expectedConflictRevision: 1,
    };
    expect(
      resolveRequirementConflictCommandSchema.safeParse({
        ...base,
        command: {
          selectedClaimId: '01967b7c-1c80-7000-8000-000000000008',
          authoredValue: null,
          note: 'Selected after comparing both cited sources.',
        },
      }).success,
    ).toBe(true);
    expect(
      resolveRequirementConflictCommandSchema.safeParse({
        ...base,
        command: {
          selectedClaimId: null,
          authoredValue: null,
          note: 'No value.',
        },
      }).success,
    ).toBe(false);
  });

  it('requires complete human-owned Accepted Risk data', () => {
    expect(
      dispositionRequirementGapCommandSchema.safeParse({
        ...envelope,
        gapId: '01967b7c-1c80-7000-8000-000000000006',
        dispositionId: '01967b7c-1c80-7000-8000-000000000007',
        expectedGapRevision: 1,
        command: {
          disposition: 'ACCEPTED_RISK',
          ownerId: '01967b7c-1c80-7000-8000-000000000008',
          rationale: 'The synthetic pilot can proceed with this known uncertainty.',
          consequence: 'The integration may require a later reviewed adjustment.',
          reviewDate: '2026-08-26',
        },
      }).success,
    ).toBe(true);
  });
});
