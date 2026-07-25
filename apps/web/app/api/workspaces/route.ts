import { CreateWorkspace } from '@delivery-os/application';
import { createWorkspaceCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore } from '@/lib/auth';

export async function GET(request: NextRequest) {
  let correlationId = uuidv7();
  try {
    const context = await requireUser(request);
    correlationId = context.correlationId;
    return NextResponse.json({
      schemaVersion: '1',
      workspaces: await identityStore.listWorkspaces(context.session.user.id),
      correlationId,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}

export async function POST(request: NextRequest) {
  let correlationId = uuidv7();
  try {
    const context = await requireUser(request);
    correlationId = context.correlationId;
    const body: unknown = await request.json();
    const command = createWorkspaceCommandSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      schemaVersion: '1',
      workspaceId: uuidv7(),
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId,
      actorId: context.session.user.id,
    });
    const result = await new CreateWorkspace(identityStore).execute(command);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
