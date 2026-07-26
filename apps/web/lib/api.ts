import { ApplicationError } from '@delivery-os/application';
import { errorEnvelopeSchema } from '@delivery-os/contracts';
import { correlationIdFromHeader } from '@delivery-os/observability';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';

import { auth } from './auth';

export async function requireUser(request: NextRequest) {
  const correlationId = correlationIdFromHeader(request.headers.get('x-correlation-id'));
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    throw new ApplicationError({
      code: 'UNAUTHENTICATED',
      message: 'Sign in to continue.',
      correlationId,
    });
  }
  return { session, correlationId };
}

export function apiError(error: unknown, fallbackCorrelationId: string): NextResponse {
  const applicationError =
    error instanceof ApplicationError
      ? error
      : error instanceof ZodError
        ? new ApplicationError({
            code: 'VALIDATION_FAILED',
            message: 'Review the highlighted values and try again.',
            correlationId: fallbackCorrelationId,
            cause: error,
          })
        : new ApplicationError({
            code: 'INTERNAL_ERROR',
            message: 'The request could not be completed.',
            correlationId: fallbackCorrelationId,
            cause: error,
          });
  const status: Record<string, number> = {
    UNAUTHENTICATED: 401,
    MFA_REQUIRED: 403,
    FORBIDDEN: 404,
    NOT_FOUND: 404,
    REVISION_CONFLICT: 409,
    INVALID_TRANSITION: 409,
    APPROVAL_CLOSED: 409,
    JOB_NOT_CANCELLABLE: 409,
    READINESS_FAILED: 422,
    VALIDATION_FAILED: 400,
    IDEMPOTENCY_KEY_REUSED: 409,
    DEPENDENCY_UNAVAILABLE: 503,
  };
  return NextResponse.json(
    errorEnvelopeSchema.parse({
      schemaVersion: '1',
      error: {
        code: applicationError.code,
        message: applicationError.message,
        correlationId: applicationError.correlationId,
        ...(applicationError.currentRevision === undefined
          ? {}
          : { currentRevision: applicationError.currentRevision }),
        ...(applicationError.details === undefined ? {} : { details: applicationError.details }),
      },
    }),
    {
      status: status[applicationError.code] ?? 500,
      headers: { 'x-correlation-id': applicationError.correlationId },
    },
  );
}
