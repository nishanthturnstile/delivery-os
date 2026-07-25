import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('keeps the W0 platform transaction available behind the M1 identity surface', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your delivery context, kept in bounds.' }),
  ).toBeVisible();

  const response = await page.request.post('/api/platform/probe');
  expect(response.status()).toBe(201);
  const result = (await response.json()) as {
    revision: number;
    correlationId: string;
  };
  expect(result.revision).toBe(1);
  expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('preserves authentication decisions on a narrow viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByText('Domain-neutral invites')).toBeVisible();
});
