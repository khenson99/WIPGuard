import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  organizationId: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context from AsyncLocalStorage.
 * Returns undefined if no context is set (e.g., during migrations or seeding).
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Get the current organization ID from request context.
 * Throws if no organization context is available.
 */
export function getRequiredOrganizationId(): string {
  const ctx = getRequestContext();
  if (!ctx?.organizationId) {
    throw new TenantContextError('Missing organization context - tenant isolation cannot be enforced');
  }
  return ctx.organizationId;
}

/**
 * Run a function within a specific request context.
 * Useful for background jobs, tests, and server actions.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}

/**
 * Run a function within a specific request context (async version).
 */
export function runWithContextAsync<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return requestContext.run(context, fn);
}

/**
 * Custom error class for tenant context issues.
 * Allows API handlers to catch and respond with appropriate HTTP status.
 */
export class TenantContextError extends Error {
  public readonly code = 'TENANT_CONTEXT_MISSING';

  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}
