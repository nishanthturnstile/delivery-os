import { DecideArtifactApproval } from '@delivery-os/application';
import { decideArtifactApprovalCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { artifactEnvelope, serverId } from '@/lib/artifact-api';
import { artifactStore } from '@/lib/auth';

interface RouteContext {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    artifactId: string;
    requestId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId, requestId } = await context.params;
    const body: unknown = await request.json();
    const command = decideArtifactApprovalCommandSchema.parse({
      ...artifactEnvelope({
        body,
        workspaceId,
        projectId,
        artifactId,
        actorId: authContext.session.user.id,
        correlationId,
        idempotencyHeader: request.headers.get('idempotency-key'),
      }),
      requestId,
      decisionId: serverId(),
      baselineId: serverId(),
    });
    return NextResponse.json(await new DecideArtifactApproval(artifactStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
