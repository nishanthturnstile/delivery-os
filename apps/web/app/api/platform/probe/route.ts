import { RecordPlatformProbe, ApplicationError } from '@delivery-os/application';
import { errorEnvelopeSchema, platformProbeCommandSchema } from '@delivery-os/contracts';
import { createDatabasePool, PostgresPlatformStore } from '@delivery-os/database';
import {
  correlationIdFromHeader,
  localRuntimeDefaults,
  parseRuntimeConfig,
} from '@delivery-os/observability';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFromHeader(request.headers.get('x-correlation-id'));
  const config = parseRuntimeConfig({ ...localRuntimeDefaults, ...process.env });
  if (config.APP_ENV === 'production') {
    return NextResponse.json(
      errorEnvelopeSchema.parse({
        schemaVersion: '1',
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          correlationId,
        },
      }),
      { status: 404 },
    );
  }

  const command = platformProbeCommandSchema.parse({
    schemaVersion: '1',
    aggregateId: uuidv7(),
    expectedRevision: 0,
    idempotencyKey: uuidv7(),
    correlationId,
    authorization: {
      userId: uuidv7(),
      workspaceId: uuidv7(),
      workspaceRole: 'ADMIN',
      projectRoles: [],
    },
    command: {
      delta: 1,
      reason: 'W0 browser foundation validation',
    },
  });
  const pool = createDatabasePool(config.DATABASE_URL);
  try {
    const handler = new RecordPlatformProbe(new PostgresPlatformStore(pool));
    const result = await handler.execute(command);
    return NextResponse.json(result, {
      status: 201,
      headers: { 'x-correlation-id': correlationId },
    });
  } catch (error) {
    const applicationError =
      error instanceof ApplicationError
        ? error
        : new ApplicationError({
            code: 'INTERNAL_ERROR',
            message: 'The platform command could not be completed.',
            correlationId,
            cause: error,
          });
    return NextResponse.json(
      errorEnvelopeSchema.parse({
        schemaVersion: '1',
        error: {
          code: applicationError.code,
          message: applicationError.message,
          correlationId,
          ...(applicationError.currentRevision === undefined
            ? {}
            : { currentRevision: applicationError.currentRevision }),
        },
      }),
      { status: applicationError.code === 'REVISION_CONFLICT' ? 409 : 500 },
    );
  } finally {
    await pool.end();
  }
}
