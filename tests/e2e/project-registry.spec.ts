import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page, test, type TestInfo } from '@playwright/test';

const execFileAsync = promisify(execFile);

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

interface ResendEmailSummary {
  id: string;
  subject: string;
  to: string[];
}

interface ResendEmailList {
  data: ResendEmailSummary[];
}

interface ResendEmail {
  html: string | null;
  text: string | null;
}

interface WorkspaceList {
  workspaces: { id: string; name: string }[];
}

async function resendJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    process.env.RESEND_CLI_PATH ?? '/home/nishanth/.resend/bin/resend',
    ['--json', ...args],
    {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout) as T;
}

async function latestResendEmailLink(email: string, subject: string): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const summary = await resendJson<ResendEmailList>(['emails', 'list', '--limit', '100']);
        const message = summary.data.find(
          (item) => item.subject === subject && item.to.includes(email),
        );
        if (message === undefined) return '';
        const detail = await resendJson<ResendEmail>(['emails', 'get', message.id]);
        const body = detail.text ?? detail.html ?? '';
        link = /https?:\/\/[^\s<"]+/.exec(body)?.[0]?.replaceAll('&amp;', '&') ?? '';
        return link;
      },
      {
        timeout: 60_000,
        intervals: [1_000, 2_000, 3_000],
        message: `waiting for Resend ${subject}`,
      },
    )
    .not.toBe('');
  return link;
}

async function latestEmailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
): Promise<string> {
  if (process.env.RESEND_API_KEY !== undefined) {
    return latestResendEmailLink(email, subject);
  }
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
        const detail = await request.get(`http://127.0.0.1:58025/api/v1/message/${message.ID}`);
        const body = (await detail.json()) as MailpitMessage;
        link = /https?:\/\/[^\s]+/.exec(body.Text)?.[0] ?? '';
        return link;
      },
      { timeout: 15_000 },
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
  const bytes = [
    digest.at(offset),
    digest.at(offset + 1),
    digest.at(offset + 2),
    digest.at(offset + 3),
  ];
  if (bytes.some((value) => value === undefined)) throw new Error('TOTP_DIGEST_TRUNCATED');
  const [byte0 = 0, byte1 = 0, byte2 = 0, byte3 = 0] = bytes;
  const number = (((byte0 & 0x7f) << 24) | (byte1 << 16) | (byte2 << 8) | byte3) % 1_000_000;
  return number.toString().padStart(6, '0');
}

async function createVerifiedAccount(
  page: Page,
  request: APIRequestContext,
  input: { name: string; email: string; password: string },
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(input.name);
  await page.getByLabel('Email address').fill(input.email);
  await page.getByLabel('Password').fill(input.password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your inbox to verify your email/)).toBeVisible();
  await page.goto(await latestEmailLink(request, input.email, 'Verify your Delivery OS email'));
}

async function openSection(page: Page, name: string) {
  const openNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (await openNavigation.isVisible()) await openNavigation.click();
  await page.getByRole('button', { name, exact: true }).click();
}

async function expectAccessibleWithoutOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

async function captureAcceptance(page: Page, testInfo: TestInfo, step: string) {
  const auditRoot = process.env.M2_AUDIT_DIR;
  if (auditRoot === undefined) return;
  await expectAccessibleWithoutOverflow(page);
  await mkdir(auditRoot, { recursive: true });
  const project = testInfo.project.name === 'chromium' ? 'desktop' : 'mobile';
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(auditRoot, `${project}-${step}.png`),
  });
}

test('runs the complete client, project, readiness, and stakeholder flow', async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.slow();
  const suffix = `${testInfo.project.name.replaceAll(/[^a-z]/g, '')}-${Date.now()}`;
  const usesResend = process.env.RESEND_API_KEY !== undefined;
  const adminEmail = usesResend
    ? `delivered+m2-admin-${suffix}@resend.dev`
    : `m2-admin-${suffix}@company.example`;
  const stakeholderEmail = usesResend
    ? `delivered+m2-client-${suffix}@resend.dev`
    : `m2-client-${suffix}@personal.example`;
  const password = process.env.E2E_TEST_PASSWORD ?? ['E2E', 'only', 'password', '2026!'].join('-');
  const clientName = `Acme ${suffix}`;
  const internalName = `Internal launch ${suffix}`;
  const externalName = `Client delivery ${suffix}`;

  await createVerifiedAccount(page, request, {
    name: 'Alex Registry Admin',
    email: adminEmail,
    password,
  });
  await page.getByLabel('Workspace name').fill(`M2 Workspace ${suffix}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Identity with an explicit boundary.' }),
  ).toBeVisible();

  await openSection(page, 'Security & sessions');
  await page.getByPlaceholder('Current password').fill(password);
  await page.getByRole('button', { name: 'Start setup' }).click();
  const totpUri = await page.getByText(/^otpauth:\/\//).textContent();
  if (totpUri === null) throw new Error('TOTP_URI_MISSING');
  await page.getByLabel('Enrollment code').fill(currentTotp(totpUri));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('ENABLED')).toBeVisible();
  await captureAcceptance(page, testInfo, '01-admin-mfa-enabled');

  const secondWorkspaceName = `M2 Boundary ${suffix}`;
  const createSecondWorkspace = await page.request.post('/api/workspaces', {
    data: {
      command: {
        name: secondWorkspaceName,
        logoUrl: null,
        primaryColor: '#5146e5',
        timeZone: 'UTC',
        defaultWorkingHours: {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '17:00',
        },
      },
    },
  });
  expect(createSecondWorkspace.status()).toBe(201);
  const workspaceList = (await (await page.request.get('/api/workspaces')).json()) as WorkspaceList;
  const primaryWorkspace = workspaceList.workspaces.find((item) =>
    item.name.startsWith('M2 Workspace'),
  );
  const secondWorkspace = workspaceList.workspaces.find(
    (item) => item.name === secondWorkspaceName,
  );
  if (primaryWorkspace === undefined || secondWorkspace === undefined) {
    throw new Error('M2_WORKSPACE_IDS_MISSING');
  }
  expect((await page.request.post(`/api/workspaces/${primaryWorkspace.id}/switch`)).status()).toBe(
    200,
  );

  await openSection(page, 'Clients');
  await page.getByLabel('Client name').fill(clientName);
  await page.getByLabel('Industry').fill('Technology');
  await page.getByLabel('Primary contact', { exact: true }).fill('Morgan Client');
  await page.getByLabel('Primary contact email').fill(stakeholderEmail);
  await page.getByLabel('Notes').fill('Browser-validated M2 client.');
  await page.getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByText('Client created and added to the registry.')).toBeVisible();
  await expect(page.getByText(clientName, { exact: true })).toBeVisible();
  await page.getByLabel('Client name').fill(`Internal client ${suffix}`);
  await page.getByLabel('Primary contact', { exact: true }).fill('Taylor Internal');
  await page.getByLabel('Primary contact email').fill(`internal-${suffix}@company.example`);
  await page.getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByText(`Internal client ${suffix}`, { exact: true })).toBeVisible();
  await captureAcceptance(page, testInfo, '02-client-registry');

  const stakeholderContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:53000',
  });
  const stakeholderPage = await stakeholderContext.newPage();
  await createVerifiedAccount(stakeholderPage, request, {
    name: 'Jordan Stakeholder',
    email: stakeholderEmail,
    password,
  });
  await expect(
    stakeholderPage.getByRole('heading', { name: /Build your workspace boundary/ }),
  ).toBeVisible();

  await openSection(page, 'Projects');
  await page.getByLabel('Project name').fill(internalName);
  await page.locator('#project-manager').selectOption({ label: 'Alex Registry Admin' });
  await page.getByLabel('Short description').fill('Internal project browser validation.');
  await page.getByLabel('Target start').fill('2026-08-01');
  await page.getByLabel('Target end').fill('2026-09-30');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project created with its initial Outcome module.')).toBeVisible();
  await expect(page.getByRole('heading', { name: internalName })).toBeVisible();

  const profileForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Project profile' }),
  });
  await profileForm.getByLabel('Short description').fill('Updated internal project profile.');
  await profileForm.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Project profile updated.')).toBeVisible();

  const availabilityForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Member availability' }),
  });
  await availabilityForm
    .getByLabel('Project member')
    .selectOption({ label: 'Alex Registry Admin' });
  await availabilityForm.getByLabel('From').fill('2026-08-01');
  await availabilityForm.getByLabel('To').fill('2026-08-31');
  await availabilityForm.getByLabel('Allocation percent').fill('80');
  await availabilityForm.getByRole('button', { name: 'Save availability' }).click();
  await expect(
    page.getByText('Member availability saved; capacity recalculation was queued.'),
  ).toBeVisible();

  const exceptionForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Calendar exception' }),
  });
  await exceptionForm.getByLabel('Date').fill('2026-08-14');
  await exceptionForm.getByLabel('Reason').fill('Company shutdown');
  await exceptionForm.getByRole('button', { name: 'Save exception' }).click();
  await expect(
    page.getByText('Calendar exception saved; capacity recalculation was queued.'),
  ).toBeVisible();

  await page.getByLabel('Requested state').selectOption('INTAKE');
  await page.getByRole('button', { name: 'Evaluate and transition' }).click();
  await expect(page.getByText('Project moved to INTAKE.')).toBeVisible();
  await expect(page.getByText('DRAFT → INTAKE')).toBeVisible();
  await page.getByLabel('Requested state').selectOption('ON_HOLD');
  await page.locator('#lifecycle-reason').fill('Awaiting internal governance review');
  await page.getByLabel('Hold owner').selectOption({ label: 'Alex Registry Admin' });
  await page.getByLabel('Hold review date').fill('2026-08-20');
  await page.getByRole('button', { name: 'Evaluate and transition' }).click();
  await expect(page.getByText('Project moved to ON HOLD.')).toBeVisible();
  await page.getByLabel('Requested state').selectOption('INTAKE');
  await page.getByRole('button', { name: 'Evaluate and transition' }).click();
  await expect(page.getByText('Project moved to INTAKE.')).toBeVisible();
  await expectAccessibleWithoutOverflow(page);
  await captureAcceptance(page, testInfo, '03-internal-project-lifecycle');

  await page.getByLabel('Project type').selectOption('EXTERNAL');
  await page.locator('#project-name').fill(externalName);
  await page.locator('#project-manager').selectOption({ label: 'Alex Registry Admin' });
  await page.locator('#project-description').fill('External stakeholder browser validation.');
  await page.locator('#project-client').selectOption({ label: clientName });
  await page.getByLabel('Client stakeholder email').fill(stakeholderEmail);
  await page.locator('#project-start').fill('2026-08-01');
  await page.locator('#project-end').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: externalName })).toBeVisible();
  await page.getByLabel('Requested state').selectOption('INTAKE');
  await page.getByRole('button', { name: 'Evaluate and transition' }).click();
  await expect(page.getByText(/Activate at least one client stakeholder/)).toBeVisible();
  await captureAcceptance(page, testInfo, '04-external-readiness-denial');

  const projectInvitationLink = await latestEmailLink(
    request,
    stakeholderEmail,
    'Join a Delivery OS project',
  );
  await stakeholderPage.goto(projectInvitationLink);
  await expect(stakeholderPage.getByRole('heading', { name: 'You’re in.' })).toBeVisible();
  await stakeholderPage.getByRole('button', { name: 'Open workspace' }).click();
  await expect(
    stakeholderPage.getByRole('heading', {
      name: 'Your project space is being prepared.',
    }),
  ).toBeVisible();
  const stakeholderNavigation = stakeholderPage.getByRole('button', {
    name: 'Open navigation',
  });
  if (await stakeholderNavigation.isVisible()) await stakeholderNavigation.click();
  await expect(stakeholderPage.getByRole('button', { name: 'Clients', exact: true })).toHaveCount(
    0,
  );
  await expect(stakeholderPage.getByRole('button', { name: 'Projects', exact: true })).toHaveCount(
    0,
  );
  const closeStakeholderNavigation = stakeholderPage.getByRole('button', {
    name: 'Close navigation',
  });
  if (await closeStakeholderNavigation.isVisible()) await closeStakeholderNavigation.click();
  await expectAccessibleWithoutOverflow(stakeholderPage);
  await captureAcceptance(stakeholderPage, testInfo, '05-client-stakeholder-holding-surface');

  await openSection(page, 'Overview');
  await openSection(page, 'Projects');
  await page.getByRole('button', { name: new RegExp(externalName) }).click();
  await expect(page.getByRole('heading', { name: externalName })).toBeVisible();
  await expect(page.getByText('CLIENT_STAKEHOLDER · ACTIVE')).toBeVisible();
  await page.getByLabel('Requested state').selectOption('INTAKE');
  await page.getByRole('button', { name: 'Evaluate and transition' }).click();
  await expect(page.getByText('Project moved to INTAKE.')).toBeVisible();

  await page.getByLabel('Search portfolio').fill(externalName);
  await page.locator('#portfolio-client').selectOption({ label: clientName });
  await page.getByLabel('Lifecycle').selectOption('INTAKE');
  await page.locator('#portfolio-pm').selectOption({
    label: 'Alex Registry Admin',
  });
  await page.getByLabel('Target from').fill('2026-08-01');
  await page.getByLabel('Target to').fill('2026-12-31');
  await expect(page.getByRole('button', { name: new RegExp(externalName) })).toBeVisible();

  const projectsResponse = await page.request.get(
    `/api/workspaces/${primaryWorkspace.id}/projects?search=${encodeURIComponent(externalName)}`,
  );
  expect(projectsResponse.status()).toBe(200);
  const projectsBody = (await projectsResponse.json()) as { items: { id: string }[] };
  const externalProjectId = projectsBody.items[0]?.id;
  if (externalProjectId === undefined) throw new Error('M2_EXTERNAL_PROJECT_ID_MISSING');
  expect(
    (
      await page.request.get(`/api/workspaces/${secondWorkspace.id}/projects/${externalProjectId}`)
    ).status(),
  ).toBe(404);
  await expectAccessibleWithoutOverflow(page);
  await captureAcceptance(page, testInfo, '06-portfolio-filter-and-tenant-boundary');

  await stakeholderContext.close();
});
