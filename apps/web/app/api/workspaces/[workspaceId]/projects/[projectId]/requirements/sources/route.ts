import { ApplicationError } from '@delivery-os/application';
import { createSourceUploadSessionCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { ingestionStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string }>;
}

function store(correlationId: string) {
  if (ingestionStore === null) {
    throw new ApplicationError({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Private source storage is not configured.',
      correlationId,
    });
  }
  return ingestionStore;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId } = await context.params;
    return NextResponse.json({
      schemaVersion: '1',
      sources: await store(correlationId).listSources(
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
    const body = bodyRecord(await request.json());
    const command = createSourceUploadSessionCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      actorId: authContext.session.user.id,
      expectedRevision: 0,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      sourceArtifactId: uuidv7(),
      sourceGenerationId: uuidv7(),
      uploadSessionId: uuidv7(),
      objectManifestId: uuidv7(),
    });
    return NextResponse.json(await store(correlationId).createUploadSession(command), {
      status: 201,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
