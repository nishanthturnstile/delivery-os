import { CancelArtifactExport, RequestArtifactExport } from '@delivery-os/application';
import {
  cancelArtifactExportCommandSchema,
  requestArtifactExportCommandSchema,
} from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

import { apiError, requireUser } from '@/lib/api';
import { artifactEnvelope, serverId } from '@/lib/artifact-api';
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
    const exportId = z.uuidv7().parse(request.nextUrl.searchParams.get('exportId'));
    return NextResponse.json({
      schemaVersion: '1',
      export: await artifactStore.getExportStatus(
        authContext.session.user.id,
        workspaceId,
        projectId,
        artifactId,
        exportId,
      ),
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
    const { workspaceId, projectId, artifactId } = await context.params;
    const command = requestArtifactExportCommandSchema.parse({
      ...artifactEnvelope({
        body: await request.json(),
        workspaceId,
        projectId,
        artifactId,
        actorId: authContext.session.user.id,
        correlationId,
        idempotencyHeader: request.headers.get('idempotency-key'),
      }),
      exportId: serverId(),
    });
    return NextResponse.json(await new RequestArtifactExport(artifactStore).execute(command), {
      status: 202,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const { workspaceId, projectId, artifactId } = await context.params;
    const command = cancelArtifactExportCommandSchema.parse(
      artifactEnvelope({
        body: await request.json(),
        workspaceId,
        projectId,
        artifactId,
        actorId: authContext.session.user.id,
        correlationId,
        idempotencyHeader: request.headers.get('idempotency-key'),
      }),
    );
    return NextResponse.json(await new CancelArtifactExport(artifactStore).execute(command));
  } catch (error) {
    return apiError(error, correlationId);
  }
}
