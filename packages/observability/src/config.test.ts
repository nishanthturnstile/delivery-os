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
});
