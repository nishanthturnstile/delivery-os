import { configureRequirementAiCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { aiWorkflowStore } from '@/lib/auth';
import { bodyRecord } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = configureRequirementAiCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      actorId: authContext.session.user.id,
    });
    const workflowConfigHash =
      command.command.provider === 'openai'
        ? process.env.AI_OPENAI_CONFIG_HASH
        : process.env.AI_ANTHROPIC_CONFIG_HASH;
    if (workflowConfigHash === undefined || !/^[a-f0-9]{64}$/.test(workflowConfigHash)) {
      throw new Error('AI_WORKFLOW_CONFIG_MISSING');
    }
    const result = await aiWorkflowStore.configureWorkspace({
      workspaceId,
      actorId: command.actorId,
      correlationId,
      expectedRevision: command.expectedRevision,
      provider: command.command.provider,
      workflowConfigHash,
      globalEnabled: command.command.globalEnabled,
      requirementExtractionEnabled: command.command.requirementExtractionEnabled,
      provenanceRetentionDays: command.command.provenanceRetentionDays,
      aggregateQualityMetricsEnabled: command.command.aggregateQualityMetricsEnabled,
    });
    return NextResponse.json({ schemaVersion: '1', ...result, correlationId });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
