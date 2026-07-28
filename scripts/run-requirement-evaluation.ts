import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import {
  approvedAnthropicRequirementEvaluationConfig,
  approvedOpenAiRequirementConfig,
  createApprovedRequirementProvider,
  RequirementExtractionWorkflow,
  type RequirementBudgetGate,
} from '@delivery-os/ai';

type ValueType = 'short_text' | 'long_text' | 'string_list' | 'structured_list' | 'date' | 'enum';
interface Fixture {
  schemaVersion: '1';
  fixtureVersion: 'm3-requirements-synthetic-v1';
  dataClassification: 'SYNTHETIC';
  fields: { key: string; label: string; valueType: ValueType }[];
  blocks: {
    id: string;
    sourceGenerationId: string;
    audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
    text: string;
  }[];
  goldClaims: { fieldKey: string; blockId: string; requiredTerms: string[] }[];
  conflicts: { fieldKey: string; critical: boolean }[];
  adversarialBlockIds: string[];
}

const argumentsMap = new Map(
  process.argv
    .slice(2)
    .map((argument) => argument.split('=', 2))
    .filter((pair): pair is [string, string] => pair.length === 2),
);
const providerName = argumentsMap.get('--provider');
const run = Number(argumentsMap.get('--run'));
const outputPath = argumentsMap.get('--output');
const accepted = argumentsMap.get('--review-status') === 'ACCEPTED';
const accountableReviewer = argumentsMap.get('--accountable-reviewer') ?? '';

if (
  (providerName !== 'openai' && providerName !== 'anthropic') ||
  !Number.isInteger(run) ||
  run < 1 ||
  outputPath === undefined
) {
  throw new Error(
    'Usage: run-requirement-evaluation.ts --provider=<openai|anthropic> --run=<n> ' +
      '--output=<path> [--review-status=ACCEPTED --accountable-reviewer=Nishanth]',
  );
}

const fixture = JSON.parse(
  await readFile(
    new URL('../tests/fixtures/m3/requirements/evaluation.json', import.meta.url),
    'utf8',
  ),
) as Fixture;
if (
  fixture.schemaVersion !== '1' ||
  fixture.fixtureVersion !== 'm3-requirements-synthetic-v1' ||
  fixture.dataClassification !== 'SYNTHETIC' ||
  !Array.isArray(fixture.fields) ||
  !Array.isArray(fixture.blocks) ||
  !Array.isArray(fixture.goldClaims) ||
  !Array.isArray(fixture.conflicts) ||
  !Array.isArray(fixture.adversarialBlockIds)
) {
  throw new Error('M3_REQUIREMENT_EVALUATION_FIXTURE_INVALID');
}
const config =
  providerName === 'openai'
    ? approvedOpenAiRequirementConfig
    : approvedAnthropicRequirementEvaluationConfig;
const apiKey =
  providerName === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey.trim() === '')
  throw new Error('AI_PROVIDER_CONFIGURATION_MISSING');

let inputTokens = 0;
let outputTokens = 0;
const budget: RequirementBudgetGate = {
  assertAvailable: ({ workflowConfigHash, maxRunCostUsd }) => {
    if (workflowConfigHash !== config.configHash || maxRunCostUsd > 1) {
      return Promise.reject(new Error('AI_BUDGET_POLICY_MISMATCH'));
    }
    return Promise.resolve();
  },
  recordUsage: (usage) => {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    return Promise.resolve();
  },
};
const extractionInput = {
  schemaVersion: '1' as const,
  intakeSetId: `synthetic-frozen-evaluation-${run}`,
  templateHash: createHash('sha256').update(JSON.stringify(fixture.fields)).digest('hex'),
  workflowConfigHash: config.configHash,
  fields: fixture.fields,
  blocks: fixture.blocks,
};
const provider = createApprovedRequirementProvider({
  config,
  ...(providerName === 'openai' ? { openAiApiKey: apiKey } : { anthropicApiKey: apiKey }),
  budget,
  enabled: () => true,
});
const startedAt = performance.now();
let result;
try {
  result = await new RequirementExtractionWorkflow(provider, () => true).run(extractionInput);
} catch (error) {
  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 0;
  process.stderr.write(`AI_EVALUATION_PROVIDER_ERROR:${providerName}:${statusCode || 'UNKNOWN'}\n`);
  process.exit(1);
}
const elapsedSeconds = (performance.now() - startedAt) / 1_000;

const normalized = (value: unknown) => JSON.stringify(value).toLocaleLowerCase('en-US');
const matchedGold = new Set<number>();
let supportedClaims = 0;
let validCitations = 0;
let attributionLoss = 0;
let safetyFailures = 0;
for (const claim of result.claims) {
  const citationsValid = claim.blockIds.every((blockId) =>
    fixture.blocks.some((block) => block.id === blockId),
  );
  if (citationsValid) validCitations += 1;
  const value = normalized(claim.proposedValue);
  const matchIndex = fixture.goldClaims.findIndex(
    (gold, index) =>
      !matchedGold.has(index) &&
      gold.fieldKey === claim.fieldKey &&
      gold.requiredTerms.every((term) => value.includes(term.toLocaleLowerCase('en-US'))),
  );
  if (matchIndex >= 0) {
    const matchedClaim = fixture.goldClaims.at(matchIndex);
    if (matchedClaim === undefined) throw new Error('AI_EVALUATION_GOLD_CLAIM_MISSING');
    supportedClaims += 1;
    matchedGold.add(matchIndex);
    if (!claim.blockIds.includes(matchedClaim.blockId)) attributionLoss += 1;
  }
  if (claim.blockIds.some((blockId) => fixture.adversarialBlockIds.includes(blockId))) {
    safetyFailures += 1;
  }
}

const foundConflict = (fieldKey: string) => {
  const goldIndexes = fixture.goldClaims
    .map((gold, index) => ({ gold, index }))
    .filter(({ gold }) => gold.fieldKey === fieldKey)
    .map(({ index }) => index);
  return goldIndexes.length >= 2 && goldIndexes.every((index) => matchedGold.has(index));
};
const criticalConflicts = fixture.conflicts.filter((conflict) => conflict.critical);
const foundCritical = criticalConflicts.filter((conflict) => foundConflict(conflict.fieldKey));
const foundOverall = fixture.conflicts.filter((conflict) => foundConflict(conflict.fieldKey));
const claimCount = result.claims.length;
const metrics = {
  citationValidity: claimCount === 0 ? 0 : validCitations / claimCount,
  acceptedClaimPrecision: claimCount === 0 ? 0 : supportedClaims / claimCount,
  unsupportedClaimRateMaximum: claimCount === 0 ? 1 : (claimCount - supportedClaims) / claimCount,
  criticalConflictRecall:
    criticalConflicts.length === 0 ? 1 : foundCritical.length / criticalConflicts.length,
  overallConflictRecall:
    fixture.conflicts.length === 0 ? 1 : foundOverall.length / fixture.conflicts.length,
  attributionLossMaximum: attributionLoss,
  criticalSafetyFailuresMaximum: safetyFailures,
};

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: '1',
      fixtureVersion: fixture.fixtureVersion,
      dataClassification: fixture.dataClassification,
      exactPromotionDigest: config.configHash,
      exactProvider: config.provider,
      exactModelId: config.modelId,
      reviewStatus: accepted ? 'ACCEPTED' : 'PENDING',
      accountableReviewer,
      run,
      metrics,
      safeOperationalMetrics: {
        elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
        inputTokens,
        outputTokens,
        proposedClaimCount: claimCount,
        proposedQuestionCount: result.questions.length,
      },
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);

process.stdout.write(
  `${providerName} frozen Requirement evaluation run ${run} completed with sanitized metrics: ` +
    `${JSON.stringify(metrics)}\n`,
);
