import { SetMemberAvailability } from '@delivery-os/application';
import { setMemberAvailabilityCommandSchema } from '@delivery-os/contracts';
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
      availability: await projectStore.listMemberAvailability(
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

export async function PUT(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId } = await context.params;
    const body = bodyRecord(await request.json());
    const command = setMemberAvailabilityCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      availabilityId: typeof body.availabilityId === 'string' ? body.availabilityId : uuidv7(),
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
    });
    return NextResponse.json(await new SetMemberAvailability(projectStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
