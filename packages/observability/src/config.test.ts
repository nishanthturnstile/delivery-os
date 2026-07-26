import { describe, expect, it } from 'vitest';

import { localRuntimeDefaults, parseRuntimeConfig } from './config';

describe('runtime configuration', () => {
  it('defaults local integrations to no outbound telemetry', () => {
    const config = parseRuntimeConfig(localRuntimeDefaults);
    expect(config.TELEMETRY_EXPORT_ENABLED).toBe(false);
    expect(config.APP_ENV).toBe('local');
  });

  it('rejects local production dependencies and unconfigured telemetry export', () => {
    expect(() => parseRuntimeConfig({ ...localRuntimeDefaults, APP_ENV: 'production' })).toThrow(
      /Production cannot use local/,
    );
    expect(() =>
      parseRuntimeConfig({
        ...localRuntimeDefaults,
        TELEMETRY_EXPORT_ENABLED: 'true',
      }),
    ).toThrow(/validated destination/);
  });

  it('accepts remote production dependencies and either approved telemetry destination', () => {
    const production = {
      ...localRuntimeDefaults,
      APP_ENV: 'production',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://synthetic.invalid/delivery_os',
      REDIS_URL: 'redis://synthetic.invalid',
      TELEMETRY_EXPORT_ENABLED: 'true',
    } as const;
    expect(
      parseRuntimeConfig({ ...production, SENTRY_DSN: 'https://public@example.invalid/1' }),
    ).toMatchObject({ APP_ENV: 'production', TELEMETRY_EXPORT_ENABLED: true });
    expect(
      parseRuntimeConfig({
        ...production,
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.invalid',
      }),
    ).toMatchObject({ APP_ENV: 'production', TELEMETRY_EXPORT_ENABLED: true });
  });
});
