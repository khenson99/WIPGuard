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
  'CustomerRecord',
  'CustomerRecordExternalRef',
  'CustomerSuccessNote',
  'CustomerSuccessPlan',
  'CustomerSuccessPlanMilestone',
  'CustomerSuccessAlertRecord',
  'CustomerSuccessOutreachMessage',
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
 * Options for the tenant extension.
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
 * Creates a Prisma extension that automatically injects organizationId
 * into all queries for tenant-scoped models.
 *
 * This provides defense-in-depth data isolation — even if a developer
 * forgets to add org filtering to a query, this extension ensures
 * the constraint is always applied.
 *
 * Usage:
 *   const extended = client.$extends(createTenantExtension({ allowBypass: false }));
 */
export function createTenantExtension(
  options: TenantMiddlewareOptions = {}
) {
  const {
    scopedModels = TENANT_SCOPED_MODELS,
    allowBypass = false,
    tenantField = 'organizationId',
  } = options;

  const scopedModelSet = new Set(scopedModels);

  return {
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model: string;
          operation: string;
          args: Record<string, unknown>;
          query: (args: Record<string, unknown>) => Promise<unknown>;
        }) {
          // Skip if model is not tenant-scoped
          if (!model || !scopedModelSet.has(model)) {
            return query(args);
          }

          const ctx = getRequestContext();
          const orgId = ctx?.organizationId;

          // If no context, either bypass or throw
          if (!orgId) {
            if (allowBypass) {
              return query(args);
            }
            throw new TenantContextError(
              `Tenant isolation enforced: no organizationId in context for ${model}.${operation}. ` +
              `Set up request context or use allowBypass for admin operations.`
            );
          }

          // Clone args to avoid mutating the original
          const modifiedArgs = { ...args } as Record<string, unknown>;

          // Inject tenant filter into READ actions
          if (READ_ACTIONS.includes(operation)) {
            modifiedArgs.where = {
              ...(modifiedArgs.where as Record<string, unknown> | undefined),
              [tenantField]: orgId,
            };
          }

          // Inject tenant filter into UPDATE/DELETE actions
          if (UPDATE_DELETE_ACTIONS.includes(operation)) {
            if (operation === 'upsert') {
              // Upsert has both where and create
              modifiedArgs.where = {
                ...(modifiedArgs.where as Record<string, unknown> | undefined),
                [tenantField]: orgId,
              };
              if (modifiedArgs.create) {
                modifiedArgs.create = {
                  ...(modifiedArgs.create as Record<string, unknown>),
                  [tenantField]: orgId,
                };
              }
              if (modifiedArgs.update) {
                const update = { ...(modifiedArgs.update as Record<string, unknown>) };
                // update clause doesn't need the filter, but we ensure
                // it can't change the organizationId
                delete update[tenantField];
                modifiedArgs.update = update;
              }
            } else {
              modifiedArgs.where = {
                ...(modifiedArgs.where as Record<string, unknown> | undefined),
                [tenantField]: orgId,
              };

              // Prevent changing organizationId via update
              if (operation === 'update' || operation === 'updateMany') {
                if (modifiedArgs.data) {
                  const data = { ...(modifiedArgs.data as Record<string, unknown>) };
                  delete data[tenantField];
                  modifiedArgs.data = data;
                }
              }
            }
          }

          // Inject tenant field into CREATE actions
          if (CREATE_ACTIONS.includes(operation)) {
            if (operation === 'create') {
              modifiedArgs.data = {
                ...(modifiedArgs.data as Record<string, unknown>),
                [tenantField]: orgId,
              };
            } else if (operation === 'createMany') {
              // createMany can have an array of data
              const data = modifiedArgs.data;
              if (Array.isArray(data)) {
                modifiedArgs.data = data.map((item: Record<string, unknown>) => ({
                  ...item,
                  [tenantField]: orgId,
                }));
              } else if (data) {
                modifiedArgs.data = {
                  ...(data as Record<string, unknown>),
                  [tenantField]: orgId,
                };
              }
            }
          }

          return query(modifiedArgs);
        },
      },
    },
  };
}
