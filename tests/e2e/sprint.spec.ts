/**
 * E2E Tests: Sprint Management (Settings → Sprints tab)
 *
 * Covers:
 * - Sprints tab loads
 * - Create a sprint (date-based label)
 * - Toggle active sprint
 */
import { test, expect } from '@playwright/test';
import { SprintPage } from './helpers/pages';

test.describe('Sprint Management', () => {
  let sprintPage: SprintPage;

  test.beforeEach(async ({ page }) => {
    sprintPage = new SprintPage(page);
  });

  test('should load the sprints page', async ({ page }) => {
    await sprintPage.goto();

    // Verify page loaded (not redirected to login)
    await expect(page).not.toHaveURL(/\/login/i);

    await expect(page.getByText(/sprint management/i)).toBeVisible();
  });

  test('should create a new sprint', async ({ page }) => {
    await sprintPage.goto();
    const createdLabel = await sprintPage.createSprint('ignored');

    // Verify the sprint appears on the page
    await expect(page.getByText(createdLabel)).toBeVisible({ timeout: 10_000 });
  });

  test('should mark created sprint as active', async ({ page }) => {
    await sprintPage.goto();
    const createdLabel = await sprintPage.createSprint('ignored');

    await expect(page.getByText(createdLabel)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /deactivate sprint/i })).toBeVisible();
  });
});
