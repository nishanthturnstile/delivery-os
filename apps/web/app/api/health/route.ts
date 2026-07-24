import { healthResponseSchema } from '@delivery-os/contracts';
import { correlationIdFromHeader } from '@delivery-os/observability';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const correlationId = correlationIdFromHeader(request.headers.get('x-correlation-id'));
  const response = healthResponseSchema.parse({
    schemaVersion: '1',
    status: 'ok',
    service: 'web',
    version: process.env.APP_VERSION ?? 'development',
    timestamp: new Date().toISOString(),
    correlationId,
  });
  return NextResponse.json(response, {
    headers: {
      'cache-control': 'no-store',
      'x-correlation-id': correlationId,
    },
  });
}
