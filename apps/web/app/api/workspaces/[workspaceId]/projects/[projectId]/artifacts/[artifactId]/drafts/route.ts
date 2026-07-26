import { SaveDraftRevision } from '@delivery-os/application';
import { saveDraftRevisionCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { artifactEnvelope, serverId } from '@/lib/artifact-api';
import { artifactStore } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string; artifactId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId } = await context.params;
    const actorId = authContext.session.user.id;
    return NextResponse.json({
      schemaVersion: '1',
      draft: await artifactStore.getDraft(actorId, workspaceId, projectId, artifactId),
      history: await artifactStore.listDraftHistory(actorId, workspaceId, projectId, artifactId),
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
    const { workspaceId, projectId, artifactId } = await context.params;
    const command = saveDraftRevisionCommandSchema.parse({
      ...artifactEnvelope({
        body: await request.json(),
        workspaceId,
        projectId,
        artifactId,
        actorId: authContext.session.user.id,
        correlationId,
        idempotencyHeader: request.headers.get('idempotency-key'),
      }),
      draftRevisionId: serverId(),
    });
    return NextResponse.json(await new SaveDraftRevision(artifactStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
