import {
  createLiveRequirementWorkflowConfig,
  DeterministicFakeExtractionProvider,
} from '@delivery-os/ai';
import { describe, expect, it, vi } from 'vitest';

import {
  createRequirementExtractionHandler,
  requirementExtractionTestInternals,
} from './requirement-extraction-handler';

const config = createLiveRequirementWorkflowConfig({
  provider: 'openai',
  modelId: 'gpt-5.6-terra',
  promptVersion: 'REQUIREMENT_EXTRACTION@1',
  schemaVersion: '1',
  temperature: 0,
  timeoutMs: 30_000,
  maxRetries: 2,
  maxCostUsd: 1,
});

const claim = {
  id: '019c9f00-0000-7000-8000-000000000001',
  attemptId: '019c9f00-0000-7000-8000-000000000002',
  attemptNumber: 1,
  workspaceId: '019c9f00-0000-7000-8000-000000000003',
  projectId: '019c9f00-0000-7000-8000-000000000004',
  sourceArtifactId: null,
  sourceGenerationId: null,
  intakeSetId: '019c9f00-0000-7000-8000-000000000005',
  jobType: 'EXTRACT' as const,
  inputHash: 'a'.repeat(64),
  configVersion: config.configHash,
  correlationId: '019c9f00-0000-7000-8000-000000000006',
};

function dependencies() {
  return {
    requirements: {
      loadExtractionContext: vi.fn().mockResolvedValue({
        artifactId: '019c9f00-0000-7000-8000-000000000007',
        actorId: 'synthetic-actor',
        templateHash: 'b'.repeat(64),
        fields: [
          { key: 'project_objectives', label: 'Project objectives', valueType: 'long_text' },
          { key: 'success_metrics', label: 'Success metrics', valueType: 'structured_list' },
        ],
        blocks: [
          {
            id: '019c9f00-0000-7000-8000-000000000008',
            sourceGenerationId: '019c9f00-0000-7000-8000-000000000009',
            locatorId: '019c9f00-0000-7000-8000-000000000010',
            text: 'Synthetic Team-only evidence.',
            audience: 'TEAM_ONLY' as const,
          },
          {
            id: '019c9f00-0000-7000-8000-000000000011',
            sourceGenerationId: '019c9f00-0000-7000-8000-000000000012',
            locatorId: '019c9f00-0000-7000-8000-000000000013',
            text: 'Synthetic client-visible evidence.',
            audience: 'CLIENT_VISIBLE' as const,
          },
        ],
      }),
      createCitation: vi.fn().mockResolvedValue({ id: 'citation' }),
      appendClaim: vi
        .fn()
        .mockResolvedValue({ id: 'claim', replayed: false, audience: 'TEAM_ONLY' }),
      createGap: vi.fn().mockResolvedValue({ id: 'gap', replayed: false }),
    },
    ai: {
      reserveRun: vi.fn().mockResolvedValue({ replayed: false, alerts: [] }),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      commitSuccess: vi.fn().mockResolvedValue({ replayed: false, retainedUntil: null }),
    },
  };
}

describe('Requirement extraction job handler', () => {
  it('commits advisory claims, citations, and non-blocking questions without a human action', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: () =>
        new DeterministicFakeExtractionProvider(() => ({
          schemaVersion: '1',
          claims: [
            {
              fieldKey: 'project_objectives',
              proposedValue: 'Synthetic advisory proposal.',
              blockIds: [
                '019c9f00-0000-7000-8000-000000000008',
                '019c9f00-0000-7000-8000-000000000011',
              ],
            },
          ],
          questions: [
            {
              fieldKey: 'success_metrics',
              question: 'Which synthetic metric should be used?',
            },
          ],
        })),
    });

    await handler.run(claim);

    expect(deps.requirements.createCitation).toHaveBeenCalledTimes(2);
    expect(deps.requirements.appendClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: '019c9f00-0000-7000-8000-000000000007',
        workflowKind: 'LIVE_AI',
        workflowConfigHash: config.configHash,
      }),
    );
    expect(deps.requirements.createGap).toHaveBeenCalledWith(
      expect.objectContaining({ blocking: false, reason: 'MISSING' }),
    );
    expect(deps.ai.commitSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'TEAM_ONLY', inputTokens: 0, outputTokens: 0 }),
    );
    expect(deps.ai.recordFailure).not.toHaveBeenCalled();
  });

  it('fails closed before loading content when the kill switch is off', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => false,
      provider: () => new DeterministicFakeExtractionProvider(() => ({})),
    });

    await expect(handler.run(claim)).rejects.toThrow('AI_WORKFLOW_DISABLED');
    expect(deps.requirements.loadExtractionContext).not.toHaveBeenCalled();
    expect(deps.ai.reserveRun).not.toHaveBeenCalled();
  });

  it('rejects jobs without an immutable intake-set binding', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: () => new DeterministicFakeExtractionProvider(() => ({})),
    });

    await expect(handler.run({ ...claim, intakeSetId: null })).rejects.toThrow(
      'AI_INTAKE_SET_MISSING',
    );
    expect(deps.requirements.loadExtractionContext).not.toHaveBeenCalled();
  });

  it('records a failed reserved run when provider output is invalid', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: () => new DeterministicFakeExtractionProvider(() => ({ unsafe: true })),
    });

    await expect(handler.run(claim)).rejects.toThrow();
    expect(deps.ai.recordFailure).toHaveBeenCalledOnce();
    expect(deps.ai.commitSuccess).not.toHaveBeenCalled();
  });

  it('fails the job when advisory output cites a block outside the bound intake set', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: () =>
        new DeterministicFakeExtractionProvider(() => ({
          schemaVersion: '1',
          claims: [
            {
              fieldKey: 'project_objectives',
              proposedValue: 'Synthetic advisory proposal.',
              blockIds: ['outside-intake-set'],
            },
          ],
          questions: [],
        })),
    });

    await expect(handler.run(claim)).rejects.toThrow('AI_CITATION_INVALID');
    expect(deps.requirements.createCitation).not.toHaveBeenCalled();
    expect(deps.ai.commitSuccess).not.toHaveBeenCalled();
  });

  it('groups blocks at the same exact locator and preserves client-visible provenance', async () => {
    const deps = dependencies();
    deps.requirements.loadExtractionContext.mockResolvedValue({
      artifactId: '019c9f00-0000-7000-8000-000000000007',
      actorId: 'synthetic-actor',
      templateHash: 'b'.repeat(64),
      fields: [
        { key: 'project_objectives', label: 'Project objectives', valueType: 'long_text' },
        { key: 'success_metrics', label: 'Success metrics', valueType: 'structured_list' },
      ],
      blocks: [
        {
          id: '019c9f00-0000-7000-8000-000000000008',
          sourceGenerationId: '019c9f00-0000-7000-8000-000000000009',
          locatorId: '019c9f00-0000-7000-8000-000000000010',
          text: 'Synthetic evidence one.',
          audience: 'CLIENT_VISIBLE',
        },
        {
          id: '019c9f00-0000-7000-8000-000000000011',
          sourceGenerationId: '019c9f00-0000-7000-8000-000000000009',
          locatorId: '019c9f00-0000-7000-8000-000000000010',
          text: 'Synthetic evidence two.',
          audience: 'CLIENT_VISIBLE',
        },
      ],
    });
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: () =>
        new DeterministicFakeExtractionProvider(() => ({
          schemaVersion: '1',
          claims: [
            {
              fieldKey: 'project_objectives',
              proposedValue: 'Synthetic advisory proposal.',
              blockIds: [
                '019c9f00-0000-7000-8000-000000000008',
                '019c9f00-0000-7000-8000-000000000011',
              ],
            },
          ],
          questions: [],
        })),
    });

    await handler.run(claim);

    expect(deps.requirements.createCitation).toHaveBeenCalledOnce();
    expect(deps.requirements.createCitation).toHaveBeenCalledWith(
      expect.objectContaining({
        blockIds: ['019c9f00-0000-7000-8000-000000000008', '019c9f00-0000-7000-8000-000000000011'],
        audience: 'CLIENT_VISIBLE',
      }),
    );
    expect(deps.ai.commitSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'CLIENT_VISIBLE' }),
    );
  });

  it('fails closed when a provider attempts to use a different pinned budget configuration', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: (budget) => ({
        async extract() {
          await budget.assertAvailable({
            workflowConfigHash: 'f'.repeat(64),
            maxRunCostUsd: config.maxCostUsd,
          });
          return { schemaVersion: '1', claims: [], questions: [] };
        },
      }),
    });
    await expect(handler.run(claim)).rejects.toThrow('AI_WORKFLOW_CONFIG_MISMATCH');
    expect(deps.ai.recordFailure).toHaveBeenCalledOnce();
  });

  it('fails closed when provider usage does not match the pinned provider and model', async () => {
    const deps = dependencies();
    const handler = createRequirementExtractionHandler({
      ...deps,
      config,
      environmentEnabled: () => true,
      provider: (budget) => ({
        async extract() {
          await budget.assertAvailable({
            workflowConfigHash: config.configHash,
            maxRunCostUsd: config.maxCostUsd,
          });
          await budget.recordUsage({
            workflowConfigHash: config.configHash,
            provider: 'anthropic',
            modelId: 'claude-sonnet-5',
            inputTokens: 10,
            outputTokens: 5,
          });
          return { schemaVersion: '1', claims: [], questions: [] };
        },
      }),
    });
    await expect(handler.run(claim)).rejects.toThrow('AI_WORKFLOW_CONFIG_MISMATCH');
    expect(deps.ai.recordFailure).toHaveBeenCalledOnce();
  });

  it('derives stable UUIDv7 identifiers from the retry-stable job ID', () => {
    const first = requirementExtractionTestInternals.deterministicUuidV7(claim.id, 'citation:0:0');
    const second = requirementExtractionTestInternals.deterministicUuidV7(claim.id, 'citation:0:0');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/u);
    expect(() =>
      requirementExtractionTestInternals.deterministicUuidV7('invalid', 'scope'),
    ).toThrow('DOCUMENT_JOB_ID_INVALID');
  });
});
