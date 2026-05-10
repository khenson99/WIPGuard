/**
 * E2E Tests: Retired task management routes
 *
 * The product surface is API-metrics first. Legacy task, board, and operating
 * routes should stay authenticated and land users in the metric catalogue
 * instead of rendering retired task-management UI.
 */
import { expect, test } from '@playwright/test';

const LEGACY_PRODUCT_ROUTES = [
  '/dashboard',
  '/tasks',
  '/board',
  '/my-tasks',
  '/projects',
  '/standup',
  '/today',
  '/whip',
  '/table',
  '/logbook',
] as const;

test.describe('Retired task management routes', () => {
  for (const route of LEGACY_PRODUCT_ROUTES) {
    test(`redirects ${route} to metrics`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/metrics(?:[/?#]|$)/, { timeout: 15_000 });
      await expect(page).not.toHaveURL(/\/login/i);
      await expect(page.locator('[data-testid="authenticated-layout"], nav').first()).toBeVisible();
    });
  }

  test('does not expose legacy task creation controls after redirect', async ({ page }) => {
    await page.goto('/tasks');

    await expect(page).toHaveURL(/\/metrics(?:[/?#]|$)/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /add.*task|create.*task|new.*task/i })).toHaveCount(0);
  });
});
