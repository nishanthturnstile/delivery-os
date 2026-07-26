import { createHash } from 'node:crypto';

import {
  RequirementExtractionWorkflow,
  type ExtractionInput,
  type LiveRequirementWorkflowConfig,
  type RequirementBudgetGate,
  type RequirementExtractionProvider,
} from '@delivery-os/ai';
import type { PostgresAiWorkflowStore, PostgresRequirementStore } from '@delivery-os/database';

import type { DocumentJobHandler } from '../ingestion/process-document-job';

type RequirementStore = Pick<
  PostgresRequirementStore,
  'appendClaim' | 'createCitation' | 'createGap' | 'loadExtractionContext'
>;

type AiStore = Pick<PostgresAiWorkflowStore, 'commitSuccess' | 'recordFailure' | 'reserveRun'>;

export function createRequirementExtractionHandler(input: {
  requirements: RequirementStore;
  ai: AiStore;
  config: LiveRequirementWorkflowConfig;
  provider: (budget: RequirementBudgetGate) => RequirementExtractionProvider;
  environmentEnabled: () => boolean;
}): DocumentJobHandler {
  return {
    jobType: 'EXTRACT',
    async run(claim) {
      if (!input.environmentEnabled()) throw new Error('AI_WORKFLOW_DISABLED');
      if (claim.intakeSetId === null) throw new Error('AI_INTAKE_SET_MISSING');
      const context = await input.requirements.loadExtractionContext(
        claim.workspaceId,
        claim.projectId,
        claim.intakeSetId,
      );
      const reservationId = deterministicUuidV7(claim.id, 'ai-reservation');
      await input.ai.reserveRun({
        reservationId,
        workspaceId: claim.workspaceId,
        projectId: claim.projectId,
        artifactId: context.artifactId,
        intakeSetId: claim.intakeSetId,
        provider: input.config.provider,
        modelId: input.config.modelId,
        workflowConfigHash: input.config.configHash,
      });
      const usage = new CapturingBudgetGate(input.config);
      const extractionInput: ExtractionInput = {
        schemaVersion: '1',
        intakeSetId: claim.intakeSetId,
        templateHash: context.templateHash,
        workflowConfigHash: input.config.configHash,
        blocks: context.blocks.map((block) => ({
          id: block.id,
          sourceGenerationId: block.sourceGenerationId,
          text: block.text,
          audience: block.audience,
        })),
      };
      let output;
      try {
        output = await new RequirementExtractionWorkflow(
          input.provider(usage),
          input.environmentEnabled,
        ).run(extractionInput);
      } catch (error) {
        await input.ai.recordFailure({
          workspaceId: claim.workspaceId,
          projectId: claim.projectId,
          reservationId,
        });
        throw error;
      }
      const blocks = new Map(context.blocks.map((block) => [block.id, block]));
      for (const [claimIndex, proposal] of output.claims.entries()) {
        const groups = new Map<
          string,
          {
            sourceGenerationId: string;
            locatorId: string;
            blockIds: string[];
            texts: string[];
            audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
          }
        >();
        for (const blockId of proposal.blockIds) {
          const block = blocks.get(blockId);
          if (block === undefined) throw new Error('AI_CITATION_INVALID');
          const key = `${block.sourceGenerationId}:${block.locatorId}`;
          const group = groups.get(key) ?? {
            sourceGenerationId: block.sourceGenerationId,
            locatorId: block.locatorId,
            blockIds: [],
            texts: [],
            audience: block.audience,
          };
          group.blockIds.push(block.id);
          group.texts.push(block.text);
          if (block.audience === 'TEAM_ONLY') group.audience = 'TEAM_ONLY';
          groups.set(key, group);
        }
        const citationIds: string[] = [];
        for (const [citationIndex, group] of [...groups.values()].entries()) {
          const citationId = deterministicUuidV7(
            claim.id,
            `citation:${claimIndex}:${citationIndex}`,
          );
          await input.requirements.createCitation({
            workspaceId: claim.workspaceId,
            projectId: claim.projectId,
            actorId: context.actorId,
            citationId,
            sourceGenerationId: group.sourceGenerationId,
            locatorId: group.locatorId,
            blockIds: group.blockIds,
            locatorExcerptHash: createHash('sha256').update(group.texts.join('\n')).digest('hex'),
            audience: group.audience,
            idempotencyKey: deterministicUuidV7(
              claim.id,
              `citation-command:${claimIndex}:${citationIndex}`,
            ),
            correlationId: claim.correlationId,
          });
          citationIds.push(citationId);
        }
        await input.requirements.appendClaim({
          id: deterministicUuidV7(claim.id, `claim:${claimIndex}`),
          workspaceId: claim.workspaceId,
          projectId: claim.projectId,
          artifactId: context.artifactId,
          intakeSetId: claim.intakeSetId,
          fieldKey: proposal.fieldKey,
          value: proposal.proposedValue,
          citationIds,
          workflowKind: 'LIVE_AI',
          workflowVersion: input.config.promptVersion,
          workflowConfigHash: input.config.configHash,
        });
      }
      for (const [questionIndex, question] of output.questions.entries()) {
        await input.requirements.createGap({
          id: deterministicUuidV7(claim.id, `question:${questionIndex}`),
          workspaceId: claim.workspaceId,
          projectId: claim.projectId,
          artifactId: context.artifactId,
          fieldKey: question.fieldKey,
          reason: 'MISSING',
          blocking: false,
        });
      }
      const audience = context.blocks.some((block) => block.audience === 'TEAM_ONLY')
        ? 'TEAM_ONLY'
        : 'CLIENT_VISIBLE';
      await input.ai.commitSuccess({
        generationId: deterministicUuidV7(claim.id, 'ai-generation'),
        reservationId,
        workspaceId: claim.workspaceId,
        projectId: claim.projectId,
        artifactId: context.artifactId,
        intakeSetId: claim.intakeSetId,
        provider: input.config.provider,
        modelId: input.config.modelId,
        promptVersion: input.config.promptVersion,
        schemaVersion: input.config.schemaVersion,
        workflowConfigHash: input.config.configHash,
        inputHash: createHash('sha256').update(JSON.stringify(extractionInput)).digest('hex'),
        outputHash: output.outputHash,
        audience,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        payload: { prompt: extractionInput, output },
      });
    },
  };
}

class CapturingBudgetGate implements RequirementBudgetGate {
  inputTokens = 0;
  outputTokens = 0;

  constructor(private readonly config: LiveRequirementWorkflowConfig) {}

  assertAvailable(input: { workflowConfigHash: string; maxRunCostUsd: number }): Promise<void> {
    if (
      input.workflowConfigHash !== this.config.configHash ||
      input.maxRunCostUsd !== this.config.maxCostUsd
    ) {
      throw new Error('AI_WORKFLOW_CONFIG_MISMATCH');
    }
    return Promise.resolve();
  }

  recordUsage(input: {
    workflowConfigHash: string;
    provider: 'openai' | 'anthropic';
    modelId: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    if (
      input.workflowConfigHash !== this.config.configHash ||
      input.provider !== this.config.provider ||
      input.modelId !== this.config.modelId
    ) {
      throw new Error('AI_WORKFLOW_CONFIG_MISMATCH');
    }
    this.inputTokens = input.inputTokens;
    this.outputTokens = input.outputTokens;
    return Promise.resolve();
  }
}

function deterministicUuidV7(baseUuid: string, scope: string): string {
  const base = Buffer.from(baseUuid.replaceAll('-', ''), 'hex');
  if (base.byteLength !== 16) throw new Error('DOCUMENT_JOB_ID_INVALID');
  const bytes = createHash('sha256').update(`${baseUuid}:${scope}`).digest().subarray(0, 16);
  base.copy(bytes, 0, 0, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export const requirementExtractionTestInternals = { deterministicUuidV7 };
