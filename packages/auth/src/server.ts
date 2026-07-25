import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { magicLink, twoFactor } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import nodemailer from 'nodemailer';
import type { Pool } from 'pg';
import { v7 as uuidv7 } from 'uuid';

export type AuthEmail = Readonly<{
  to: string;
  subject: string;
  text: string;
}>;

export type AuthEmailSender = (message: AuthEmail) => Promise<void>;

export type AuthConfiguration = Readonly<{
  appEnvironment: 'local' | 'test' | 'preview' | 'staging' | 'production';
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
  ipAddressHeaders: string[];
  emailSender: AuthEmailSender;
}>;

export function createSmtpEmailSender(smtpUrl: string, from: string): AuthEmailSender {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (message) => {
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  };
}

export function createResendEmailSender(apiKey: string, from: string): AuthEmailSender {
  return async (message) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error('AUTH_EMAIL_PROVIDER_REJECTED');
    }
  };
}

export function createDeliveryAuth(
  pool: Pool,
  schema: Record<string, unknown>,
  config: AuthConfiguration,
) {
  const database = drizzle({ client: pool, schema });
  const isLocalOrTest = config.appEnvironment === 'local' || config.appEnvironment === 'test';
  const generalRateLimit = isLocalOrTest ? 1_000 : 100;
  const interactiveRateLimit = isLocalOrTest ? 1_000 : 5;
  const sensitiveRateLimit = isLocalOrTest ? 1_000 : 3;
  const signUpRateLimit = isLocalOrTest ? 1_000 : 10;

  return betterAuth({
    appName: 'Delivery OS',
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema,
    }),
    advanced: {
      database: {
        generateId: () => uuidv7(),
      },
      cookiePrefix: 'delivery-os',
      ipAddress: {
        ipAddressHeaders: config.ipAddressHeaders,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.appEnvironment !== 'local' && config.appEnvironment !== 'test',
      },
      useSecureCookies: config.appEnvironment !== 'local' && config.appEnvironment !== 'test',
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await config.emailSender({
          to: user.email,
          subject: 'Reset your Delivery OS password',
          text: `Reset your password using this one-time link:\n\n${url}\n\nIf you did not request this, ignore this message.`,
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await config.emailSender({
          to: user.email,
          subject: 'Verify your Delivery OS email',
          text: `Verify your email using this one-time link:\n\n${url}\n\nIf you did not create this account, ignore this message.`,
        });
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: generalRateLimit,
      customRules: {
        '/sign-up/email': { window: 60, max: signUpRateLimit },
        '/sign-in/email': { window: 60, max: interactiveRateLimit },
        '/sign-in/magic-link': { window: 60, max: interactiveRateLimit },
        '/request-password-reset': { window: 60, max: sensitiveRateLimit },
        '/two-factor/*': { window: 10, max: sensitiveRateLimit },
      },
    },
    user: {
      additionalFields: {
        deactivatedAt: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
        notificationPreferences: {
          type: 'json',
          required: true,
          defaultValue: { email: true },
          input: false,
        },
      },
    },
    session: {
      cookieCache: {
        enabled: false,
      },
      additionalFields: {
        authenticationMethod: {
          type: 'string',
          required: true,
          defaultValue: 'password',
          input: false,
        },
        mfaVerifiedAt: {
          type: 'date',
          required: false,
          input: false,
        },
        activeWorkspaceId: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) =>
            Promise.resolve({
              data: {
                ...user,
                email: user.email.trim().toLowerCase(),
              },
            }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query<{ deactivated_at: Date | null }>(
              'select deactivated_at from auth_users where id = $1',
              [session.userId],
            );
            if (result.rows[0]?.deactivated_at !== null) {
              throw new APIError('UNAUTHORIZED', {
                message: 'The email or password is incorrect, or this account cannot sign in.',
              });
            }

            return true;
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 10 * 60,
        sendMagicLink: async ({ email, url }) => {
          await config.emailSender({
            to: email,
            subject: 'Your Delivery OS sign-in link',
            text: `Sign in using this one-time link:\n\n${url}\n\nIt expires in 10 minutes.`,
          });
        },
      }),
      twoFactor({
        issuer: 'Delivery OS',
        allowPasswordless: true,
        backupCodeOptions: {
          amount: 10,
          length: 10,
          storeBackupCodes: 'encrypted',
        },
        totpOptions: {
          digits: 6,
          period: 30,
        },
      }),
    ],
  });
}

export type DeliveryAuth = ReturnType<typeof createDeliveryAuth>;
