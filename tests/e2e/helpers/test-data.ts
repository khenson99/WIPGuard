/**
 * Test data constants and factories for E2E tests.
 * These provide deterministic, reusable data across test suites.
 */

export const TEST_USER = {
  email: process.env.E2E_TEST_USER_EMAIL || 'e2e-test@the-mother-node.local',
  password: process.env.E2E_TEST_USER_PASSWORD || 'TestPassword123!',
  name: 'E2E Test User',
} as const;

export const TEST_ADMIN = {
  email: process.env.E2E_TEST_ADMIN_EMAIL || 'e2e-admin@the-mother-node.local',
  password: process.env.E2E_TEST_ADMIN_PASSWORD || 'AdminPassword123!',
  name: 'E2E Admin User',
} as const;

let counter = 0;

/**
 * Generate a unique identifier for test data to avoid collisions.
 */
export function uniqueId(prefix = 'e2e'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * Generate a unique task title.
 */
export function uniqueTaskTitle(prefix = 'Task'): string {
  return `${prefix} ${uniqueId('task')}`;
}

/**
 * Generate a unique sprint name.
 */
export function uniqueSprintName(): string {
  return `Sprint ${uniqueId('sprint')}`;
}

/**
 * Generate a unique deal name.
 */
export function uniqueDealName(): string {
  return `Deal ${uniqueId('deal')}`;
}

/**
 * Default WIP limits for testing policy enforcement.
 */
export const DEFAULT_WIP_LIMITS = {
  todo: 10,
  inProgress: 3,
  review: 5,
  done: -1, // unlimited
} as const;

/**
 * Pipeline stages for deal management tests.
 */
export const DEAL_STAGES = [
  'Lead',
  'Qualified',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const;

/**
 * Board columns for Kanban tests.
 */
export const BOARD_COLUMNS = [
  'To Do',
  'In Progress',
  'In Review',
  'Done',
] as const;
