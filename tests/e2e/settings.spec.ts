/**
 * E2E Tests: Settings
 *
 * WIP policy, board, and sprint configuration moved out of the primary product
 * surface. Settings now covers team access and analytics operating guardrails.
 */
import { expect, test } from '@playwright/test';

const LEGACY_SETTINGS_TABS = [
  'board',
  'sprints',
  'projects',
  'departments',
  'priorities',
  'design-interview',
] as const;

test.describe('Settings', () => {
  test('loads the analytics-first settings tabs', async ({ page }) => {
    await page.goto('/settings');

    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.getByRole('heading', { name: /^settings$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^team$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^operations$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /board|sprint|project|department|priority/i })).toHaveCount(0);
  });

  test('switches between Team and Operations without exposing WIP controls', async ({ page }) => {
    await page.goto('/settings');

    const operationsTab = page.getByRole('tab', { name: /^operations$/i });
    await operationsTab.click();

    await expect(page).toHaveURL(/\/settings\?tab=operations/i);
    await expect(operationsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/wip limit|work in progress|create sprint|new sprint/i)).toHaveCount(0);
  });

  for (const tab of LEGACY_SETTINGS_TABS) {
    test(`redirects legacy ${tab} settings to Team`, async ({ page }) => {
      await page.goto(`/settings?tab=${tab}`);

      await expect(page).toHaveURL(/\/settings\?tab=team/i, { timeout: 15_000 });
      await expect(page.getByRole('tab', { name: /^team$/i })).toHaveAttribute('aria-selected', 'true');
    });
  }

  test('moves the legacy integrations tab to the integrations page', async ({ page }) => {
    await page.goto('/settings?tab=integrations');

    await expect(page).toHaveURL(/\/integrations(?:[/?#]|$)/i, { timeout: 15_000 });
  });
});
