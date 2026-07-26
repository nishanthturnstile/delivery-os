import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('preserves a stale editor and remains accessible at desktop and mobile sizes', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_BASE_URL !== undefined &&
      process.env.ARTIFACT_KERNEL_FIXTURE_ENABLED !== 'true',
    'The synthetic fixture requires the explicit staging validation flag.',
  );
  await page.route('**/artifacts/*/drafts', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: '1',
        error: {
          code: 'REVISION_CONFLICT',
          message: 'The artifact changed. Review the current revision and retry.',
          correlationId: '019d0000-0000-7000-8000-000000000099',
          currentRevision: 2,
        },
      }),
    });
  });
  await page.goto('/dev/artifact-kernel');
  await expect(page.getByRole('heading', { name: 'Synthetic requirement review' })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Structured artifact body' });
  await editor.fill('{"title":"My unsaved local change"}');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText('Revision conflict.')).toBeVisible();
  await expect(editor).toHaveValue('{"title":"My unsaved local change"}');
  await page.getByRole('button', { name: 'Copy my changes' }).focus();
  await expect(page.getByRole('button', { name: 'Copy my changes' })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('renders the frozen review and immutable decision pattern', async ({ page }) => {
  test.skip(
    process.env.PLAYWRIGHT_BASE_URL !== undefined &&
      process.env.ARTIFACT_KERNEL_FIXTURE_ENABLED !== 'true',
    'The synthetic fixture requires the explicit staging validation flag.',
  );
  await page.route('**/artifacts/*/reviews', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        revision: 2,
        state: 'IN_REVIEW',
        approvalRequestId: '019d0000-0000-7000-8000-000000000010',
      }),
    });
  });
  await page.route('**/reviews/*/decisions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ revision: 3, state: 'APPROVED' }),
    });
  });
  await page.goto('/dev/artifact-kernel');
  await page.getByRole('button', { name: 'Submit frozen review' }).click();
  await expect(page.getByText('Frozen review snapshot submitted.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Structured artifact body' })).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: /I reviewed the frozen snapshot and understand the decision is recorded immutably/,
    })
    .check();
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await expect(page.getByText('Decision recorded: approve.')).toBeVisible();
  await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Baseline diff' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('requires rationale for a binding rejection and creates a new resubmission', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_BASE_URL !== undefined &&
      process.env.ARTIFACT_KERNEL_FIXTURE_ENABLED !== 'true',
    'The synthetic fixture requires the explicit staging validation flag.',
  );
  let submission = 0;
  await page.route('**/artifacts/*/reviews', async (route) => {
    submission += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        revision: submission === 1 ? 2 : 4,
        state: 'IN_REVIEW',
        approvalRequestId:
          submission === 1
            ? '019d0000-0000-7000-8000-000000000010'
            : '019d0000-0000-7000-8000-000000000011',
      }),
    });
  });
  await page.route('**/reviews/*/decisions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ revision: 3, state: 'CHANGES_REQUESTED' }),
    });
  });
  await page.goto('/dev/artifact-kernel');
  await page.getByRole('button', { name: 'Submit frozen review' }).click();
  const clientSlot = page.getByText(/Client Stakeholder · binding external/).locator('..');
  await expect(clientSlot.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Decision comment' }).fill('Please revise the scope.');
  await page
    .getByRole('checkbox', {
      name: /I reviewed the frozen snapshot and understand the decision is recorded immutably/,
    })
    .check();
  await clientSlot.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Decision recorded: reject.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit frozen review' }).click();
  await expect(page.getByText('Frozen review snapshot submitted.')).toBeVisible();
  expect(submission).toBe(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
