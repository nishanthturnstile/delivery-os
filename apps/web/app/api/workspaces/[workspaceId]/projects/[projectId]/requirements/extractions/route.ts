import { ApplicationError } from '@delivery-os/application';
import { startRequirementExtractionCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { requirementStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string }>;
}

function enabledConfigHash(correlationId: string): string {
  if (
    process.env.AI_GLOBAL_ENABLED !== 'true' ||
    process.env.AI_REQUIREMENT_EXTRACTION_ENABLED !== 'true'
  ) {
    throw new ApplicationError({
      code: 'AI_WORKFLOW_UNAVAILABLE',
      message: 'AI assistance is unavailable. Continue with the manual Requirement workflow.',
      correlationId,
    });
  }
  const hash =
    process.env.AI_DEFAULT_PROVIDER === 'anthropic'
      ? process.env.AI_ANTHROPIC_CONFIG_HASH
      : process.env.AI_OPENAI_CONFIG_HASH;
  if (hash === undefined || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new ApplicationError({
      code: 'AI_WORKFLOW_UNAVAILABLE',
      message: 'AI assistance is unavailable. Continue with the manual Requirement workflow.',
      correlationId,
    });
  }
  return hash;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = startRequirementExtractionCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      actorId: authContext.session.user.id,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      intakeSetId: uuidv7(),
      extractionJobId: uuidv7(),
    });
    const result = await requirementStore.createIntakeSet({
      id: command.intakeSetId,
      workspaceId,
      projectId,
      artifactId: command.artifactId,
      actorId: command.actorId,
      expectedRevision: command.expectedRevision,
      sourceGenerationIds: command.command.sourceGenerationIds,
      extractionJobId: command.extractionJobId,
      workflowConfigHash: enabledConfigHash(correlationId),
      idempotencyKey: command.idempotencyKey,
      correlationId,
    });
    return NextResponse.json(
      {
        schemaVersion: '1',
        intakeSetId: result.id,
        extractionJobId: command.extractionJobId,
        sourceManifestHash: result.sourceManifestHash,
        state: 'QUEUED',
        correlationId,
      },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, correlationId);
  }
}
