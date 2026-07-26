import { DeactivateProjectMember, SetProjectRoles } from '@delivery-os/application';
import {
  deactivateProjectMemberCommandSchema,
  setProjectRolesCommandSchema,
} from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { projectStore } from '@/lib/auth';
import { bodyRecord, commandRecord, idempotencyKey, mfaVerifiedAt } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string; userId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, userId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = setProjectRolesCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
      command: { ...commandRecord(body), targetUserId: userId },
    });
    return NextResponse.json(await new SetProjectRoles(projectStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, userId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = deactivateProjectMemberCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
      command: { ...commandRecord(body), targetUserId: userId },
    });
    return NextResponse.json(await new DeactivateProjectMember(projectStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
