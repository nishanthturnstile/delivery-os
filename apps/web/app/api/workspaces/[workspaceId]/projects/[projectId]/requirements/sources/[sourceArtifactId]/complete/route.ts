import { completeSourceUploadSessionCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { ingestionStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string; sourceArtifactId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    if (ingestionStore === null) throw new Error('SOURCE_STORAGE_UNAVAILABLE');
    const { workspaceId, projectId, sourceArtifactId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = completeSourceUploadSessionCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      sourceArtifactId,
      actorId: authContext.session.user.id,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
    });
    return NextResponse.json(await ingestionStore.completeUploadSession(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
