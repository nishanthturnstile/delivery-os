import {
  defineRailway,
  github,
  group,
  image,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from 'railway/iac';

export default defineRailway(() => {
  const db = postgres('Postgres');
  const cache = redis('Redis');

  const ocr = service('ocr', {
    source: github('nishanthturnstile/delivery-os', {
      branch: 'main',
      rootDirectory: 'services/ocr',
    }),
    build: { builder: 'DOCKERFILE' },
    healthcheckPath: '/health',
    healthcheckTimeout: 300,
    env: {
      APP_ENV: 'staging',
      OCR_MODEL_VERSION: 'PP-StructureV3@paddleocr-3.7.0',
      OCR_MODEL_DIGEST: '4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e',
      OCR_EVALUATION_MODE: 'false',
      OCR_RECOGNITION_ENABLED: 'false',
      OCR_PAGE_TIMEOUT_SECONDS: '30',
      OCR_SERVICE_TOKEN: preserve(),
      RAILWAY_DOCKERFILE_PATH: 'Dockerfile',
    },
    replicas: 1,
  });

  const clamav = service('clamav', {
    source: image(
      'clamav/clamav@sha256:7f5389ccaa2368c383fa80e167ccfe44348d71e685f926fce4755eed1757673a',
    ),
    volumeMounts: {
      '/var/lib/clamav': volume('clamav-signatures', {
        sizeMB: 4096,
        region: 'asia-southeast1-eqsg3a',
      }),
    },
    replicas: 1,
  });

  const web = service('web', {
    source: github('nishanthturnstile/delivery-os', {
      branch: 'main',
    }),
    build: { builder: 'DOCKERFILE' },
    healthcheckPath: '/api/health',
    healthcheckTimeout: 120,
    env: {
      APP_ENV: 'staging',
      AI_GLOBAL_ENABLED: 'false',
      AI_REQUIREMENT_EXTRACTION_ENABLED: 'false',
      AI_DEFAULT_PROVIDER: 'openai',
      AI_OPENAI_CONFIG_HASH: 'cbc9b7350a1f3baa7288c24920a758b342e701efd8f1cf25c497a90cbe294880',
      AI_ANTHROPIC_CONFIG_HASH: '8915a32f8901a3e854da10553884ca04da9148d5d7d1bf5ec0ead2cf57dfe83e',
      AUTH_EMAIL_FROM: 'noreply@discovery.thaarei.com',
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      EMAIL_PROVIDER: 'resend',
      HOSTNAME: '0.0.0.0',
      NEXT_PUBLIC_APP_VERSION: preserve(),
      RAILWAY_DOCKERFILE_PATH: 'Dockerfile.web',
      ARTIFACT_KERNEL_FIXTURE_ENABLED: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM: 'onboarding@discovery.thaarei.com',
      TELEMETRY_EXPORT_ENABLED: 'false',
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      S3_ENDPOINT: 'https://61bbf1f2f0c1b2e2836f25e43d247276.r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'delivery-os-staging-primary',
      S3_ACCESS_KEY_ID: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      S3_FORCE_PATH_STYLE: 'false',
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
      AI_GLOBAL_ENABLED: 'false',
      AI_REQUIREMENT_EXTRACTION_ENABLED: 'false',
      AI_MONTHLY_BUDGET_USD: '100',
      AI_PER_RUN_BUDGET_USD: '1',
      AI_BUDGET_ALERTS_USD: '50,80',
      AI_DEFAULT_PROVIDER: 'openai',
      AI_OPENAI_CONFIG_HASH: 'cbc9b7350a1f3baa7288c24920a758b342e701efd8f1cf25c497a90cbe294880',
      AI_ANTHROPIC_CONFIG_HASH: '8915a32f8901a3e854da10553884ca04da9148d5d7d1bf5ec0ead2cf57dfe83e',
      AI_PROVENANCE_RETENTION_DAYS: '30',
      AI_AGGREGATE_QUALITY_METRICS_ENABLED: 'true',
      OPENAI_API_KEY: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      AI_PROVENANCE_KEY: preserve(),
      CLAMAV_HOST: clamav.env.RAILWAY_PRIVATE_DOMAIN,
      OCR_INTERNAL_HOST: ocr.env.RAILWAY_PRIVATE_DOMAIN,
      OCR_SERVICE_TOKEN: ocr.env.OCR_SERVICE_TOKEN,
      OCR_MODEL_DIGEST: '4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e',
      OCR_CONFIG_DIGEST: '12dd9f9379bb158f4b2a14f101d5c69a411983852865e1d41733361fd692da79',
      S3_ENDPOINT: 'https://61bbf1f2f0c1b2e2836f25e43d247276.r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'delivery-os-staging-primary',
      S3_ACCESS_KEY_ID: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      S3_FORCE_PATH_STYLE: 'false',
      BACKUP_S3_ENDPOINT: 'https://61bbf1f2f0c1b2e2836f25e43d247276.r2.cloudflarestorage.com',
      BACKUP_S3_REGION: 'auto',
      BACKUP_S3_BUCKET: 'delivery-os-staging-backup',
      BACKUP_S3_ACCESS_KEY_ID: preserve(),
      BACKUP_S3_SECRET_ACCESS_KEY: preserve(),
      RAILWAY_DOCKERFILE_PATH: 'Dockerfile.worker',
      TELEMETRY_EXPORT_ENABLED: 'false',
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
    replicas: 1,
  });

  return project('delivery-os', {
    resources: [db, cache, group('Services', [web, worker, ocr, clamav])],
  });
});
