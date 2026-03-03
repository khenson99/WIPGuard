import { Prisma } from '@prisma/client';
import { getRequestContext, TenantContextError } from './request-context';

/**
 * Models that are scoped to an organization and require tenant isolation.
 * Any model with an `organizationId` field should be listed here.
 */
export const TENANT_SCOPED_MODELS: string[] = [
  'Project',
  'Task',
  'Sprint',
  'Deal',
  'Contact',
  'Pipeline',
  'Stage',
  'Activity',
  'Comment',
  'Document',
  'Invoice',
  'Estimate',
  'TimeEntry',
  'Team',
  'Label',
  'Milestone',
  'Notification',
  'Webhook',
  'Integration',
  'ApiKey',
];

/**
 * Actions that read data and need WHERE clause injection.
 */
const READ_ACTIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
];

/**
 * Actions that modify existing data and need WHERE clause injection.
 */
const UPDATE_DELETE_ACTIONS = [
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
];

/**
 * Actions that create data and need data injection.
 */
const CREATE_ACTIONS = [
  'create',
  'createMany',
];

/**
 * Options for the tenant middleware.
 */
export interface TenantMiddlewareOptions {
  /**
   * Models to enforce tenant scoping on.
   * Defaults to TENANT_SCOPED_MODELS.
   */
  scopedModels?: string[];

  /**
   * If true, skip tenant enforcement when no context is available.
   * Useful for migrations, seeding, and admin operations.
   * Defaults to false.
   */
  allowBypass?: boolean;

  /**
   * The field name used for organization scoping.
   * Defaults to 'organizationId'.
   */
  tenantField?: string;
}

/**
 * Creates a Prisma middleware that automatically injects organizationId
 * into all queries for tenant-scoped models.
 *
 * This provides defense-in-depth data isolation — even if a developer
 * forgets to add org filtering to a query, this middleware ensures
 * the constraint is always applied.
 */
export function createTenantMiddleware(
  options: TenantMiddlewareOptions = {}
): Prisma.Middleware {
  const {
    scopedModels = TENANT_SCOPED_MODELS,
    allowBypass = false,
    tenantField = 'organizationId',
  } = options;

  const scopedModelSet = new Set(scopedModels);

  return async function tenantMiddleware(
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<any>
  ): Promise<any> {
    // Skip if model is not tenant-scoped
    if (!params.model || !scopedModelSet.has(params.model)) {
      return next(params);
    }

    const ctx = getRequestContext();
    const orgId = ctx?.organizationId;

    // If no context, either bypass or throw
    if (!orgId) {
      if (allowBypass) {
        return next(params);
      }
      throw new TenantContextError(
        `Tenant isolation enforced: no organizationId in context for ${params.model}.${params.action}. ` +
        `Set up request context or use allowBypass for admin operations.`
      );
    }

    // Initialize args if missing
    if (!params.args) {
      params.args = {};
    }

    // Inject tenant filter into READ actions
    if (READ_ACTIONS.includes(params.action)) {
      params.args.where = {
        ...params.args.where,
        [tenantField]: orgId,
      };
    }

    // Inject tenant filter into UPDATE/DELETE actions
    if (UPDATE_DELETE_ACTIONS.includes(params.action)) {
      if (params.action === 'upsert') {
        // Upsert has both where and create
        params.args.where = {
          ...params.args.where,
          [tenantField]: orgId,
        };
        if (params.args.create) {
          params.args.create = {
            ...params.args.create,
            [tenantField]: orgId,
          };
        }
        if (params.args.update) {
          // update clause doesn't need the filter, but we ensure
          // it can't change the organizationId
          delete params.args.update[tenantField];
        }
      } else {
        params.args.where = {
          ...params.args.where,
          [tenantField]: orgId,
        };

        // Prevent changing organizationId via update
        if (params.action === 'update' || params.action === 'updateMany') {
          if (params.args.data) {
            delete params.args.data[tenantField];
          }
        }
      }
    }

    // Inject tenant field into CREATE actions
    if (CREATE_ACTIONS.includes(params.action)) {
      if (params.action === 'create') {
        params.args.data = {
          ...params.args.data,
          [tenantField]: orgId,
        };
      } else if (params.action === 'createMany') {
        // createMany can have an array of data
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((item: any) => ({
            ...item,
            [tenantField]: orgId,
          }));
        } else if (params.args.data) {
          params.args.data = {
            ...params.args.data,
            [tenantField]: orgId,
          };
        }
      }
    }

    return next(params);
  };
}
