/**
 * E2E Tests: retired local deals routes
 *
 * Deals are now sourced through connected systems. The retired local deals list
 * should send users to Sources instead of exposing deal-creation UI.
 */
import { expect, test } from '@playwright/test';

test.describe('Retired local deals routes', () => {
  test('redirects /deals to sources', async ({ page }) => {
    await page.goto('/deals');

    await expect(page).toHaveURL(/\/sources(?:[/?#]|$)/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.locator('[data-testid="authenticated-layout"], nav').first()).toBeVisible();
  });

  test('does not expose retired local deal creation controls', async ({ page }) => {
    await page.goto('/deals');

    await expect(page).toHaveURL(/\/sources(?:[/?#]|$)/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /create.*deal|new.*deal|add.*deal/i })).toHaveCount(0);
  });
});
