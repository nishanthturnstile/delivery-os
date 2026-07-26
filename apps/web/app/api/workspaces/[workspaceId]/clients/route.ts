import { CreateClient } from '@delivery-os/application';
import { createClientCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { projectStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey, mfaVerifiedAt } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId } = await context.params;
    return NextResponse.json({
      schemaVersion: '1',
      clients: await projectStore.listClients(authContext.session.user.id, workspaceId),
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
    const { workspaceId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = createClientCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      clientId: uuidv7(),
      workspaceId,
      expectedRevision: 0,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
    });
    return NextResponse.json(await new CreateClient(projectStore).execute(command), {
      status: 201,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
