import { createHash } from 'node:crypto';

import {
  AcceptProjectInvitation,
  AcceptWorkspaceInvitation,
  ApplicationError,
} from '@delivery-os/application';
import {
  acceptInvitationCommandSchema,
  acceptProjectInvitationCommandSchema,
} from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore, projectStore } from '@/lib/auth';
import { bodyRecord } from '@/lib/project-api';

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
    const body = bodyRecord(await request.json());
    const workspaceId = body.workspaceId;
    const projectId = body.projectId;
    const projectToken = typeof body.projectToken === 'string' ? body.projectToken : '';
    const projectCommand = acceptProjectInvitationCommandSchema.parse({
      schemaVersion: '1',
      workspaceId,
      projectId,
      expectedRevision: body.projectExpectedRevision ?? 1,
      idempotencyKey: uuidv7(),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: null,
      overrideReason: null,
      command: {
        invitationId: body.projectInvitationId,
        tokenDigest: createHash('sha256').update(projectToken).digest('hex'),
        verifiedEmail: authContext.session.user.email,
      },
    });
    const acceptProject = () => new AcceptProjectInvitation(projectStore).execute(projectCommand);
    try {
      return NextResponse.json(await acceptProject());
    } catch (error) {
      if (!(error instanceof ApplicationError) || error.code !== 'NOT_FOUND') throw error;
    }

    const workspaceToken = typeof body.workspaceToken === 'string' ? body.workspaceToken : '';
    const workspaceCommand = acceptInvitationCommandSchema.parse({
      schemaVersion: '1',
      invitationId: body.workspaceInvitationId,
      workspaceId,
      expectedRevision: body.workspaceExpectedRevision ?? 1,
      idempotencyKey: uuidv7(),
      correlationId,
      actorId: authContext.session.user.id,
      command: {
        invitationId: body.workspaceInvitationId,
        tokenDigest: createHash('sha256').update(workspaceToken).digest('hex'),
        verifiedEmail: authContext.session.user.email,
      },
    });
    await new AcceptWorkspaceInvitation(identityStore).execute(workspaceCommand);
    return NextResponse.json(await acceptProject());
  } catch (error) {
    return apiError(error, correlationId);
  }
}
