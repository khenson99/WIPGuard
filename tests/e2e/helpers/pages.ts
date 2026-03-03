/**
 * Page Object helpers for common E2E interactions.
 * Encapsulates selectors and actions for reuse across test suites.
 */
import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Helper for authentication-related page interactions.
 */
export class AuthPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly loginButton: Locator;
  readonly logoutButton: Locator;
  readonly userMenu: Locator;
  readonly errorMessage: Locator;
  readonly devUserSelect: Locator;
  readonly devLoginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(/email/i);
    this.loginButton = page.getByRole('button', { name: /log\s*in|sign\s*in/i });
    this.logoutButton = page.getByRole('button', { name: /log\s*out|sign\s*out/i }).or(
      page.getByRole('menuitem', { name: /log\s*out|sign\s*out/i })
    );
    this.userMenu = page.getByRole('button', { name: /user|account|profile|avatar/i }).or(
      page.locator('[data-testid="user-menu"]')
    );
    this.errorMessage = page.getByRole('alert').or(
      page.locator('[data-testid="auth-error"]')
    );
    this.devUserSelect = page.getByLabel(/select development user/i);
    this.devLoginButton = page.getByRole('button', { name: /sign in as this user/i });
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async login(email: string, password: string) {
    await this.goto();

    // Wait for the login UI to hydrate/fetch providers in CI.
    // The page starts with minimal chrome and then renders provider buttons.
    await Promise.race([
      this.devUserSelect.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
      this.emailInput.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
      this.page.getByRole('button', { name: /sign in with google/i }).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
      this.page.getByText(/no sign-in provider is configured/i).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
    ]);

    const devLoginVisible = await this.devUserSelect.isVisible().catch(() => false);
    if (devLoginVisible) {
      // Prefer dev-mode login (no password) when available.
      // If the requested email isn't present, fall back to the first option.
      try {
        await this.devUserSelect.selectOption({ value: email });
      } catch {
        await this.devUserSelect.selectOption({ index: 0 });
      }
      await this.devLoginButton.click();
      return;
    }

    // Legacy email/password login (if the environment supports it).
    const emailVisible = await this.emailInput.isVisible().catch(() => false);
    if (emailVisible) {
      await this.emailInput.fill(email);
      // Some environments may not have a password field; only fill if present.
      const passwordInput = this.page.getByLabel(/password/i);
      const passwordVisible = await passwordInput.isVisible().catch(() => false);
      if (passwordVisible) {
        await passwordInput.fill(password);
      }
      await this.loginButton.click();
      return;
    }

    throw new Error('No supported login method found on /login');
  }

  async logout() {
    // Try clicking user menu first (common pattern)
    const userMenuVisible = await this.userMenu.isVisible().catch(() => false);
    if (userMenuVisible) {
      await this.userMenu.click();
    }
    const logoutVisible = await this.logoutButton.isVisible().catch(() => false);
    if (logoutVisible) {
      await this.logoutButton.click();
      return;
    }

    // Fallback to NextAuth signout page if UI doesn't expose a logout affordance.
    await this.page.goto('/api/auth/signout?callbackUrl=/login');
    const signOutButton = this.page.getByRole('button', { name: /sign out|log out/i });
    await signOutButton.click();
  }
}

/**
 * Helper for Kanban board page interactions.
 */
export class BoardPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/tasks');
    await this.page.waitForLoadState('domcontentloaded');
  }

  getColumn(name: string): Locator {
    return this.page.locator(`[data-testid="column-${name.toLowerCase().replace(/\s+/g, '-')}"]`).or(
      this.page.getByRole('region', { name: new RegExp(name, 'i') })
    ).or(
      this.page.locator(`[data-column="${name}"]`)
    );
  }

  getTask(title: string): Locator {
    return this.page.getByText(title, { exact: false });
  }

  getCreateTaskButton(): Locator {
    return this.page.getByRole('button', { name: /add.*task|create.*task|new.*task|\+/i });
  }

  getTitleInput(): Locator {
    return this.page.getByLabel(/title|name/i).or(
      this.page.getByPlaceholder(/task.*title|enter.*title|task.*name/i)
    ).or(
      this.page.locator('[data-testid="task-title-input"]')
    );
  }

  getSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /create|save|add|submit/i });
  }

  getWipLimitWarning(): Locator {
    return this.page.getByText(/wip.*limit|work.*in.*progress.*limit/i).or(
      this.page.locator('[data-testid="wip-limit-warning"]')
    ).or(
      this.page.getByRole('alert')
    );
  }

  async createTask(title: string) {
    await this.getCreateTaskButton().click();
    await this.getTitleInput().fill(title);
    await this.getSubmitButton().click();
  }

  /**
   * Drag a task card to a target column using Playwright's drag-and-drop.
   */
  async dragTaskToColumn(taskTitle: string, targetColumnName: string) {
    const taskCard = this.getTask(taskTitle);
    const targetColumn = this.getColumn(targetColumnName);

    await taskCard.dragTo(targetColumn);
  }
}

/**
 * Helper for Sprint management page interactions.
 */
export class SprintPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/settings?tab=sprints');
    await this.page.waitForLoadState('domcontentloaded');
  }

  getCreateSprintButton(): Locator {
    return this.page.getByRole('button', { name: /create.*sprint|new.*sprint/i });
  }

  getStartDateInput(): Locator {
    return this.page.getByLabel(/start date/i).or(
      this.page.locator('input[type="date"]').first()
    );
  }

  getEndDateInput(): Locator {
    return this.page.getByLabel(/end date/i).or(
      this.page.locator('input[type="date"]').nth(1)
    );
  }

  getSprintLabelPreview(): Locator {
    return this.page.getByText(/^sprint label$/i).locator('..').locator('div').first();
  }

  getActiveCheckbox(): Locator {
    return this.page.getByLabel(/set as active sprint/i);
  }

  getSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /create|save|start|submit/i });
  }

  getCompleteSprintButton(): Locator {
    return this.page.getByRole('button', { name: /complete.*sprint|end.*sprint|finish.*sprint/i });
  }

  getSprint(name: string): Locator {
    return this.page.getByText(name, { exact: false });
  }

  getCommitTaskButton(): Locator {
    return this.page.getByRole('button', { name: /commit|add.*task|assign/i });
  }

  async createSprint(_name: string): Promise<string> {
    await this.getCreateSprintButton().click();
    // Sprint label is computed from dates in the UI; create a short sprint range.
    const today = new Date();
    const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    await this.getStartDateInput().fill(fmt(today));
    await this.getEndDateInput().fill(fmt(end));
    await this.getActiveCheckbox().check().catch(() => {});

    const preview = (await this.getSprintLabelPreview().textContent().catch(() => null))?.trim();
    await this.getSubmitButton().click();
    return preview || 'Sprint';
  }
}

/**
 * Helper for Deals/Pipeline page interactions.
 */
export class DealsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/deals');
    await this.page.waitForLoadState('domcontentloaded');
  }

  getCreateDealButton(): Locator {
    return this.page.getByRole('button', { name: /create.*deal|new.*deal|add.*deal/i });
  }

  getDealNameInput(): Locator {
    return this.page.getByLabel(/name|title/i).or(
      this.page.getByPlaceholder(/deal.*name/i)
    ).or(
      this.page.locator('[data-testid="deal-name-input"]')
    );
  }

  getSubmitButton(): Locator {
    return this.page.getByRole('button', { name: /create|save|submit/i });
  }

  getDeal(name: string): Locator {
    return this.page.getByText(name, { exact: false });
  }

  getStageColumn(stageName: string): Locator {
    return this.page.locator(`[data-testid="stage-${stageName.toLowerCase().replace(/\s+/g, '-')}"]`).or(
      this.page.getByRole('region', { name: new RegExp(stageName, 'i') })
    ).or(
      this.page.locator(`[data-stage="${stageName}"]`)
    );
  }

  getAdvanceButton(): Locator {
    return this.page.getByRole('button', { name: /advance|move|next.*stage|promote/i });
  }

  async createDeal(name: string) {
    await this.getCreateDealButton().click();
    await this.getDealNameInput().fill(name);
    await this.getSubmitButton().click();
  }

  async advanceDealToStage(dealName: string, targetStage: string) {
    const deal = this.getDeal(dealName);
    const targetColumn = this.getStageColumn(targetStage);

    // Try drag-and-drop first
    await deal.dragTo(targetColumn);
  }
}

/**
 * Helper for Settings page interactions.
 */
export class SettingsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/settings');
    await this.page.waitForLoadState('domcontentloaded');
  }

  getWipLimitInput(columnName: string): Locator {
    return this.page.getByLabel(new RegExp(`${columnName}.*limit|limit.*${columnName}`, 'i')).or(
      this.page.locator(`[data-testid="wip-limit-${columnName.toLowerCase().replace(/\s+/g, '-')}"]`)
    );
  }

  getSaveButton(): Locator {
    return this.page.getByRole('button', { name: /save|update|apply/i });
  }

  getSuccessMessage(): Locator {
    return this.page.getByText(/saved|updated|success/i).or(
      this.page.getByRole('alert')
    ).or(
      this.page.locator('[data-testid="settings-success"]')
    );
  }

  async setWipLimit(columnName: string, limit: number) {
    const input = this.getWipLimitInput(columnName);
    await input.clear();
    await input.fill(String(limit));
  }

  async save() {
    await this.getSaveButton().click();
  }
}
