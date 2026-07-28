import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  test.skip(
    process.env.PLAYWRIGHT_BASE_URL !== undefined &&
      process.env.M3_SYNTHETIC_FIXTURE_ENABLED !== 'true',
    'The synthetic fixture requires the explicit staging validation flag.',
  );
  await page.route('**/artifacts/*/drafts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ revision: 2, state: 'DRAFT' }),
    });
  });
  await page.route('**/artifacts/*/reviews', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: '1',
        error: {
          code: 'READINESS_FAILED',
          message: 'Resolve the Requirement readiness blockers before review.',
          correlationId: '019d0000-0000-7000-8000-000000000399',
        },
      }),
    });
  });
});

test('supports keyboard manual editing, safe readiness failure, and accessible reflow', async ({
  page,
}) => {
  await page.goto('/dev/requirement-intake');
  await expect(page.getByRole('heading', { name: 'Synthetic requirement intake' })).toBeVisible();
  const problem = page.getByLabel(/Problem summary/);
  await problem.fill('Synthetic problem statement');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Requirement draft saved.');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('status')).toContainText('Review was not started');
  await page.getByRole('button', { name: 'Save draft' }).focus();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('uses a native constrained source input and reports quarantine failure truthfully', async ({
  page,
}) => {
  await page.route('**/requirements/sources', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: '1',
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Private source storage is not configured.',
          correlationId: '019d0000-0000-7000-8000-000000000398',
        },
      }),
    });
  });
  await page.goto('/dev/requirement-intake');
  const upload = page.getByLabel('Choose a source file');
  await upload.setInputFiles({
    name: 'synthetic-requirements.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic content only.'),
  });
  await expect(page.getByRole('status')).toContainText(
    'The quarantine upload session could not be created.',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
