import { healthResponseSchema } from '@delivery-os/contracts';
import { checkDatabase, createDatabasePool } from '@delivery-os/database';
import {
  correlationIdFromHeader,
  localRuntimeDefaults,
  parseRuntimeConfig,
} from '@delivery-os/observability';
import Redis from 'ioredis';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const correlationId = correlationIdFromHeader(request.headers.get('x-correlation-id'));
  const dependencies: {
    name: string;
    status: 'up' | 'down';
    latencyMs?: number;
    message?: string;
  }[] = [];

  let config;
  try {
    config = parseRuntimeConfig({ ...localRuntimeDefaults, ...process.env });
  } catch {
    const response = healthResponseSchema.parse({
      schemaVersion: '1',
      status: 'degraded',
      service: 'web',
      version: process.env.APP_VERSION ?? 'development',
      timestamp: new Date().toISOString(),
      correlationId,
      dependencies: [
        { name: 'configuration', status: 'down', message: 'Invalid required configuration.' },
      ],
    });
    return NextResponse.json(response, { status: 503 });
  }

  const pool = createDatabasePool(config.DATABASE_URL);
  try {
    const latencyMs = await checkDatabase(pool);
    dependencies.push({ name: 'postgresql', status: 'up', latencyMs });
  } catch {
    dependencies.push({ name: 'postgresql', status: 'down', message: 'Database unavailable.' });
  } finally {
    await pool.end();
  }

  const redis = new Redis(config.REDIS_URL, {
    connectTimeout: 3_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  try {
    const startedAt = performance.now();
    await redis.connect();
    await redis.ping();
    dependencies.push({
      name: 'redis',
      status: 'up',
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  } catch {
    dependencies.push({ name: 'redis', status: 'down', message: 'Queue dependency unavailable.' });
  } finally {
    redis.disconnect();
  }

  const ready = dependencies.every((dependency) => dependency.status === 'up');
  const response = healthResponseSchema.parse({
    schemaVersion: '1',
    status: ready ? 'ok' : 'degraded',
    service: 'web',
    version: config.APP_VERSION,
    timestamp: new Date().toISOString(),
    correlationId,
    dependencies,
  });
  return NextResponse.json(response, {
    status: ready ? 200 : 503,
    headers: {
      'cache-control': 'no-store',
      'x-correlation-id': correlationId,
    },
  });
}
