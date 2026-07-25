import { SwitchWorkspace } from '@delivery-os/application';
import { switchWorkspaceCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId } = await context.params;
    await new SwitchWorkspace(identityStore).execute(
      switchWorkspaceCommandSchema.parse({
        schemaVersion: '1',
        actorId: authContext.session.user.id,
        workspaceId,
        correlationId,
      }),
    );
    return NextResponse.json({ schemaVersion: '1', workspaceId, correlationId });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
