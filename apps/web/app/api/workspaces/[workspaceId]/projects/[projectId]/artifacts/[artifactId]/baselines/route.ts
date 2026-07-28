import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { artifactStore } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string; artifactId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId } = await context.params;
    return NextResponse.json({
      schemaVersion: '1',
      baselines: await artifactStore.listBaselines(
        authContext.session.user.id,
        workspaceId,
        projectId,
        artifactId,
      ),
      correlationId,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
