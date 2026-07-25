import { defineRailway, project, service, postgres, redis, github, group, preserve } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("Postgres");
  const cache = redis("Redis");

  const web = service("web", {
    source: github("nishanthturnstile/delivery-os", {
      branch: "main",
    }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.web" },
    healthcheckPath: "/api/health",
    healthcheckTimeout: 120,
    env: {
      APP_ENV: "staging",
      AUTH_EMAIL_FROM: "noreply@discovery.thaarei.com",
      BETTER_AUTH_URL: "https://web-production-57ecb9.up.railway.app",
      BETTER_AUTH_SECRET: preserve(),
      EMAIL_PROVIDER: "resend",
      HOSTNAME: "0.0.0.0",
      RESEND_API_KEY: preserve(),
      RESEND_FROM: "onboarding@discovery.thaarei.com",
      TELEMETRY_EXPORT_ENABLED: "false",
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
    replicas: 1,
  });

  const worker = service("worker", {
    source: github("nishanthturnstile/delivery-os", {
      branch: "main",
    }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.worker" },
    healthcheckPath: "/health",
    healthcheckTimeout: 120,
    env: {
      APP_ENV: "staging",
      TELEMETRY_EXPORT_ENABLED: "false",
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
    replicas: 1,
  });

  const ocr = service("ocr", {
    source: github("nishanthturnstile/delivery-os", {
      branch: "main",
      rootDirectory: "services/ocr",
    }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheckPath: "/health",
    healthcheckTimeout: 300,
    env: {
      OCR_MODEL_VERSION: "PP-StructureV3@paddleocr-3.7.0",
      OCR_RECOGNITION_ENABLED: "false",
      OCR_SERVICE_TOKEN: preserve(),
    },
    replicas: 1,
  });

  return project("delivery-os", {
    resources: [db, cache, group("Services", [web, worker, ocr])],
  });
});
