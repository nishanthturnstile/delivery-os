import { resolveRequirementConflictCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { requirementStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    artifactId: string;
    conflictId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId, conflictId } = await context.params;
    const command = resolveRequirementConflictCommandSchema.parse({
      ...bodyRecord(await request.json()),
      schemaVersion: '1',
      workspaceId,
      projectId,
      artifactId,
      conflictId,
      actorId: authContext.session.user.id,
      resolutionId: uuidv7(),
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
    });
    const result = await requirementStore.resolveConflict({
      workspaceId,
      projectId,
      artifactId,
      actorId: command.actorId,
      conflictId,
      resolutionId: command.resolutionId,
      expectedArtifactRevision: command.expectedRevision,
      expectedConflictRevision: command.expectedConflictRevision,
      selectedClaimId: command.command.selectedClaimId,
      authoredValue: command.command.authoredValue,
      note: command.command.note,
      idempotencyKey: command.idempotencyKey,
      correlationId,
    });
    return NextResponse.json({ schemaVersion: '1', ...result, correlationId });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
