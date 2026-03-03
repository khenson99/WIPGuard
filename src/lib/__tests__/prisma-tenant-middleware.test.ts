import { vi } from 'vitest';
import { createTenantExtension, TENANT_SCOPED_MODELS, TenantMiddlewareOptions } from '@/lib/prisma-tenant-middleware';
import { requestContext, TenantContextError } from '@/lib/request-context';

// Type for the $allOperations handler extracted from the extension
type AllOperationsHandler = (params: {
  model: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}) => Promise<unknown>;

/**
 * Helper to invoke the $allOperations callback from a tenant extension.
 *
 * Prisma.defineExtension returns an extension definition object.
 * We extract the `$allOperations` handler from `query.$allModels`
 * and call it directly with the model, operation, args, and a mock query function.
 */
function getExtensionHandler(options?: TenantMiddlewareOptions): AllOperationsHandler {
  const extension = createTenantExtension(options);
  // Access the extension's query definition
  // Prisma.defineExtension returns { query: { $allModels: { $allOperations: fn } } }
  const ext = extension as unknown as {
    query: {
      $allModels: {
        $allOperations: AllOperationsHandler;
      };
    };
  };

  return ext.query.$allModels.$allOperations;
}

/**
 * Helper to call the extension handler with model/operation/args
 * and a mock query function that captures the args it receives.
 */
async function callExtension(
  handler: AllOperationsHandler,
  model: string,
  operation: string,
  args: Record<string, unknown> = {}
) {
  const query = vi.fn(async (modifiedArgs: Record<string, unknown>) => modifiedArgs);
  const result = await handler({ model, operation, args, query });
  return { result, query };
}

describe('prisma-tenant-middleware (extension)', () => {
  const handler = getExtensionHandler();
  const orgId = 'org-test-123';

  describe('with valid organization context', () => {
    function runInContext<T>(fn: () => T): T {
      return requestContext.run({ organizationId: orgId }, fn);
    }

    describe('findMany', () => {
      it('injects organizationId into where clause', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Project', 'findMany', {
            where: { status: 'active' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { status: 'active', organizationId: orgId },
        });
      });

      it('creates where clause if none exists', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Project', 'findMany', {})
        );

        expect(query).toHaveBeenCalledWith({
          where: { organizationId: orgId },
        });
      });
    });

    describe('findFirst', () => {
      it('injects organizationId into where clause', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Task', 'findFirst', {
            where: { id: 'task-1' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { id: 'task-1', organizationId: orgId },
        });
      });
    });

    describe('findUnique', () => {
      it('injects organizationId into where clause', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Sprint', 'findUnique', {
            where: { id: 'sprint-1' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { id: 'sprint-1', organizationId: orgId },
        });
      });
    });

    describe('count', () => {
      it('injects organizationId into where clause', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Deal', 'count', {
            where: { stage: 'won' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { stage: 'won', organizationId: orgId },
        });
      });
    });

    describe('create', () => {
      it('injects organizationId into data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Project', 'create', {
            data: { name: 'New Project' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          data: { name: 'New Project', organizationId: orgId },
        });
      });

      it('overrides existing organizationId in data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Project', 'create', {
            data: { name: 'Project', organizationId: 'wrong-org' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          data: { name: 'Project', organizationId: orgId },
        });
      });
    });

    describe('createMany', () => {
      it('injects organizationId into array data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Task', 'createMany', {
            data: [
              { title: 'Task 1' },
              { title: 'Task 2' },
            ],
          })
        );

        expect(query).toHaveBeenCalledWith({
          data: [
            { title: 'Task 1', organizationId: orgId },
            { title: 'Task 2', organizationId: orgId },
          ],
        });
      });
    });

    describe('update', () => {
      it('injects organizationId into where and removes from data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Project', 'update', {
            where: { id: 'proj-1' },
            data: { name: 'Updated', organizationId: 'should-be-removed' },
          })
        );

        const calledWith = query.mock.calls[0][0] as Record<string, unknown>;
        expect(calledWith.where).toEqual({
          id: 'proj-1',
          organizationId: orgId,
        });
        expect((calledWith.data as Record<string, unknown>).organizationId).toBeUndefined();
        expect((calledWith.data as Record<string, unknown>).name).toBe('Updated');
      });
    });

    describe('updateMany', () => {
      it('injects organizationId into where', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Task', 'updateMany', {
            where: { status: 'todo' },
            data: { status: 'done' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { status: 'todo', organizationId: orgId },
          data: { status: 'done' },
        });
      });
    });

    describe('delete', () => {
      it('injects organizationId into where', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Project', 'delete', {
            where: { id: 'proj-1' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { id: 'proj-1', organizationId: orgId },
        });
      });
    });

    describe('deleteMany', () => {
      it('injects organizationId into where', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Task', 'deleteMany', {
            where: { status: 'archived' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { status: 'archived', organizationId: orgId },
        });
      });
    });

    describe('upsert', () => {
      it('injects organizationId into where and create, strips from update', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Deal', 'upsert', {
            where: { id: 'deal-1' },
            create: { name: 'New Deal', value: 1000 },
            update: { value: 2000, organizationId: 'should-be-removed' },
          })
        );

        const calledWith = query.mock.calls[0][0] as Record<string, unknown>;
        expect(calledWith.where).toEqual({
          id: 'deal-1',
          organizationId: orgId,
        });
        expect(calledWith.create).toEqual({
          name: 'New Deal',
          value: 1000,
          organizationId: orgId,
        });
        expect((calledWith.update as Record<string, unknown>).organizationId).toBeUndefined();
        expect((calledWith.update as Record<string, unknown>).value).toBe(2000);
      });
    });
  });

  describe('non-tenant-scoped models', () => {
    it('does not modify queries for non-scoped models', async () => {
      const { query } = await callExtension(handler, 'User', 'findMany', {
        where: { email: 'test@example.com' },
      });

      // For non-scoped models, query should be called with original args
      expect(query).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('without organization context', () => {
    it('throws TenantContextError for scoped models', async () => {
      await expect(
        callExtension(handler, 'Project', 'findMany', {})
      ).rejects.toThrow(TenantContextError);
    });

    it('does not throw for non-scoped models', async () => {
      await expect(
        callExtension(handler, 'User', 'findMany', {})
      ).resolves.toBeDefined();
    });
  });

  describe('allowBypass option', () => {
    const bypassHandler = getExtensionHandler({ allowBypass: true });

    it('allows queries without context when bypass is enabled', async () => {
      const { query } = await callExtension(bypassHandler, 'Project', 'findMany', {
        where: { status: 'active' },
      });

      expect(query).toHaveBeenCalledWith({
        where: { status: 'active' },
      });
    });

    it('still injects context when available even with bypass enabled', async () => {
      const { query } = await requestContext.run({ organizationId: orgId }, () =>
        callExtension(bypassHandler, 'Project', 'findMany', {
          where: { status: 'active' },
        })
      );

      expect(query).toHaveBeenCalledWith({
        where: { status: 'active', organizationId: orgId },
      });
    });
  });

  describe('custom tenantField', () => {
    const customHandler = getExtensionHandler({
      tenantField: 'orgId',
      scopedModels: ['Project'],
    });

    it('uses custom field name', async () => {
      const { query } = await requestContext.run({ organizationId: orgId }, () =>
        callExtension(customHandler, 'Project', 'findMany', {})
      );

      expect(query).toHaveBeenCalledWith({
        where: { orgId: orgId },
      });
    });
  });

  describe('custom scopedModels', () => {
    const customHandler = getExtensionHandler({
      scopedModels: ['CustomModel'],
    });

    it('applies to custom models', async () => {
      const { query } = await requestContext.run({ organizationId: orgId }, () =>
        callExtension(customHandler, 'CustomModel', 'findMany', {})
      );

      expect(query).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
    });

    it('does not apply to default models when overridden', async () => {
      // No context, but Project is not in custom list so should pass
      const { query } = await callExtension(customHandler, 'Project', 'findMany', {
        where: { status: 'active' },
      });

      expect(query).toHaveBeenCalledWith({
        where: { status: 'active' },
      });
    });
  });

  describe('TENANT_SCOPED_MODELS', () => {
    it('includes expected core models', () => {
      expect(TENANT_SCOPED_MODELS).toContain('Project');
      expect(TENANT_SCOPED_MODELS).toContain('Task');
      expect(TENANT_SCOPED_MODELS).toContain('Sprint');
      expect(TENANT_SCOPED_MODELS).toContain('Deal');
    });

    it('does not include User model', () => {
      expect(TENANT_SCOPED_MODELS).not.toContain('User');
    });
  });

  describe('edge cases', () => {
    it('handles empty args gracefully', async () => {
      const { query } = await requestContext.run({ organizationId: orgId }, () =>
        callExtension(handler, 'Project', 'findMany', {})
      );

      expect(query).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
    });

    it('handles undefined model gracefully', async () => {
      // Extension with undefined/empty model should pass through
      const { query } = await callExtension(handler, '', 'findMany', {});
      expect(query).toHaveBeenCalled();
    });
  });
});
