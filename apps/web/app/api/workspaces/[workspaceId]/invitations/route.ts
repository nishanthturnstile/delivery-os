import { createHash, randomBytes } from 'node:crypto';

import { IssueWorkspaceInvitation } from '@delivery-os/application';
import { issueInvitationCommandSchema } from '@delivery-os/contracts';
import { invitationExpiresAt } from '@delivery-os/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { authBaseUrl, authEmailSender, identityStore } from '@/lib/auth';

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
      invitations: await identityStore.listInvitations(authContext.session.user.id, workspaceId),
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
    const invitationId = uuidv7();
    const token = randomBytes(32).toString('base64url');
    const tokenDigest = createHash('sha256').update(token).digest('hex');
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
    const command = issueInvitationCommandSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      schemaVersion: '1',
      invitationId,
      workspaceId,
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt:
        session.mfaVerifiedAt instanceof Date
          ? session.mfaVerifiedAt.toISOString()
          : (session.mfaVerifiedAt ?? null),
      command: {
        ...bodyCommand,
        tokenDigest,
        expiresAt: invitationExpiresAt().toISOString(),
      },
    });
    const result = await new IssueWorkspaceInvitation(identityStore).execute(command);
    let deliveryState: 'SENT' | 'FAILED' = 'SENT';
    try {
      const acceptUrl = new URL('/invitations/accept', authBaseUrl);
      acceptUrl.searchParams.set('id', invitationId);
      acceptUrl.searchParams.set('workspace', workspaceId);
      acceptUrl.searchParams.set('token', token);
      await authEmailSender({
        to: command.command.email,
        subject: 'Join a Delivery OS workspace',
        text: `You were invited to a Delivery OS workspace.\n\nAccept within seven days:\n${acceptUrl.toString()}`,
      });
    } catch {
      deliveryState = 'FAILED';
    }
    return NextResponse.json({ ...result, deliveryState }, { status: 201 });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
