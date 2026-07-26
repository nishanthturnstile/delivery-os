import {
  createDeliveryAuth,
  createResendEmailSender,
  createSmtpEmailSender,
  type AuthEmailSender,
} from '@delivery-os/auth/server';
import {
  authAccounts,
  authRateLimits,
  authSessions,
  authTwoFactors,
  authUsers,
  authVerifications,
  createDatabasePool,
  PostgresArtifactStore,
  PostgresIdentityStore,
  PostgresProjectStore,
} from '@delivery-os/database';
import { ArtifactKindRegistry } from '@delivery-os/domain';
import { localRuntimeDefaults, parseRuntimeConfig } from '@delivery-os/observability';

import { resolveAuthConfiguration } from './auth-configuration';

const runtime = parseRuntimeConfig({ ...localRuntimeDefaults, ...process.env });
const authConfiguration = resolveAuthConfiguration(runtime.APP_ENV, process.env);
export const authBaseUrl = authConfiguration.baseUrl;

function createEmailSender(): AuthEmailSender {
  if (authConfiguration.email.provider === 'resend') {
    return createResendEmailSender(authConfiguration.email.apiKey, authConfiguration.email.from);
  }
  return createSmtpEmailSender(authConfiguration.email.smtpUrl, authConfiguration.email.from);
}

export const authPool = createDatabasePool(runtime.DATABASE_URL);
export const identityStore = new PostgresIdentityStore(authPool);
export const projectStore = new PostgresProjectStore(authPool);
export const artifactStore = new PostgresArtifactStore(authPool, new ArtifactKindRegistry());
export const authEmailSender = createEmailSender();
export const auth = createDeliveryAuth(
  authPool,
  {
    user: authUsers,
    session: authSessions,
    account: authAccounts,
    verification: authVerifications,
    twoFactor: authTwoFactors,
    rateLimit: authRateLimits,
  },
  {
    appEnvironment: runtime.APP_ENV,
    baseUrl: authBaseUrl,
    secret: authConfiguration.secret,
    trustedOrigins: [authBaseUrl],
    ipAddressHeaders: authConfiguration.ipAddressHeaders,
    emailSender: authEmailSender,
  },
);
