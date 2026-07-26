import { createHash } from 'node:crypto';

import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(100);

export const extractionInputSchema = z
  .object({
    schemaVersion: z.literal('1'),
    intakeSetId: id,
    templateHash: sha256,
    workflowConfigHash: sha256,
    blocks: z
      .array(
        z
          .object({
            id,
            sourceGenerationId: id,
            text: z.string().min(1).max(100_000),
            audience: z.enum(['TEAM_ONLY', 'CLIENT_VISIBLE']),
          })
          .strict(),
      )
      .max(20_000),
  })
  .strict();

export const extractionOutputSchema = z
  .object({
    schemaVersion: z.literal('1'),
    claims: z
      .array(
        z
          .object({
            fieldKey: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
            proposedValue: z.union([
              z.string().max(20_000),
              z.array(z.string().max(2_000)).max(500),
              z.array(z.record(z.string().max(80), z.string().max(2_000))).max(500),
            ]),
            blockIds: z.array(id).min(1).max(50),
          })
          .strict(),
      )
      .max(1_000),
    questions: z
      .array(
        z
          .object({
            fieldKey: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
            question: z.string().min(2).max(1_000),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export type ExtractionInput = z.infer<typeof extractionInputSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

export function validateExtraction(
  inputValue: unknown,
  outputValue: unknown,
): ExtractionOutput & { outputHash: string } {
  const input = extractionInputSchema.parse(inputValue);
  const output = extractionOutputSchema.parse(outputValue);
  const blocks = new Map(input.blocks.map((block) => [block.id, block]));
  for (const claim of output.claims) {
    const evidence = claim.blockIds.map((blockId) => blocks.get(blockId));
    if (evidence.some((block) => block === undefined)) throw new Error('AI_CITATION_INVALID');
    const audiences = evidence.flatMap((block) => (block === undefined ? [] : [block.audience]));
    if (audiences.includes('TEAM_ONLY') && audiences.includes('CLIENT_VISIBLE')) {
      // Mixed-audience claims are legal internally but must remain Team-only downstream.
      continue;
    }
  }
  return {
    ...output,
    outputHash: createHash('sha256').update(JSON.stringify(output)).digest('hex'),
  };
}

export interface RequirementExtractionProvider {
  extract(input: ExtractionInput): Promise<unknown>;
}

export class DeterministicFakeExtractionProvider implements RequirementExtractionProvider {
  constructor(private readonly fixture: (input: ExtractionInput) => unknown) {}
  extract(input: ExtractionInput): Promise<unknown> {
    return Promise.resolve(this.fixture(extractionInputSchema.parse(input)));
  }
}

export class RequirementExtractionWorkflow {
  constructor(
    private readonly provider: RequirementExtractionProvider,
    private readonly enabled: () => boolean,
  ) {}

  async run(input: ExtractionInput): Promise<ExtractionOutput & { outputHash: string }> {
    if (!this.enabled()) throw new Error('AI_WORKFLOW_DISABLED');
    return validateExtraction(input, await this.provider.extract(input));
  }
}
