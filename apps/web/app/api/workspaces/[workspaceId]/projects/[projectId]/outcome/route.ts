import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { projectStore } from '@/lib/auth';

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
      outcome: await projectStore.getProjectOutcome(
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
