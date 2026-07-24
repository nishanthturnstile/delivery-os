import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const baseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'test', 'preview', 'staging', 'production']).default('local'),
  APP_VERSION: z.string().min(1).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  TELEMETRY_EXPORT_ENABLED: booleanFromString,
  SENTRY_DSN: z.url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
});

function isLocalDependencyUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

const productionConfigSchema = baseConfigSchema.superRefine((config, context) => {
  if (
    config.APP_ENV === 'production' &&
    (isLocalDependencyUrl(config.DATABASE_URL) || isLocalDependencyUrl(config.REDIS_URL))
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Production cannot use local dependency URLs.',
    });
  }
  if (
    config.TELEMETRY_EXPORT_ENABLED &&
    config.SENTRY_DSN === undefined &&
    config.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Telemetry export requires a validated destination.',
    });
  }
});

export type RuntimeConfig = z.infer<typeof productionConfigSchema>;

export function parseRuntimeConfig(
  source: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  return productionConfigSchema.parse(source);
}

export const localRuntimeDefaults = {
  APP_ENV: 'local',
  APP_VERSION: 'development',
  DATABASE_URL: 'postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os',
  REDIS_URL: 'redis://127.0.0.1:56379',
  TELEMETRY_EXPORT_ENABLED: 'false',
} as const;
