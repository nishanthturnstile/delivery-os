import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('runs the complete W0 browser probe accessibly', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Trust starts below the workflow.' }),
  ).toBeVisible();
  const runButton = page.getByRole('button', { name: 'Run platform check' });
  await runButton.focus();
  await expect(runButton).toBeFocused();
  await runButton.click();

  await expect(page.getByText('Dependencies and transaction path passed.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('foundation-flow.png'),
  });
});

test('preserves the primary decision flow on a narrow viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run platform check' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Foundation acceptance gates' })).toBeVisible();
});
