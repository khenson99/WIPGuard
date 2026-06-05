import { expect, test } from '@playwright/test';
import { AuthPage } from './helpers/pages';
import { TEST_INVESTOR } from './helpers/test-data';

test.describe('Imladris command center smoke', () => {
  test('operator can open the company-health command center and report workspace', async ({ page }) => {
    await page.goto('/metrics/company');

    await expect(page.getByRole('heading', { name: 'Company Tracker' })).toBeVisible();
    await expect(page.getByText('Healthy ARR Growth')).toBeVisible();
    await expect(page.getByText('Benchmark Context')).toBeVisible();
    await expect(page.getByText('Board Readiness')).toBeVisible();

    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Executive Report Packs' })).toBeVisible();
    await expect(page.getByRole('button', { name: /generate/i }).first()).toBeVisible();
  });

  test.describe('investor monthly board pack access', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('investor sees only read-only board-pack surfaces', async ({ page }) => {
      const authPage = new AuthPage(page);
      await authPage.goto();
      await authPage.devUserSelect.waitFor({ state: 'visible', timeout: 15_000 });
      const investorOptionCount = await authPage.devUserSelect
        .locator(`option[value="${TEST_INVESTOR.email}"]`)
        .count();
      test.skip(
        investorOptionCount === 0,
        `Seed ${TEST_INVESTOR.email} with role=investor to run the investor board-pack smoke.`,
      );

      await authPage.devUserSelect.selectOption({ value: TEST_INVESTOR.email });
      await authPage.devLoginButton.click();
      await expect(page).not.toHaveURL(/\/login/i, { timeout: 15_000 });

      await page.goto('/investor');
      await expect(page.getByRole('heading', { name: 'Investor' })).toBeVisible();
      await expect(page.getByText('Board-final monthly reporting')).toBeVisible();
      await expect(
        page.getByText(/No approved investor pack is available yet\.|Board-final/i).first(),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /approve|generate|execute|reject/i })).toHaveCount(0);

      const investorApi = await page.request.get('/api/investor/board-pack');
      expect(investorApi.status()).toBe(200);

      const automationsApi = await page.request.get('/api/automations');
      expect(automationsApi.status()).toBe(403);

      await page.goto('/reports');
      await expect(page).toHaveURL(/\/investor(?:[/?#]|$)/, { timeout: 15_000 });
    });
  });
});
