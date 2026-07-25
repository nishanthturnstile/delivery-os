import { defineRailway, project, service, postgres, redis, github, group } from 'railway/iac';

export default defineRailway(() => {
  const db = postgres('Postgres');
  const cache = redis('Redis');

  const web = service('web', {
    source: github('nishanthturnstile/delivery-os', {
      branch: 'main',
    }),
    build: { builder: 'DOCKERFILE' },
    healthcheckPath: '/api/health',
    healthcheckTimeout: 120,
    env: {
      APP_ENV: 'staging',
      AUTH_EMAIL_FROM: 'noreply@discovery.thaarei.com',
      BETTER_AUTH_URL: 'https://web-production-a2352.up.railway.app',
      EMAIL_PROVIDER: 'resend',
      HOSTNAME: '0.0.0.0',
      RAILWAY_DOCKERFILE_PATH: 'Dockerfile.web',
      RESEND_FROM: 'onboarding@discovery.thaarei.com',
      TELEMETRY_EXPORT_ENABLED: 'false',
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
    replicas: 1,
  });

  const worker = service('worker', {
    source: github('nishanthturnstile/delivery-os', {
      branch: 'main',
    }),
    build: { builder: 'DOCKERFILE' },
    healthcheckPath: '/health',
    healthcheckTimeout: 120,
    env: {
      APP_ENV: 'staging',
      RAILWAY_DOCKERFILE_PATH: 'Dockerfile.worker',
      TELEMETRY_EXPORT_ENABLED: 'false',
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
    replicas: 1,
  });

  const ocr = service('ocr', {
    source: github('nishanthturnstile/delivery-os', {
      branch: 'main',
      rootDirectory: 'services/ocr',
    }),
    build: { builder: 'DOCKERFILE' },
    healthcheckPath: '/health',
    healthcheckTimeout: 300,
    env: {
      OCR_MODEL_VERSION: 'PP-StructureV3@paddleocr-3.7.0',
      OCR_RECOGNITION_ENABLED: 'false',
    },
    replicas: 1,
  });

  return project('delivery-os', {
    resources: [db, cache, group('Services', [web, worker, ocr])],
  });
});
