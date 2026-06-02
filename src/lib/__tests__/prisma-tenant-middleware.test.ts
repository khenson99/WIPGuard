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
          callExtension(handler, 'Deal', 'findMany', {
            where: { status: 'active' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { status: 'active', organizationId: orgId },
        });
      });

      it('creates where clause if none exists', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Deal', 'findMany', {})
        );

        expect(query).toHaveBeenCalledWith({
          where: { organizationId: orgId },
        });
      });
    });

    describe('findFirst', () => {
      it('injects organizationId into where clause', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Contact', 'findFirst', {
            where: { id: 'contact-1' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { id: 'contact-1', organizationId: orgId },
        });
      });
    });

    describe('findUnique', () => {
      it('injects organizationId into where clause', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'CustomerRecord', 'findUnique', {
            where: { id: 'record-1' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { id: 'record-1', organizationId: orgId },
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
          callExtension(handler, 'Deal', 'create', {
            data: { name: 'New Deal' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          data: { name: 'New Deal', organizationId: orgId },
        });
      });

      it('overrides existing organizationId in data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Deal', 'create', {
            data: { name: 'Deal', organizationId: 'wrong-org' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          data: { name: 'Deal', organizationId: orgId },
        });
      });
    });

    describe('createMany', () => {
      it('injects organizationId into array data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Contact', 'createMany', {
            data: [
              { email: 'one@example.com' },
              { email: 'two@example.com' },
            ],
          })
        );

        expect(query).toHaveBeenCalledWith({
          data: [
            { email: 'one@example.com', organizationId: orgId },
            { email: 'two@example.com', organizationId: orgId },
          ],
        });
      });
    });

    describe('update', () => {
      it('injects organizationId into where and removes from data', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Deal', 'update', {
            where: { id: 'deal-1' },
            data: { name: 'Updated', organizationId: 'should-be-removed' },
          })
        );

        const calledWith = query.mock.calls[0][0] as Record<string, unknown>;
        expect(calledWith.where).toEqual({
          id: 'deal-1',
          organizationId: orgId,
        });
        expect((calledWith.data as Record<string, unknown>).organizationId).toBeUndefined();
        expect((calledWith.data as Record<string, unknown>).name).toBe('Updated');
      });
    });

    describe('updateMany', () => {
      it('injects organizationId into where', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Contact', 'updateMany', {
            where: { lifecycleStage: 'lead' },
            data: { lifecycleStage: 'customer' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { lifecycleStage: 'lead', organizationId: orgId },
          data: { lifecycleStage: 'customer' },
        });
      });
    });

    describe('delete', () => {
      it('injects organizationId into where', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Deal', 'delete', {
            where: { id: 'deal-1' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { id: 'deal-1', organizationId: orgId },
        });
      });
    });

    describe('deleteMany', () => {
      it('injects organizationId into where', async () => {
        const { query } = await runInContext(() =>
          callExtension(handler, 'Contact', 'deleteMany', {
            where: { lifecycleStage: 'archived' },
          })
        );

        expect(query).toHaveBeenCalledWith({
          where: { lifecycleStage: 'archived', organizationId: orgId },
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
        callExtension(handler, 'Deal', 'findMany', {})
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
      const { query } = await callExtension(bypassHandler, 'Deal', 'findMany', {
        where: { status: 'active' },
      });

      expect(query).toHaveBeenCalledWith({
        where: { status: 'active' },
      });
    });

    it('still injects context when available even with bypass enabled', async () => {
      const { query } = await requestContext.run({ organizationId: orgId }, () =>
        callExtension(bypassHandler, 'Deal', 'findMany', {
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
      // No context, but Deal is not in custom list so should pass
      const { query } = await callExtension(customHandler, 'Deal', 'findMany', {
        where: { status: 'active' },
      });

      expect(query).toHaveBeenCalledWith({
        where: { status: 'active' },
      });
    });
  });

  describe('TENANT_SCOPED_MODELS', () => {
    it('includes expected core models', () => {
      expect(TENANT_SCOPED_MODELS).toContain('Deal');
      expect(TENANT_SCOPED_MODELS).toContain('Contact');
      expect(TENANT_SCOPED_MODELS).toContain('CustomerRecord');
    });

    it('does not include User model', () => {
      expect(TENANT_SCOPED_MODELS).not.toContain('User');
    });
  });

  describe('edge cases', () => {
    it('handles empty args gracefully', async () => {
      const { query } = await requestContext.run({ organizationId: orgId }, () =>
        callExtension(handler, 'Deal', 'findMany', {})
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
