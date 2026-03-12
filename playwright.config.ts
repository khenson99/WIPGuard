import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for The Mother Node E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
const e2eBaseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
const e2ePort = new URL(e2eBaseUrl).port || '3000';
const e2eServerEnv = {
  ...process.env,
  E2E_MODE: process.env.E2E_MODE || 'true',
  NEXT_PUBLIC_E2E_MODE: process.env.NEXT_PUBLIC_E2E_MODE || 'true',
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || e2eBaseUrl,
  PRISMA_TENANT_BYPASS: process.env.PRISMA_TENANT_BYPASS || 'true',
};

export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Limit parallel workers on CI */
  workers: process.env.CI ? 1 : 1,
  /* Reporter to use */
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: e2eBaseUrl,
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video recording on failure */
    video: 'on-first-retry',
    /* Default timeout for actions */
    actionTimeout: 10_000,
    /* Default navigation timeout */
    navigationTimeout: 15_000,
  },
  /* Global timeout per test */
  timeout: 30_000,
  /* Expect timeout */
  expect: {
    timeout: 5_000,
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'tests/e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
  ],
  /* Run your local dev server before starting the tests */
  webServer: {
    // On CI, run the production standalone server after staging static/public assets.
    // Dev-mode auth is enabled in CI via `E2E_MODE=true`.
    command: process.env.CI
      ? `PORT=${e2ePort} HOSTNAME=127.0.0.1 node scripts/start-e2e-standalone.mjs`
      : `npm run dev -- -H 127.0.0.1 -p ${e2ePort}`,
    env: e2eServerEnv,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  /* Output directory for test artifacts */
  outputDir: 'test-results/',
});
