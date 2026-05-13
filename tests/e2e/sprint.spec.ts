/**
 * E2E Tests: Retired sprint settings
 *
 * Sprint management is no longer part of the primary product surface. The
 * legacy settings entry point should route users back to the supported Team tab.
 */
import { expect, test } from '@playwright/test';

test.describe('Retired sprint settings', () => {
  test('redirects the legacy sprints tab to Team settings', async ({ page }) => {
    await page.goto('/settings?tab=sprints');

    await expect(page).toHaveURL(/\/settings\?tab=team/i, { timeout: 15_000 });
    await expect(page.getByRole('tab', { name: /^team$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/sprint management|create sprint|new sprint/i)).toHaveCount(0);
  });

  test('keeps users authenticated while retiring sprint UI', async ({ page }) => {
    await page.goto('/settings?tab=sprints');

    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.locator('[data-testid="authenticated-layout"], nav').first()).toBeVisible();
  });
});
