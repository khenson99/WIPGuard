/**
 * E2E Tests: Authentication Flow
 *
 * Critical user journeys:
 * - Login with valid credentials
 * - Login with invalid credentials shows error
 * - Session persistence across page reloads
 * - Logout redirects to login page
 * - Unauthenticated access redirects to login
 */
import { test, expect } from '@playwright/test';
import { AuthPage } from './helpers/pages';
import { TEST_USER } from './helpers/test-data';

test.describe('Authentication', () => {
  test.describe('Login', () => {
    // These tests need a fresh context without stored auth
    test.use({ storageState: { cookies: [], origins: [] } });

    test('should login successfully with valid credentials', async ({ page }) => {
      const authPage = new AuthPage(page);

      await authPage.login(TEST_USER.email, TEST_USER.password);

      // Should navigate away from login page
      await expect(page).not.toHaveURL(/\/login/i, { timeout: 15_000 });

      // Should show some indication of being logged in
      await expect(
        page.getByText(new RegExp(TEST_USER.name, 'i'))
          .or(page.locator('[data-testid="user-menu"]'))
          .or(page.locator('nav'))
      ).toBeVisible();
    });

    test('should show error with invalid credentials', async ({ page }) => {
      const authPage = new AuthPage(page);

      await authPage.login('invalid@test.com', 'wrongpassword');

      // Should remain on login page or show error
      const hasError = await authPage.errorMessage.isVisible().catch(() => false);
      const stillOnLogin = page.url().includes('/login');

      expect(hasError || stillOnLogin).toBe(true);
    });

    test('should redirect unauthenticated users to login', async ({ page }) => {
      // Try to access a protected route
      await page.goto('/board');

      // Should be redirected to login
      await expect(page).toHaveURL(/\/login/i, { timeout: 10_000 });
    });
  });

  test.describe('Session', () => {
    test('should persist session across page reload', async ({ page }) => {
      // Navigate to a protected page (uses stored auth from setup)
      await page.goto('/board');
      await expect(page).not.toHaveURL(/\/login/i);

      // Reload the page
      await page.reload();

      // Should still be authenticated (not redirected to login)
      await expect(page).not.toHaveURL(/\/login/i);
    });

    test('should persist session across navigation', async ({ page }) => {
      await page.goto('/board');
      await expect(page).not.toHaveURL(/\/login/i);

      // Navigate to another protected page
      await page.goto('/settings');
      await expect(page).not.toHaveURL(/\/login/i);
    });
  });

  test.describe('Logout', () => {
    test('should logout and redirect to login page', async ({ page }) => {
      const authPage = new AuthPage(page);

      // Start on a protected page
      await page.goto('/board');
      await expect(page).not.toHaveURL(/\/login/i);

      // Perform logout
      await authPage.logout();

      // Should be redirected to login page
      await expect(page).toHaveURL(/\/login/i, { timeout: 10_000 });
    });

    test('should not access protected pages after logout', async ({ page }) => {
      const authPage = new AuthPage(page);

      // Navigate and logout
      await page.goto('/board');
      await expect(page).not.toHaveURL(/\/login/i);
      await authPage.logout();
      await expect(page).toHaveURL(/\/login/i, { timeout: 10_000 });

      // Try to access protected page
      await page.goto('/board');

      // Should be redirected back to login
      await expect(page).toHaveURL(/\/login/i, { timeout: 10_000 });
    });
  });
});
