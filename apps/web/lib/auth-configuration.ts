type ApplicationEnvironment = 'local' | 'test' | 'preview' | 'staging' | 'production';

type AuthEnvironment = Readonly<Record<string, string | undefined>>;

type EmailConfiguration =
  | Readonly<{ provider: 'smtp'; smtpUrl: string; from: string }>
  | Readonly<{ provider: 'resend'; apiKey: string; from: string }>;

export type ResolvedAuthConfiguration = Readonly<{
  baseUrl: string;
  secret: string;
  ipAddressHeaders: string[];
  email: EmailConfiguration;
}>;

const localBaseUrl = 'http://127.0.0.1:53000';
const localSecret = 'delivery-os-local-auth-secret-only-for-development';

function requireCanonicalHttpsOrigin(value: string | undefined): string {
  if (value === undefined) throw new Error('BETTER_AUTH_URL_REQUIRED');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('BETTER_AUTH_URL_INVALID');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== value ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hostname.includes('*')
  ) {
    throw new Error('BETTER_AUTH_URL_INVALID');
  }
  return value;
}

export function resolveAuthConfiguration(
  appEnvironment: ApplicationEnvironment,
  environment: AuthEnvironment,
): ResolvedAuthConfiguration {
  const isLocalOrTest = appEnvironment === 'local' || appEnvironment === 'test';
  const ipAddressHeaders = isLocalOrTest ? [] : ['x-real-ip'];
  const baseUrl = isLocalOrTest
    ? (environment.BETTER_AUTH_URL ?? localBaseUrl)
    : requireCanonicalHttpsOrigin(environment.BETTER_AUTH_URL);
  const secret = environment.BETTER_AUTH_SECRET ?? localSecret;

  if (!isLocalOrTest && secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET_REQUIRED');
  }

  if (environment.EMAIL_PROVIDER === 'resend') {
    if (!environment.RESEND_API_KEY) throw new Error('RESEND_API_KEY_REQUIRED');
    if (!environment.RESEND_FROM) throw new Error('RESEND_FROM_REQUIRED');
    return {
      baseUrl,
      secret,
      ipAddressHeaders,
      email: {
        provider: 'resend',
        apiKey: environment.RESEND_API_KEY,
        from: environment.RESEND_FROM,
      },
    };
  }

  if (!isLocalOrTest || (environment.EMAIL_PROVIDER && environment.EMAIL_PROVIDER !== 'local')) {
    throw new Error('AUTH_EMAIL_PROVIDER_REJECTED');
  }

  return {
    baseUrl,
    secret,
    ipAddressHeaders,
    email: {
      provider: 'smtp',
      smtpUrl: environment.MAILPIT_SMTP_URL ?? 'smtp://127.0.0.1:51025',
      from: environment.AUTH_EMAIL_FROM ?? 'Delivery OS <delivery-os@localhost>',
    },
  };
}
