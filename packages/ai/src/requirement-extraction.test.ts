import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DeterministicFakeExtractionProvider,
  RequirementExtractionWorkflow,
  validateExtraction,
} from './requirement-extraction';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const input = {
  schemaVersion: '1' as const,
  intakeSetId: 'intake',
  templateHash: digest('template'),
  workflowConfigHash: digest('fake-workflow'),
  blocks: [
    {
      id: 'block-1',
      sourceGenerationId: 'generation-1',
      text: 'The synthetic target is 99.9%.',
      audience: 'CLIENT_VISIBLE' as const,
    },
  ],
};

describe('Requirement extraction boundary', () => {
  it('accepts only cited proposals and never exposes a binding action', async () => {
    const workflow = new RequirementExtractionWorkflow(
      new DeterministicFakeExtractionProvider(() => ({
        schemaVersion: '1',
        claims: [
          { fieldKey: 'availability_uptime', proposedValue: '99.9%', blockIds: ['block-1'] },
        ],
        questions: [],
      })),
      () => true,
    );
    const result = await workflow.run(input);
    expect(result.claims).toHaveLength(1);
    expect(result).not.toHaveProperty('accepted');
    expect(result).not.toHaveProperty('approved');
    expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed for disabled workflows, invalid citations, and extra output fields', async () => {
    const disabled = new RequirementExtractionWorkflow(
      new DeterministicFakeExtractionProvider(() => ({
        schemaVersion: '1',
        claims: [],
        questions: [],
      })),
      () => false,
    );
    await expect(disabled.run(input)).rejects.toThrow('AI_WORKFLOW_DISABLED');
    expect(() =>
      validateExtraction(input, {
        schemaVersion: '1',
        claims: [{ fieldKey: 'problem_summary', proposedValue: 'x', blockIds: ['foreign'] }],
        questions: [],
      }),
    ).toThrow('AI_CITATION_INVALID');
    expect(() =>
      validateExtraction(input, {
        schemaVersion: '1',
        claims: [],
        questions: [],
        submit: true,
      }),
    ).toThrow();
  });
});
