import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

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
    const query = z
      .object({ before: z.uuidv7(), after: z.uuidv7() })
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({
      schemaVersion: '1',
      diff: await artifactStore.compareVersions(
        authContext.session.user.id,
        workspaceId,
        projectId,
        artifactId,
        query.before,
        query.after,
      ),
      correlationId,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
