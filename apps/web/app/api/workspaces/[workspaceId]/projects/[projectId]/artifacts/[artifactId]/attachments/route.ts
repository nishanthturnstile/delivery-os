import { RegisterArtifactAttachment } from '@delivery-os/application';
import { registerArtifactAttachmentCommandSchema } from '@delivery-os/contracts';
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
    const targetId = request.nextUrl.searchParams.get('targetId');
    if (targetId === null) throw new Error('targetId is required');
    return NextResponse.json({
      schemaVersion: '1',
      attachments: await artifactStore.listAttachments(
        authContext.session.user.id,
        workspaceId,
        projectId,
        artifactId,
        targetId,
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
    const { workspaceId, projectId, artifactId } = await context.params;
    const command = registerArtifactAttachmentCommandSchema.parse({
      ...artifactEnvelope({
        body: await request.json(),
        workspaceId,
        projectId,
        artifactId,
        actorId: authContext.session.user.id,
        correlationId,
        idempotencyHeader: request.headers.get('idempotency-key'),
      }),
      attachmentId: serverId(),
      audienceRecordId: serverId(),
    });
    return NextResponse.json(await new RegisterArtifactAttachment(artifactStore).execute(command), {
      status: 201,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
