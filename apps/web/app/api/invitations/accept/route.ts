import { createHash } from 'node:crypto';

import { AcceptWorkspaceInvitation, ApplicationError } from '@delivery-os/application';
import { acceptInvitationCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    if (!authContext.session.user.emailVerified) {
      throw new ApplicationError({
        code: 'FORBIDDEN',
        message: 'Verify your email before accepting an invitation.',
        correlationId,
      });
    }
    const body = (await request.json()) as {
      invitationId?: unknown;
      workspaceId?: unknown;
      token?: unknown;
      expectedRevision?: unknown;
    };
    const token = typeof body.token === 'string' ? body.token : '';
    const command = acceptInvitationCommandSchema.parse({
      schemaVersion: '1',
      invitationId: body.invitationId,
      workspaceId: body.workspaceId,
      expectedRevision: body.expectedRevision,
      idempotencyKey: uuidv7(),
      correlationId,
      actorId: authContext.session.user.id,
      command: {
        invitationId: body.invitationId,
        tokenDigest: createHash('sha256').update(token).digest('hex'),
        verifiedEmail: authContext.session.user.email,
      },
    });
    return NextResponse.json(await new AcceptWorkspaceInvitation(identityStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
