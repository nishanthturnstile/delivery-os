import { ChangeClientState } from '@delivery-os/application';
import { changeClientStateCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { projectStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey, mfaVerifiedAt } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string; clientId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, clientId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = changeClientStateCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      clientId,
      workspaceId,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
    });
    return NextResponse.json(await new ChangeClientState(projectStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
