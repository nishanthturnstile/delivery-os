import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('validates the deployed unauthenticated identity and email-provider boundary', async ({
  page,
  request,
}, testInfo) => {
  const runId = process.env.DEPLOYED_TEST_RUN_ID ?? Date.now().toString();
  const project = testInfo.project.name.replaceAll(/[^a-z0-9]/gi, '-').toLowerCase();
  const email = `delivered+m1-${runId}-${project}@resend.dev`;
  const password = process.env.E2E_TEST_PASSWORD ?? ['E2E', 'only', 'password', '2026!'].join('-');

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const session = await request.get('/api/auth/get-session');
  expect(session.status()).toBe(200);
  expect(await session.json()).toBeNull();
  expect((await request.get('/api/workspaces')).status()).toBe(401);

  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('Railway Validation');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your inbox to verify your email/)).toBeVisible();

  await page.goto(
    '/invitations/accept?id=00000000-0000-7000-8000-000000000001&workspace=00000000-0000-7000-8000-000000000002&token=invalid',
  );
  await expect(page.getByText(/Sign in or create an account/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const auditRoot = process.env.DEPLOYED_AUDIT_DIR;
  if (auditRoot !== undefined) {
    await mkdir(auditRoot, { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: path.join(auditRoot, `${project}-invitation-sign-in.png`),
    });
  }
});
