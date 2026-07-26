import { createHash, randomBytes } from 'node:crypto';

import { CreateProject } from '@delivery-os/application';
import { createProjectCommandSchema, projectListFiltersSchema } from '@delivery-os/contracts';
import { invitationExpiresAt } from '@delivery-os/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { authBaseUrl, authEmailSender, projectStore } from '@/lib/auth';
import { bodyRecord, commandRecord, idempotencyKey, mfaVerifiedAt } from '@/lib/project-api';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId } = await context.params;
    const filters = projectListFiltersSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const result = await projectStore.listProjects(
      authContext.session.user.id,
      workspaceId,
      filters,
    );
    return NextResponse.json({ schemaVersion: '1', ...result, correlationId });
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
    const body = bodyRecord(await request.json());
    const input = commandRecord(body);
    const external = input.type === 'EXTERNAL';
    const projectId = uuidv7();
    const projectInvitationId = external ? uuidv7() : null;
    const workspaceInvitationId = external ? uuidv7() : null;
    const projectToken = external ? randomBytes(32).toString('base64url') : null;
    const workspaceToken = external ? randomBytes(32).toString('base64url') : null;
    const expiresAt = external ? invitationExpiresAt().toISOString() : null;
    const command = createProjectCommandSchema.parse({
      ...body,
      schemaVersion: '1',
      projectId,
      outcomeModuleId: uuidv7(),
      projectInvitationId,
      workspaceInvitationId,
      workspaceId,
      expectedRevision: 0,
      idempotencyKey: idempotencyKey(request.headers.get('idempotency-key')),
      correlationId,
      actorId: authContext.session.user.id,
      mfaVerifiedAt: mfaVerifiedAt(authContext.session.session),
      command: {
        ...input,
        stakeholderTokenDigest:
          projectToken === null ? null : createHash('sha256').update(projectToken).digest('hex'),
        workspaceTokenDigest:
          workspaceToken === null
            ? null
            : createHash('sha256').update(workspaceToken).digest('hex'),
        stakeholderExpiresAt: expiresAt,
      },
    });
    const result = await new CreateProject(projectStore).execute(command);
    let deliveryState: 'NOT_REQUIRED' | 'SENT' | 'FAILED' = 'NOT_REQUIRED';
    if (
      external &&
      projectInvitationId !== null &&
      workspaceInvitationId !== null &&
      projectToken !== null &&
      workspaceToken !== null &&
      command.command.stakeholderEmail !== null
    ) {
      try {
        const acceptUrl = new URL('/invitations/accept', authBaseUrl);
        acceptUrl.searchParams.set('project', projectId);
        acceptUrl.searchParams.set('projectInvitation', projectInvitationId);
        acceptUrl.searchParams.set('projectToken', projectToken);
        acceptUrl.searchParams.set('workspace', workspaceId);
        acceptUrl.searchParams.set('workspaceInvitation', workspaceInvitationId);
        acceptUrl.searchParams.set('workspaceToken', workspaceToken);
        await authEmailSender({
          to: command.command.stakeholderEmail,
          subject: 'Join a Delivery OS project',
          text: `You were invited to a Delivery OS project.\n\nAccept within seven days:\n${acceptUrl.toString()}`,
        });
        deliveryState = 'SENT';
      } catch {
        deliveryState = 'FAILED';
        await projectStore.markProjectInvitationDeliveryFailed(
          workspaceId,
          projectInvitationId,
          'EMAIL_DELIVERY_FAILED',
        );
      }
    }
    return NextResponse.json({ ...result, deliveryState }, { status: 201 });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
