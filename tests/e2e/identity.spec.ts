import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  test,
  type TestInfo,
} from '@playwright/test';

interface MailpitSummary {
  messages: {
    ID: string;
    Subject: string;
    To: { Address: string }[];
  }[];
}

interface MailpitMessage {
  Text: string;
}

async function latestEmailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const response = await request.get('http://127.0.0.1:58025/api/v1/messages');
        if (!response.ok()) return '';
        const summary = (await response.json()) as MailpitSummary;
        const message = summary.messages.find(
          (item) =>
            item.Subject === subject && item.To.some((recipient) => recipient.Address === email),
        );
        if (message === undefined) return '';
        const detailResponse = await request.get(
          `http://127.0.0.1:58025/api/v1/message/${message.ID}`,
        );
        const detail = (await detailResponse.json()) as MailpitMessage;
        link = /https?:\/\/[^\s]+/.exec(detail.Text)?.[0] ?? '';
        return link;
      },
      { timeout: 15_000, message: `waiting for ${subject} to ${email}` },
    )
    .not.toBe('');
  return link;
}

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('INVALID_BASE32');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (secret === null) throw new Error('TOTP_SECRET_MISSING');
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const lastByte = digest.at(-1);
  if (lastByte === undefined) throw new Error('TOTP_DIGEST_EMPTY');
  const offset = lastByte & 0x0f;
  const byte0 = digest.at(offset);
  const byte1 = digest.at(offset + 1);
  const byte2 = digest.at(offset + 2);
  const byte3 = digest.at(offset + 3);
  if (byte0 === undefined || byte1 === undefined || byte2 === undefined || byte3 === undefined) {
    throw new Error('TOTP_DIGEST_TRUNCATED');
  }
  const number = (((byte0 & 0x7f) << 24) | (byte1 << 16) | (byte2 << 8) | byte3) % 1_000_000;
  return number.toString().padStart(6, '0');
}

async function createVerifiedAccount(
  page: Page,
  request: APIRequestContext,
  input: {
    name: string;
    email: string;
    password: string;
    audit?: { testInfo: TestInfo; prefix: string };
  },
) {
  await page.getByRole('button', { name: 'Create account' }).click();
  if (input.audit !== undefined) {
    await captureAuditStep(page, input.audit.testInfo, `${input.audit.prefix}-create-account`);
  }
  await page.getByLabel('Display name').fill(input.name);
  await page.getByLabel('Email address').fill(input.email);
  await page.getByLabel('Password').fill(input.password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your inbox to verify your email/)).toBeVisible();
  if (input.audit !== undefined) {
    await captureAuditStep(page, input.audit.testInfo, `${input.audit.prefix}-verification-sent`);
  }
  const link = await latestEmailLink(request, input.email, 'Verify your Delivery OS email');
  await page.goto(link);
}

async function openSection(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true });
  const openNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (await openNavigation.isVisible()) {
    await openNavigation.click();
  }
  await target.click();
}

async function captureAuditStep(
  page: Page,
  testInfo: TestInfo,
  step: string,
  options: { mask?: Locator[] } = {},
) {
  const auditRoot = process.env.M1_AUDIT_DIR;
  if (auditRoot === undefined) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await mkdir(auditRoot, { recursive: true });
  const project = testInfo.project.name === 'chromium' ? 'desktop' : 'mobile';
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    mask: options.mask,
    path: path.join(auditRoot, `${project}-${step}.png`),
  });
}

test('completes verified onboarding, MFA, invite, and personal-email acceptance', async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.slow();
  const suffix = `${testInfo.project.name.replaceAll(/[^a-z]/g, '')}-${Date.now()}`;
  const adminEmail = `admin-${suffix}@company.example`;
  const clientEmail = `client-${suffix}@personal.example`;
  const password = process.env.E2E_TEST_PASSWORD ?? ['E2E', 'only', 'password', '2026!'].join('-');
  const updatedClientPassword = `${password}-updated`;

  await page.goto('/');
  await captureAuditStep(page, testInfo, '01-auth-sign-in');
  await createVerifiedAccount(page, request, {
    name: 'Alex Admin',
    email: adminEmail,
    password,
    audit: { testInfo, prefix: '02-admin' },
  });
  await expect(page.getByRole('heading', { name: /Build your workspace boundary/ })).toBeVisible();
  await captureAuditStep(page, testInfo, '03-explicit-workspace-onboarding');

  await page.getByLabel('Workspace name').fill(`Northstar ${suffix}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Identity with an explicit boundary.' }),
  ).toBeVisible();
  await captureAuditStep(page, testInfo, '04-admin-workspace-overview');

  await openSection(page, 'Workspace profile');
  await page.getByLabel('Company name').fill(`Northstar Studio ${suffix}`);
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Security & sessions' })).toBeVisible();
  await expect(page.getByText('Set up your authenticator first')).toBeVisible();
  await captureAuditStep(page, testInfo, '05-privileged-action-needs-mfa');

  await page.getByPlaceholder('Current password').fill(password);
  await page.getByRole('button', { name: 'Start setup' }).click();
  const totpUri = await page.getByText(/^otpauth:\/\//).textContent();
  if (totpUri === null) throw new Error('TOTP_URI_MISSING');
  await captureAuditStep(page, testInfo, '06-mfa-enrollment', {
    mask: [page.getByText('Add this account to your authenticator').locator('..')],
  });
  const firstRecoveryCode = await page
    .getByText('Save these one-time recovery codes now')
    .locator('..')
    .getByRole('listitem')
    .first()
    .textContent();
  if (firstRecoveryCode === null) throw new Error('RECOVERY_CODE_MISSING');
  await page.getByLabel('Enrollment code').fill(currentTotp(totpUri));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace profile' })).toBeVisible();

  await openSection(page, 'Workspace profile');
  await page.getByLabel('Company name').fill(`Northstar Studio ${suffix}`);
  await page.getByLabel('Logo URL').fill('https://assets.example.test/northstar.svg');
  await page.getByLabel('Time zone').fill('Asia/Singapore');
  await page.getByLabel('Workday starts').fill('08:30');
  await page.getByLabel('Workday ends').fill('17:30');
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByText('Workspace profile updated.')).toBeVisible();
  await captureAuditStep(page, testInfo, '07-workspace-profile-updated');

  await openSection(page, 'My profile');
  await page.getByLabel('Display name').fill('Alex Operator');
  await page.getByLabel('Avatar URL').fill('https://assets.example.test/alex.png');
  await page.getByLabel('Email notifications').uncheck();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(
    page.getByText('Your profile and notification preference were updated.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('Alex Operator', { exact: true })).toBeVisible();
  await openSection(page, 'My profile');
  await expect(page.getByLabel('Display name')).toHaveValue('Alex Operator');
  await expect(page.getByLabel('Avatar URL')).toHaveValue('https://assets.example.test/alex.png');
  await expect(page.getByLabel('Email notifications')).not.toBeChecked();
  await captureAuditStep(page, testInfo, '08-personal-profile-persisted');

  const secondWorkspaceName = `Waypoint ${suffix}`;
  const createSecondWorkspace = await page.request.post('/api/workspaces', {
    data: {
      command: {
        name: secondWorkspaceName,
        logoUrl: null,
        primaryColor: '#5146e5',
        timeZone: 'Europe/London',
        defaultWorkingHours: {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '17:00',
        },
      },
    },
  });
  expect(createSecondWorkspace.status()).toBe(201);
  await page.reload();
  const workspaceSwitcher = page.getByLabel('Active workspace');
  await expect(workspaceSwitcher.locator('option')).toHaveCount(2);
  await workspaceSwitcher.selectOption({ label: secondWorkspaceName });
  await expect(
    page.locator('header').getByText(secondWorkspaceName, { exact: true }),
  ).toBeVisible();
  await captureAuditStep(page, testInfo, '09-multi-workspace-switch');
  await workspaceSwitcher.selectOption({ label: `Northstar Studio ${suffix}` });
  await expect(
    page.locator('header').getByText(`Northstar Studio ${suffix}`, { exact: true }),
  ).toBeVisible();

  await openSection(page, 'Security & sessions');
  await expect(page.getByText('ENABLED')).toBeVisible();
  await captureAuditStep(page, testInfo, '10-security-with-mfa-enabled');

  await openSection(page, 'People & invites');
  await page.getByLabel('Verified email address').fill(clientEmail);
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(page.getByText(/Invitation sent/)).toBeVisible();
  await page.getByLabel('Verified email address').fill(clientEmail);
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(page.getByText('REVOKED', { exact: true })).toBeVisible();
  await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
  await captureAuditStep(page, testInfo, '11-invitation-reissued');
  const invitationLink = await latestEmailLink(
    request,
    clientEmail,
    'Join a Delivery OS workspace',
  );

  const signOut = page.getByRole('button', { name: 'Sign out' });
  const openNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (await openNavigation.isVisible()) {
    await openNavigation.click();
  }
  await signOut.click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.goto(invitationLink);
  await expect(page.getByText(/Sign in or create an account/)).toBeVisible();
  await captureAuditStep(page, testInfo, '12-invitation-requires-identity');
  await page.getByRole('button', { name: 'Go to sign in' }).click();
  await createVerifiedAccount(page, request, {
    name: 'Jordan Client',
    email: clientEmail,
    password,
    audit: { testInfo, prefix: '12-client' },
  });
  await page.goto(invitationLink);
  await expect(page.getByRole('heading', { name: 'You’re in.' })).toBeVisible();
  await captureAuditStep(page, testInfo, '13-invitation-accepted');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  const finalOpenNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (await finalOpenNavigation.isVisible()) {
    await finalOpenNavigation.click();
  }
  await expect(page.getByText('Workspace Member', { exact: true })).toBeVisible();

  await captureAuditStep(page, testInfo, '14-member-workspace-overview');

  await openSection(page, 'People & invites');
  await expect(page.getByRole('button', { name: 'Invite', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Make Admin' })).toHaveCount(0);
  await captureAuditStep(page, testInfo, '15-member-read-only-people');

  const secondaryContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:53000',
    userAgent: 'Delivery OS secondary browser session',
  });
  const secondaryPage = await secondaryContext.newPage();
  await secondaryPage.goto('/');
  await secondaryPage.getByLabel('Email address').fill(clientEmail);
  await secondaryPage.getByLabel('Password').fill(password);
  await secondaryPage.getByRole('button', { name: 'Welcome back' }).click();
  await expect(
    secondaryPage.getByRole('heading', { name: 'Identity with an explicit boundary.' }),
  ).toBeVisible();

  await openSection(page, 'Security & sessions');
  await page.getByRole('button', { name: 'Refresh' }).click();
  const secondarySession = page
    .getByRole('listitem')
    .filter({ hasText: 'Delivery OS secondary browser session' });
  await expect(secondarySession).toBeVisible();
  await captureAuditStep(page, testInfo, '16-session-management');
  await secondarySession.getByRole('button', { name: 'Revoke' }).click();
  await expect(secondarySession).toHaveCount(0);
  const revokedSessionResponse = await secondaryPage.request.get('/api/workspaces');
  expect(revokedSessionResponse.status()).toBe(401);
  await secondaryContext.close();

  await page.locator('#security-current-password').fill(password);
  await page.getByLabel('New password').fill(updatedClientPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(
    page.getByText(/Password updated and your other sessions were revoked/),
  ).toBeVisible();
  await captureAuditStep(page, testInfo, '17-password-updated');

  if (await finalOpenNavigation.isVisible()) {
    await finalOpenNavigation.click();
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Email me a magic link' }).click();
  await page.getByLabel('Email address').fill(adminEmail);
  await page.getByRole('button', { name: 'Use a magic link' }).click();
  await expect(page.getByText(/If the address can sign in/)).toBeVisible();
  await captureAuditStep(page, testInfo, '18-magic-link-sent');
  const adminMagicLink = await latestEmailLink(
    request,
    adminEmail,
    'Your Delivery OS sign-in link',
  );
  await page.goto(adminMagicLink);
  const signInChallenge = page.getByRole('heading', { name: 'Verify it’s you' });
  if (await signInChallenge.isVisible()) {
    await captureAuditStep(page, testInfo, '19-magic-link-mfa-challenge');
    await page.getByLabel('Authenticator code').fill(currentTotp(totpUri));
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(
    page.getByRole('heading', { name: 'Identity with an explicit boundary.' }),
  ).toBeVisible();

  await openSection(page, 'People & invites');
  const clientMembership = page.getByRole('listitem').filter({ hasText: clientEmail });
  await clientMembership.getByRole('button', { name: 'Make Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Security & sessions' })).toBeVisible();
  await captureAuditStep(page, testInfo, '20-privileged-step-up-required');
  await page.getByLabel('Authenticator code').fill(currentTotp(totpUri));
  await page.getByRole('button', { name: 'Verify' }).click();
  await openSection(page, 'People & invites');

  await clientMembership.getByRole('button', { name: 'Make Admin' }).click();
  await expect(clientMembership.getByText('ADMIN', { exact: true })).toBeVisible();
  await clientMembership.getByRole('button', { name: 'Make Member' }).click();
  await expect(clientMembership.getByText('MEMBER', { exact: true })).toBeVisible();

  const adminMembership = page.getByRole('listitem').filter({ hasText: adminEmail });
  await adminMembership.getByRole('button', { name: 'Make Member' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Assign another active Admin' }),
  ).toBeVisible();
  await captureAuditStep(page, testInfo, '21-role-management-last-admin-protection');

  await clientMembership.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText(/Membership deactivated and active sessions revoked/)).toBeVisible();
  await captureAuditStep(page, testInfo, '22-membership-deactivated');

  const finalAdminNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (await finalAdminNavigation.isVisible()) {
    await finalAdminNavigation.click();
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  const deniedEmail = page.getByLabel('Email address');
  await deniedEmail.fill(clientEmail);
  await page.getByLabel('Password').fill(updatedClientPassword);
  await page.getByRole('button', { name: 'Welcome back' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(deniedEmail).toHaveValue(clientEmail);
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
  await captureAuditStep(page, testInfo, '23-deactivated-user-denied');

  await page.getByLabel('Email address').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Welcome back' }).click();
  await expect(page.getByRole('heading', { name: 'Verify it’s you' })).toBeVisible();
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await captureAuditStep(page, testInfo, '24-recovery-code-challenge');
  await page.getByLabel('Recovery code').fill(firstRecoveryCode.trim());
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Identity with an explicit boundary.' }),
  ).toBeVisible();
});

test('keeps magic-link and password-reset entry points enumeration-safe', async ({
  page,
  request,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const magicEmail = `magic-${suffix}@example.net`;
  const resetEmail = `unknown-${suffix}@example.net`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Email me a magic link' }).click();
  await captureAuditStep(page, testInfo, '25-passwordless-entry');
  await page.getByLabel('Email address').fill(magicEmail);
  await page.getByRole('button', { name: 'Use a magic link' }).click();
  await expect(page.getByText(/If the address can sign in/)).toBeVisible();
  await captureAuditStep(page, testInfo, '26-enumeration-safe-magic-link');
  const magicLink = await latestEmailLink(request, magicEmail, 'Your Delivery OS sign-in link');
  await page.goto(magicLink);
  await expect(page.getByRole('heading', { name: /Build your workspace boundary/ })).toBeVisible();
  await captureAuditStep(page, testInfo, '27-passwordless-user-onboarding');

  await page.context().clearCookies();
  await page.goto('/');

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await captureAuditStep(page, testInfo, '28-password-reset-entry');
  await page.getByLabel('Email address').fill(resetEmail);
  await page.getByRole('button', { name: 'Reset your password' }).click();
  await expect(page.getByText(/If the account exists/)).toBeVisible();
  await captureAuditStep(page, testInfo, '29-enumeration-safe-password-reset');
});

test('completes the known-account password reset flow', async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const email = `reset-${suffix}@example.net`;
  const password = process.env.E2E_TEST_PASSWORD ?? ['E2E', 'only', 'password', '2026!'].join('-');
  const updatedPassword = `${password}-reset`;

  await page.goto('/');
  await createVerifiedAccount(page, request, {
    name: 'Riley Reset',
    email,
    password,
  });
  await expect(page.getByRole('heading', { name: /Build your workspace boundary/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Reset your password' }).click();
  await expect(page.getByText(/If the account exists/)).toBeVisible();
  const resetLink = await latestEmailLink(request, email, 'Reset your Delivery OS password');
  await page.goto(resetLink);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await captureAuditStep(page, testInfo, '30-valid-password-reset');
  await page.getByLabel('New password').fill(updatedPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();
  await captureAuditStep(page, testInfo, '31-password-reset-complete');

  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(updatedPassword);
  await page.getByRole('button', { name: 'Welcome back' }).click();
  await expect(page.getByRole('heading', { name: /Build your workspace boundary/ })).toBeVisible();
});
