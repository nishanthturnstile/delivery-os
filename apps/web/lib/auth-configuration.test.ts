import { describe, expect, it } from 'vitest';

import { resolveAuthConfiguration } from './auth-configuration';

describe('auth runtime configuration', () => {
  it('uses local-only defaults for the local environment', () => {
    expect(resolveAuthConfiguration('local', {})).toEqual({
      baseUrl: 'http://127.0.0.1:53000',
      secret: 'delivery-os-local-auth-secret-only-for-development',
      ipAddressHeaders: [],
      email: {
        provider: 'smtp',
        smtpUrl: 'smtp://127.0.0.1:51025',
        from: 'Delivery OS <delivery-os@localhost>',
      },
    });
  });

  it('fails closed when staging email is not configured for Resend', () => {
    expect(() =>
      resolveAuthConfiguration('staging', {
        BETTER_AUTH_URL: 'https://delivery.example',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
      }),
    ).toThrow('AUTH_EMAIL_PROVIDER_REJECTED');
  });

  it('requires a sufficiently long non-local Better Auth secret', () => {
    expect(() =>
      resolveAuthConfiguration('staging', {
        BETTER_AUTH_URL: 'https://delivery.example',
        BETTER_AUTH_SECRET: 'too-short',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test',
        RESEND_FROM: 'Delivery OS <delivery@example.com>',
      }),
    ).toThrow('BETTER_AUTH_SECRET_REQUIRED');
  });

  it.each([
    'http://delivery.example',
    'https://delivery.example/path',
    'https://*.delivery.example',
  ])('rejects a non-canonical staging origin: %s', (baseUrl) => {
    expect(() =>
      resolveAuthConfiguration('staging', {
        BETTER_AUTH_URL: baseUrl,
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test',
        RESEND_FROM: 'Delivery OS <delivery@example.com>',
      }),
    ).toThrow('BETTER_AUTH_URL_INVALID');
  });

  it('requires both Resend credentials and a verified sender', () => {
    const base = {
      BETTER_AUTH_URL: 'https://delivery.example',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      EMAIL_PROVIDER: 'resend',
    };
    expect(() => resolveAuthConfiguration('staging', base)).toThrow('RESEND_API_KEY_REQUIRED');
    expect(() =>
      resolveAuthConfiguration('staging', { ...base, RESEND_API_KEY: 're_test' }),
    ).toThrow('RESEND_FROM_REQUIRED');
  });

  it('accepts a complete staging configuration', () => {
    expect(
      resolveAuthConfiguration('staging', {
        BETTER_AUTH_URL: 'https://delivery.example',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test',
        RESEND_FROM: 'Delivery OS <delivery@example.com>',
      }),
    ).toEqual({
      baseUrl: 'https://delivery.example',
      secret: 'a'.repeat(32),
      ipAddressHeaders: ['x-real-ip'],
      email: {
        provider: 'resend',
        apiKey: 're_test',
        from: 'Delivery OS <delivery@example.com>',
      },
    });
  });
});
