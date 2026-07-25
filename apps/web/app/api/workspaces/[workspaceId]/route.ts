import { UpdateWorkspace } from '@delivery-os/application';
import { updateWorkspaceCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore } from '@/lib/auth';

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
      workspace: await identityStore.getWorkspace(authContext.session.user.id, workspaceId),
      memberships: await identityStore.listMemberships(authContext.session.user.id, workspaceId),
      correlationId,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId } = await context.params;
    const body: unknown = await request.json();
    const session = authContext.session.session as typeof authContext.session.session & {
      mfaVerifiedAt?: Date | string | null;
    };
    const command = updateWorkspaceCommandSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      schemaVersion: '1',
      workspaceId,
      idempotencyKey: uuidv7(),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt:
        session.mfaVerifiedAt instanceof Date
          ? session.mfaVerifiedAt.toISOString()
          : (session.mfaVerifiedAt ?? null),
    });
    return NextResponse.json(await new UpdateWorkspace(identityStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
