import { dispositionRequirementGapCommandSchema } from '@delivery-os/contracts';
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
    gapId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId, gapId } = await context.params;
    const command = dispositionRequirementGapCommandSchema.parse({
      ...bodyRecord(await request.json()),
      schemaVersion: '1',
      workspaceId,
      projectId,
      artifactId,
      gapId,
      actorId: authContext.session.user.id,
      dispositionId: uuidv7(),
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
    });
    const action = command.command;
    const result = await requirementStore.dispositionGap({
      workspaceId,
      projectId,
      artifactId,
      actorId: command.actorId,
      gapId,
      dispositionId: command.dispositionId,
      expectedArtifactRevision: command.expectedRevision,
      expectedGapRevision: command.expectedGapRevision,
      disposition: action.disposition,
      fieldRevisionId: action.disposition === 'RESOLVED' ? action.fieldRevisionId : null,
      justification:
        action.disposition === 'NOT_APPLICABLE'
          ? action.justification
          : action.disposition === 'ACCEPTED_RISK'
            ? action.rationale
            : null,
      riskOwnerId: action.disposition === 'ACCEPTED_RISK' ? action.ownerId : null,
      riskConsequence: action.disposition === 'ACCEPTED_RISK' ? action.consequence : null,
      riskReviewDate: action.disposition === 'ACCEPTED_RISK' ? action.reviewDate : null,
      idempotencyKey: command.idempotencyKey,
      correlationId,
    });
    return NextResponse.json({ schemaVersion: '1', ...result, correlationId });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
