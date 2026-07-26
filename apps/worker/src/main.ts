import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { outboxJobSchema, type OutboxJob } from '@delivery-os/contracts';
import {
  checkDatabase,
  createDatabasePool,
  PostgresArtifactStore,
  PostgresDocumentJobRepository,
  PostgresIngestionStore,
  PostgresOcrPageResultStore,
  PostgresOutboxRepository,
} from '@delivery-os/database';
import { ArtifactKindRegistry, createRequirementArtifactAdapter } from '@delivery-os/domain';
import { ClamAvScanner, PrivateOcrClient, S3CompatibleStorage } from '@delivery-os/ingestion';
import {
  createLogger,
  localRuntimeDefaults,
  parseRuntimeConfig,
  withSpan,
} from '@delivery-os/observability';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

import { waitForDependencies } from './startup-retry';
import { createArtifactExportStorage } from './artifact-export-storage';
import { createDocumentJobHandlers } from './ingestion/document-handlers';
import { processOneDocumentJob } from './ingestion/process-document-job';

const config = parseRuntimeConfig({ ...localRuntimeDefaults, ...process.env });
const logger = createLogger({
  service: 'worker',
  version: config.APP_VERSION,
  level: config.LOG_LEVEL,
});
const database = createDatabasePool(config.DATABASE_URL);
const outbox = new PostgresOutboxRepository(database);
const artifactRegistry = new ArtifactKindRegistry();
artifactRegistry.register(createRequirementArtifactAdapter({ externalProject: false }));
const artifactStore = new PostgresArtifactStore(database, artifactRegistry);
const documentJobs = new PostgresDocumentJobRepository(database);
const artifactExportStorage = createArtifactExportStorage();
const documentHandlers = createM3DocumentHandlers();

try {
  await waitForDependencies({
    check: async () => {
      await checkDatabase(database);
      const startupRedis = new Redis(config.REDIS_URL, {
        connectTimeout: 3_000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      startupRedis.on('error', () => undefined);
      try {
        await startupRedis.connect();
        await startupRedis.ping();
      } finally {
        startupRedis.disconnect();
      }
    },
    onRetry: (attempt, error, delayMs) => {
      logger.warn({ attempt, delayMs, err: error }, 'worker dependencies not ready');
    },
  });
} catch {
  logger.fatal({ code: 'DEPENDENCY_STARTUP_EXHAUSTED' }, 'worker startup failed safely');
  await database.end();
  throw new Error('WORKER_DEPENDENCIES_UNAVAILABLE');
}

const redis = new Redis(config.REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
});
redis.on('error', (error) => {
  logger.warn({ err: error }, 'worker Redis connection interrupted');
});
const queue = new Queue<OutboxJob>('outbox.dispatch', { connection: redis });

async function dispatchPending(): Promise<void> {
  const pending = await outbox.listPending();
  for (const event of pending) {
    try {
      await withSpan(
        'outbox.dispatch',
        {
          'messaging.message.id': event.id,
          'delivery_os.correlation_id': event.payload.correlationId,
        },
        async () => {
          await queue.add(event.payload.eventType, event.payload, {
            jobId: event.id,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
            removeOnFail: { age: 30 * 24 * 60 * 60, count: 50_000 },
          });
          await outbox.markDispatched(event.id);
        },
      );
      logger.info(
        { eventId: event.id, correlationId: event.payload.correlationId },
        'outbox event dispatched',
      );
    } catch {
      await outbox.markFailed(event.id, 'QUEUE_UNAVAILABLE');
      logger.warn(
        { eventId: event.id, correlationId: event.payload.correlationId },
        'outbox dispatch deferred',
      );
    }
  }
}

const consumer = new Worker<OutboxJob>(
  'outbox.dispatch',
  async (job) => {
    const event = outboxJobSchema.parse(job.data);
    if (
      event.eventType === 'artifact.export-requested.v1' &&
      event.payload.exportId !== undefined
    ) {
      const attempts = job.opts.attempts ?? 1;
      const rendered = await artifactStore.renderExport(
        event.payload.exportId,
        artifactExportStorage,
        job.attemptsMade + 1 >= attempts,
      );
      if (!rendered) throw new Error('ARTIFACT_EXPORT_RENDER_DEFERRED');
    }
    if (
      event.eventType === 'source.scan-requested.v1' &&
      event.sourceGenerationId !== undefined &&
      event.inputHash !== undefined
    ) {
      await documentJobs.enqueue({
        id: event.eventId,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        sourceArtifactId: event.sourceArtifactId,
        sourceGenerationId: event.sourceGenerationId,
        intakeSetId: null,
        jobType: 'SCAN',
        inputHash: event.inputHash,
        configVersion: 'scan@1',
        correlationId: event.correlationId,
      });
    }
    const accepted = await outbox.recordProcessed(event, 'delivery-os-outbox-v1');
    logger.info(
      {
        eventId: event.eventId,
        correlationId: event.correlationId,
        replayed: !accepted,
      },
      accepted ? 'outbox event processed' : 'duplicate outbox event ignored',
    );
  },
  {
    connection: redis,
    concurrency: 4,
    lockDuration: 30_000,
  },
);

consumer.on('failed', (job, error) => {
  logger.error(
    {
      err: error,
      jobId: job?.id,
      correlationId: job?.data.correlationId,
    },
    'outbox consumer failed safely',
  );
});

async function handleHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  if (request.url === '/health') {
    response.statusCode = 200;
    response.end(JSON.stringify({ status: 'ok', service: 'worker' }));
    return;
  }
  if (request.url === '/ready') {
    try {
      await checkDatabase(database);
      await redis.ping();
      response.statusCode = 200;
      response.end(JSON.stringify({ status: 'ok', service: 'worker' }));
    } catch {
      response.statusCode = 503;
      response.end(JSON.stringify({ status: 'degraded', service: 'worker' }));
    }
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ status: 'not_found' }));
}

function startHealthServer(): Server {
  const port = Number.parseInt(process.env.PORT ?? '8080', 10);
  const host = process.env.WORKER_HOST ?? '0.0.0.0';
  return createServer((request, response) => {
    void handleHealthRequest(request, response);
  }).listen(port, host);
}

const healthServer = startHealthServer();
const dispatchTimer = setInterval(() => {
  void dispatchPending().catch((error: unknown) => {
    logger.error({ err: error }, 'outbox scan failed');
  });
}, 1_000);
dispatchTimer.unref();
let documentDrainActive = false;
const documentTimer = setInterval(() => {
  if (documentDrainActive || documentHandlers.length === 0) return;
  documentDrainActive = true;
  void drainDocumentJobs()
    .catch((error: unknown) => {
      logger.error({ err: error }, 'document job scan failed safely');
    })
    .finally(() => {
      documentDrainActive = false;
    });
}, 500);
documentTimer.unref();
await dispatchPending();
logger.info(
  {
    host: process.env.WORKER_HOST ?? '0.0.0.0',
    port: process.env.PORT ?? '8080',
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker stopping');
  clearInterval(dispatchTimer);
  clearInterval(documentTimer);
  healthServer.close();
  await consumer.close();
  await queue.close();
  redis.disconnect();
  await database.end();
}

async function drainDocumentJobs(): Promise<void> {
  for (let processed = 0; processed < 10; processed += 1) {
    const found = await processOneDocumentJob({
      repository: documentJobs,
      handlers: documentHandlers,
      workerId: `${config.APP_VERSION}:document`,
    });
    if (!found) return;
  }
}

function createM3DocumentHandlers() {
  const required = [
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'CLAMAV_HOST',
    'OCR_INTERNAL_HOST',
    'OCR_SERVICE_TOKEN',
    'OCR_MODEL_DIGEST',
    'OCR_CONFIG_DIGEST',
  ] as const;
  if (required.some((name) => !process.env[name]?.trim())) {
    logger.warn({ code: 'M3_PROCESSORS_DISABLED' }, 'M3 document processors are disabled');
    return [];
  }
  const value = (name: (typeof required)[number]): string => {
    const result = process.env[name];
    if (result === undefined || result.trim() === '')
      throw new Error('M3_PROCESSOR_CONFIG_MISSING');
    return result;
  };
  const storage = new S3CompatibleStorage({
    ...(process.env.S3_ENDPOINT === undefined ? {} : { endpoint: process.env.S3_ENDPOINT }),
    region: value('S3_REGION'),
    bucket: value('S3_BUCKET'),
    accessKeyId: value('S3_ACCESS_KEY_ID'),
    secretAccessKey: value('S3_SECRET_ACCESS_KEY'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
  const ingestion = new PostgresIngestionStore(database, storage);
  const scanner = new ClamAvScanner({
    host: value('CLAMAV_HOST'),
    port: 3310,
    timeoutMs: 30_000,
    maximumBytes: 52_428_800,
  });
  const ocr = new PrivateOcrClient(
    `http://${value('OCR_INTERNAL_HOST')}`,
    value('OCR_SERVICE_TOKEN'),
    35_000,
  );
  return createDocumentJobHandlers({
    store: ingestion,
    jobs: documentJobs,
    scanner,
    ocr,
    ocrResults: new PostgresOcrPageResultStore(database),
    ocrModelDigest: value('OCR_MODEL_DIGEST'),
    ocrConfigVersion: value('OCR_CONFIG_DIGEST'),
    ocrMinimumConfidence: 0.85,
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => {
      process.exit(0);
    });
  });
}
