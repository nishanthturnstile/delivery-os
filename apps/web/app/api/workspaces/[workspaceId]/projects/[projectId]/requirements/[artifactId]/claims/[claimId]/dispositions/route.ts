import { dispositionClaimCommandSchema } from '@delivery-os/contracts';
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
    claimId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId, claimId } = await context.params;
    const command = dispositionClaimCommandSchema.parse({
      ...bodyRecord(await request.json()),
      schemaVersion: '1',
      workspaceId,
      projectId,
      artifactId,
      claimId,
      actorId: authContext.session.user.id,
      dispositionId: uuidv7(),
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
    });
    const result = await requirementStore.dispositionClaim({
      workspaceId,
      projectId,
      artifactId,
      actorId: command.actorId,
      expectedRevision: command.expectedRevision,
      claimId,
      dispositionId: command.dispositionId,
      disposition: command.command.disposition,
      editedValue: command.command.disposition === 'EDITED' ? command.command.value : null,
      note: command.command.note,
      idempotencyKey: command.idempotencyKey,
      correlationId,
    });
    return NextResponse.json({ schemaVersion: '1', ...result, correlationId });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
