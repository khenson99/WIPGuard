import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for WIPGuard E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
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
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
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
    // Use `next dev` in CI so the dev-only credentials login is available and
    // NextAuth doesn't require production secrets.
    command: 'npm run dev -- -p 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  /* Output directory for test artifacts */
  outputDir: 'test-results/',
});
