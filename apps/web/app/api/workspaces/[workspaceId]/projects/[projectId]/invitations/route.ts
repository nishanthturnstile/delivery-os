import { createHash, randomBytes } from 'node:crypto';

import { InviteProjectStakeholder } from '@delivery-os/application';
import { inviteProjectStakeholderCommandSchema } from '@delivery-os/contracts';
import { invitationExpiresAt } from '@delivery-os/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { authBaseUrl, authEmailSender, projectStore } from '@/lib/auth';
import { bodyRecord, commandRecord, idempotencyKey, mfaVerifiedAt } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId } = await context.params;
    const body = bodyRecord(await request.json());
    const input = commandRecord(body);
    const invitationId = uuidv7();
    const workspaceInvitationId = uuidv7();
    const projectToken = randomBytes(32).toString('base64url');
    const workspaceToken = randomBytes(32).toString('base64url');
    const expiresAt = invitationExpiresAt().toISOString();
    const command = inviteProjectStakeholderCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      workspaceId,
      projectId,
      invitationId,
      workspaceInvitationId,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
      command: {
        ...input,
        tokenDigest: createHash('sha256').update(projectToken).digest('hex'),
        workspaceTokenDigest: createHash('sha256').update(workspaceToken).digest('hex'),
        expiresAt,
      },
    });
    const result = await new InviteProjectStakeholder(projectStore).execute(command);
    let deliveryState: 'SENT' | 'FAILED' = 'SENT';
    try {
      const acceptUrl = new URL('/invitations/accept', authBaseUrl);
      acceptUrl.searchParams.set('project', projectId);
      acceptUrl.searchParams.set('projectInvitation', invitationId);
      acceptUrl.searchParams.set('projectToken', projectToken);
      acceptUrl.searchParams.set('workspace', workspaceId);
      acceptUrl.searchParams.set('workspaceInvitation', workspaceInvitationId);
      acceptUrl.searchParams.set('workspaceToken', workspaceToken);
      await authEmailSender({
        to: command.command.email,
        subject: 'Join a Delivery OS project',
        text: `You were invited to a Delivery OS project.\n\nAccept within seven days:\n${acceptUrl.toString()}`,
      });
    } catch {
      deliveryState = 'FAILED';
      await projectStore.markProjectInvitationDeliveryFailed(
        workspaceId,
        invitationId,
        'EMAIL_DELIVERY_FAILED',
      );
    }
    return NextResponse.json({ ...result, deliveryState }, { status: 201 });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
