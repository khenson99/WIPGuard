/**
 * Authentication setup - runs before all other test suites.
 * Creates an authenticated storage state that other tests reuse.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { TEST_USER } from './helpers/test-data';
import { AuthPage } from './helpers/pages';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate as test user', async ({ page }) => {
  const authPage = new AuthPage(page);

  await authPage.login(TEST_USER.email, TEST_USER.password);

  // Wait for navigation away from login page, indicating successful auth
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 15_000 });

  // Verify we're on an authenticated page (dashboard, board, or home)
  // Use a non-strict marker to avoid strict-mode violations when multiple nav
  // regions are present (e.g. main + secondary navigation).
  await expect(page.locator('[data-testid="authenticated-layout"], nav').first()).toBeVisible({
    timeout: 10_000,
  });

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
});
