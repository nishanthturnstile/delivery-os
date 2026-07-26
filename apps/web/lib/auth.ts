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
  PostgresIngestionStore,
  PostgresProjectStore,
  PostgresRequirementStore,
} from '@delivery-os/database';
import { ArtifactKindRegistry, createRequirementArtifactAdapter } from '@delivery-os/domain';
import { S3CompatibleStorage } from '@delivery-os/ingestion/storage';
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
const artifactRegistry = new ArtifactKindRegistry();
artifactRegistry.register(createRequirementArtifactAdapter({ externalProject: false }));
export const artifactStore = new PostgresArtifactStore(authPool, artifactRegistry);
export const requirementStore = new PostgresRequirementStore(authPool);
const sourceStorage =
  process.env.S3_REGION &&
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY
    ? new S3CompatibleStorage({
        ...(process.env.S3_ENDPOINT === undefined ? {} : { endpoint: process.env.S3_ENDPOINT }),
        region: process.env.S3_REGION,
        bucket: process.env.S3_BUCKET,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      })
    : null;
export const ingestionStore =
  sourceStorage === null ? null : new PostgresIngestionStore(authPool, sourceStorage);
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
