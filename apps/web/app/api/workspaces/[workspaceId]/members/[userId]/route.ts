import { ChangeWorkspaceMembership } from '@delivery-os/application';
import { changeMembershipCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, userId } = await context.params;
    const body: unknown = await request.json();
    const bodyCommand =
      typeof body === 'object' &&
      body !== null &&
      'command' in body &&
      typeof body.command === 'object' &&
      body.command !== null
        ? body.command
        : {};
    const session = authContext.session.session as typeof authContext.session.session & {
      mfaVerifiedAt?: Date | string | null;
    };
    const command = changeMembershipCommandSchema.parse({
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
      command: {
        ...bodyCommand,
        targetUserId: userId,
      },
    });
    return NextResponse.json(await new ChangeWorkspaceMembership(identityStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
