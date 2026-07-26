import { UpdateProjectCalendar } from '@delivery-os/application';
import { updateProjectCalendarCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { projectStore } from '@/lib/auth';
import { bodyRecord, idempotencyKey, mfaVerifiedAt } from '@/lib/project-api';

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
      ...(await projectStore.getProjectCalendar(
        authContext.session.user.id,
        workspaceId,
        projectId,
      )),
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
    const { workspaceId, projectId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = updateProjectCalendarCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
    });
    return NextResponse.json(await new UpdateProjectCalendar(projectStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
