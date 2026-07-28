import { describe, expect, it } from 'vitest';

import {
  REQUIREMENT_TEMPLATE_FIELDS,
  createRequirementArtifactAdapter,
  deriveDeterministicGaps,
  evaluateApplicability,
  evaluateRequirementReadiness,
  mergeRequirementTemplate,
  requirementRecordFingerprint,
} from './requirements';

function templateField(index: number) {
  const field = REQUIREMENT_TEMPLATE_FIELDS[index];
  if (field === undefined) throw new Error('TEST_TEMPLATE_FIELD_MISSING');
  return field;
}

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
    expect(evaluateApplicability(null, values)).toBe(true);
    expect(
      evaluateApplicability(
        {
          operator: 'any',
          operands: [
            { operator: 'equals', fieldKey: 'project_type', value: 'INTERNAL' },
            { operator: 'present', fieldKey: 'missing' },
          ],
        },
        values,
      ),
    ).toBe(false);
    expect(
      evaluateApplicability(
        { operator: 'present', fieldKey: 'items' },
        new Map([
          ['items', ['one']],
          ['empty', []],
        ]),
      ),
    ).toBe(true);
    expect(
      evaluateApplicability({ operator: 'present', fieldKey: 'empty' }, new Map([['empty', []]])),
    ).toBe(false);
    let nested = { operator: 'present', fieldKey: 'project_type' } as const;
    for (let depth = 0; depth < 18; depth += 1) {
      nested = { operator: 'not', operand: nested } as never;
    }
    expect(() => evaluateApplicability(nested, values)).toThrow('maximum depth');
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
    expect(mergeRequirementTemplate(null)).toHaveLength(REQUIREMENT_TEMPLATE_FIELDS.length);
    const optional = {
      ...projectNameField,
      key: 'workspace_note',
      section: 'H' as const,
      order: 99,
      label: 'Workspace note',
      system: false,
      mandatory: false,
    };
    expect(
      mergeRequirementTemplate({
        optionalFields: [optional],
        applicabilityOverrides: { budget_band: null },
      }).at(-1),
    ).toMatchObject({ key: 'workspace_note' });
    for (const invalid of [
      { ...optional, key: 'INVALID' },
      { ...optional, label: ' ' },
      { ...optional, order: -1 },
      { ...optional, order: 1.5 },
      { ...optional, key: 'project_name' },
      { ...optional, system: true },
    ]) {
      expect(() =>
        mergeRequirementTemplate({
          optionalFields: [invalid],
          applicabilityOverrides: {},
        }),
      ).toThrow();
    }
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

  it('accepts only complete human resolutions and derives deterministic blocking gaps', () => {
    const template = [
      {
        ...templateField(0),
        key: 'resolved',
        applicability: null,
      },
      {
        ...templateField(1),
        key: 'not_applicable',
        applicability: null,
      },
      {
        ...templateField(2),
        key: 'accepted_risk',
        acceptedRiskAllowed: true,
        applicability: { operator: 'present' as const, fieldKey: 'resolved' },
      },
      {
        ...templateField(3),
        key: 'missing',
        applicability: null,
      },
      {
        ...templateField(4),
        key: 'optional',
        mandatory: false,
      },
    ];
    const body = {
      templateSnapshotId,
      templateHash: 'a'.repeat(64),
      fields: [
        {
          key: 'resolved',
          value: ['synthetic'],
          state: 'RESOLVED' as const,
          audience: 'CLIENT_VISIBLE' as const,
          citationIds: [],
          humanNote: null,
          riskOwnerId: null,
          riskReviewDate: null,
        },
        {
          key: 'not_applicable',
          value: null,
          state: 'NOT_APPLICABLE' as const,
          audience: 'TEAM_ONLY' as const,
          citationIds: [],
          humanNote: 'Not needed for this synthetic fixture.',
          riskOwnerId: null,
          riskReviewDate: null,
        },
        {
          key: 'accepted_risk',
          value: null,
          state: 'ACCEPTED_RISK' as const,
          audience: 'TEAM_ONLY' as const,
          citationIds: [],
          humanNote: 'Synthetic risk rationale.',
          riskOwnerId: 'synthetic-owner',
          riskReviewDate: '2026-08-26',
        },
      ],
    };
    const readiness = evaluateRequirementReadiness({
      body,
      template,
      openConflictIds: [],
      blockingGapIds: [],
    });
    expect(readiness.blockingFieldKeys).toEqual(['missing']);
    expect(deriveDeterministicGaps({ body, template })).toEqual([
      { fieldKey: 'missing', reason: 'MISSING', blocking: true },
    ]);
    expect(
      deriveDeterministicGaps({
        body,
        template: [
          {
            ...templateField(3),
            key: 'missing',
            applicability: { operator: 'present', fieldKey: 'resolved' },
          },
        ],
      }),
    ).toEqual([{ fieldKey: 'missing', reason: 'CONDITIONALLY_REQUIRED', blocking: true }]);
  });

  it('fingerprints normalized values, claim ordering, and optional provenance deterministically', () => {
    const structured = [{ z: 'last', a: 'first' }, { key: 'value' }];
    const first = requirementRecordFingerprint({
      kind: 'CLAIM',
      intakeSetId: 'intake',
      fieldKey: 'structured',
      value: structured,
    });
    expect(
      requirementRecordFingerprint({
        kind: 'CLAIM',
        intakeSetId: 'intake',
        fieldKey: 'structured',
        value: structured,
      }),
    ).toBe(first);
    expect(
      requirementRecordFingerprint({
        kind: 'CONFLICT',
        artifactId: 'artifact',
        fieldKey: 'structured',
        claimIds: ['b', 'a'],
      }),
    ).toBe(
      requirementRecordFingerprint({
        kind: 'CONFLICT',
        artifactId: 'artifact',
        fieldKey: 'structured',
        claimIds: ['a', 'b'],
      }),
    );
    expect(
      requirementRecordFingerprint({
        kind: 'GAP',
        fieldKey: 'missing',
        reason: 'MISSING',
      }),
    ).not.toBe(first);
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
    expect(adapter.normalize(body)).toMatchObject({ templateSnapshotId });
    expect(adapter.readHistorical(JSON.stringify(body))).toEqual(body);
    expect(adapter.submissionGuard?.(body)).toEqual({ ready: true, unmetCriteria: [] });
    expect(
      createRequirementArtifactAdapter({ externalProject: false }).approvalPolicy,
    ).toHaveLength(1);
  });

  it('rejects malformed or duplicate-key Requirement bodies', () => {
    const adapter = createRequirementArtifactAdapter({ externalProject: false });
    for (const invalid of [
      null,
      {},
      { templateSnapshotId, templateHash: 'bad', fields: [] },
      {
        templateSnapshotId,
        templateHash: 'a'.repeat(64),
        fields: [null],
      },
      {
        templateSnapshotId,
        templateHash: 'a'.repeat(64),
        fields: [{ key: 'same' }, { key: 'same' }],
      },
    ]) {
      expect(() => adapter.parse(invalid)).toThrow();
    }
  });
});
