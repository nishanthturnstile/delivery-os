import { describe, expect, it } from 'vitest';

import {
  REQUIREMENT_TEMPLATE_FIELDS,
  createRequirementArtifactAdapter,
  evaluateApplicability,
  evaluateRequirementReadiness,
  mergeRequirementTemplate,
} from './requirements';

const templateSnapshotId = '01967b7c-1c80-7000-8000-000000000001';

describe('M3 Requirement template and readiness', () => {
  it('defines every normative Section A-H field under stable unique keys', () => {
    expect(new Set(REQUIREMENT_TEMPLATE_FIELDS.map((field) => field.section))).toEqual(
      new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
    );
    expect(new Set(REQUIREMENT_TEMPLATE_FIELDS.map((field) => field.key)).size).toBe(
      REQUIREMENT_TEMPLATE_FIELDS.length,
    );
  });

  it('evaluates only the closed declarative applicability language', () => {
    const values = new Map([['project_type', 'EXTERNAL']]);
    expect(
      evaluateApplicability(
        { operator: 'equals', fieldKey: 'project_type', value: 'EXTERNAL' },
        values,
      ),
    ).toBe(true);
    expect(
      evaluateApplicability(
        {
          operator: 'all',
          operands: [
            { operator: 'present', fieldKey: 'project_type' },
            {
              operator: 'not',
              operand: { operator: 'equals', fieldKey: 'project_type', value: 'INTERNAL' },
            },
          ],
        },
        values,
      ),
    ).toBe(true);
  });

  it('does not allow workspace extensions to relax system controls', () => {
    const projectNameField = REQUIREMENT_TEMPLATE_FIELDS.find(
      (field) => field.key === 'project_name',
    );
    if (projectNameField === undefined) throw new Error('Missing project_name test definition.');
    expect(() =>
      mergeRequirementTemplate({
        optionalFields: [],
        applicabilityOverrides: { project_name: null },
      }),
    ).toThrow(/not configurable/);
    expect(() =>
      mergeRequirementTemplate({
        optionalFields: [
          {
            ...projectNameField,
            key: 'custom_required',
            system: false,
            mandatory: true,
          },
        ],
        applicabilityOverrides: {},
      }),
    ).toThrow(/optional/);
  });

  it('blocks submission for unresolved fields, conflicts, and gaps', () => {
    const body = {
      templateSnapshotId,
      templateHash: 'a'.repeat(64),
      fields: [
        {
          key: 'project_type',
          value: 'INTERNAL',
          state: 'RESOLVED' as const,
          audience: 'TEAM_ONLY' as const,
          citationIds: [],
          humanNote: null,
          riskOwnerId: null,
          riskReviewDate: null,
        },
      ],
    };
    const readiness = evaluateRequirementReadiness({
      body,
      template: REQUIREMENT_TEMPLATE_FIELDS,
      openConflictIds: ['conflict-1'],
      blockingGapIds: ['gap-1'],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockingFieldKeys).toContain('project_name');
    expect(readiness.unmetCriteria.map((item) => item.code)).toContain('CONFLICT_UNRESOLVED');
    expect(readiness.unmetCriteria.map((item) => item.code)).toContain('BLOCKING_GAP');
  });
});

describe('REQUIREMENT@1 artifact adapter', () => {
  it('uses PM plus first-binding client approval for external projects', () => {
    const adapter = createRequirementArtifactAdapter({ externalProject: true });
    expect(adapter.kind).toBe('REQUIREMENT');
    expect(adapter.approvalPolicy.map((slot) => slot.key)).toEqual(['pm', 'client']);
  });

  it('removes Team-only fields completely from client projection and diff', () => {
    const adapter = createRequirementArtifactAdapter({ externalProject: true });
    const body = {
      templateSnapshotId,
      templateHash: 'a'.repeat(64),
      fields: [
        {
          key: 'problem_summary',
          value: 'Visible summary',
          state: 'RESOLVED' as const,
          audience: 'CLIENT_VISIBLE' as const,
          citationIds: [],
          humanNote: null,
          riskOwnerId: null,
          riskReviewDate: null,
        },
        {
          key: 'known_risks',
          value: ['Private risk'],
          state: 'RESOLVED' as const,
          audience: 'TEAM_ONLY' as const,
          citationIds: [],
          humanNote: null,
          riskOwnerId: null,
          riskReviewDate: null,
        },
      ],
    };
    expect(JSON.stringify(adapter.projectAudience(body, 'CLIENT_VISIBLE'))).not.toContain(
      'Private risk',
    );
    expect(adapter.diff(body, body, 'CLIENT_VISIBLE').entries).toHaveLength(0);
  });
});
