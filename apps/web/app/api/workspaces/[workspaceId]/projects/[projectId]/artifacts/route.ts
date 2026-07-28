import { CreateArtifact } from '@delivery-os/application';
import { createArtifactCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { artifactEnvelope, serverId } from '@/lib/artifact-api';
import { artifactStore } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId } = await context.params;
    return NextResponse.json({
      schemaVersion: '1',
      artifacts: await artifactStore.listArtifacts(
        authContext.session.user.id,
        workspaceId,
        projectId,
      ),
      correlationId,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId } = await context.params;
    const command = createArtifactCommandSchema.parse({
      ...artifactEnvelope({
        body: await request.json(),
        workspaceId,
        projectId,
        actorId: authContext.session.user.id,
        correlationId,
        idempotencyHeader: request.headers.get('idempotency-key'),
      }),
      draftRevisionId: serverId(),
      audienceRecordId: serverId(),
    });
    return NextResponse.json(await new CreateArtifact(artifactStore).execute(command), {
      status: 201,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
