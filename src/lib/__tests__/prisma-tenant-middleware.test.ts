import { Prisma } from '@prisma/client';
import { createTenantMiddleware, TENANT_SCOPED_MODELS } from '../prisma-tenant-middleware';
import { requestContext, TenantContextError } from '../request-context';

// Helper to create middleware params
function createParams(
  model: string,
  action: string,
  args: any = {}
): Prisma.MiddlewareParams {
  return {
    model: model as any,
    action: action as any,
    args,
    dataPath: [],
    runInTransaction: false,
  };
}

// Mock next function that returns the params it received
const createNext = () => {
  const next = jest.fn(async (params: Prisma.MiddlewareParams) => params);
  return next;
};

describe('prisma-tenant-middleware', () => {
  const middleware = createTenantMiddleware();
  const orgId = 'org-test-123';

  describe('with valid organization context', () => {
    function runInContext<T>(fn: () => T): T {
      return requestContext.run({ organizationId: orgId }, fn);
    }

    describe('findMany', () => {
      it('injects organizationId into where clause', async () => {
        const next = createNext();
        const params = createParams('Project', 'findMany', {
          where: { status: 'active' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { status: 'active', organizationId: orgId },
            },
          })
        );
      });

      it('creates where clause if none exists', async () => {
        const next = createNext();
        const params = createParams('Project', 'findMany', {});

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { organizationId: orgId },
            },
          })
        );
      });
    });

    describe('findFirst', () => {
      it('injects organizationId into where clause', async () => {
        const next = createNext();
        const params = createParams('Task', 'findFirst', {
          where: { id: 'task-1' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { id: 'task-1', organizationId: orgId },
            },
          })
        );
      });
    });

    describe('findUnique', () => {
      it('injects organizationId into where clause', async () => {
        const next = createNext();
        const params = createParams('Sprint', 'findUnique', {
          where: { id: 'sprint-1' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { id: 'sprint-1', organizationId: orgId },
            },
          })
        );
      });
    });

    describe('count', () => {
      it('injects organizationId into where clause', async () => {
        const next = createNext();
        const params = createParams('Deal', 'count', {
          where: { stage: 'won' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { stage: 'won', organizationId: orgId },
            },
          })
        );
      });
    });

    describe('create', () => {
      it('injects organizationId into data', async () => {
        const next = createNext();
        const params = createParams('Project', 'create', {
          data: { name: 'New Project' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              data: { name: 'New Project', organizationId: orgId },
            },
          })
        );
      });

      it('overrides existing organizationId in data', async () => {
        const next = createNext();
        const params = createParams('Project', 'create', {
          data: { name: 'Project', organizationId: 'wrong-org' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              data: { name: 'Project', organizationId: orgId },
            },
          })
        );
      });
    });

    describe('createMany', () => {
      it('injects organizationId into array data', async () => {
        const next = createNext();
        const params = createParams('Task', 'createMany', {
          data: [
            { title: 'Task 1' },
            { title: 'Task 2' },
          ],
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              data: [
                { title: 'Task 1', organizationId: orgId },
                { title: 'Task 2', organizationId: orgId },
              ],
            },
          })
        );
      });
    });

    describe('update', () => {
      it('injects organizationId into where and removes from data', async () => {
        const next = createNext();
        const params = createParams('Project', 'update', {
          where: { id: 'proj-1' },
          data: { name: 'Updated', organizationId: 'should-be-removed' },
        });

        await runInContext(() => middleware(params, next));

        const calledWith = next.mock.calls[0][0];
        expect(calledWith.args.where).toEqual({
          id: 'proj-1',
          organizationId: orgId,
        });
        expect(calledWith.args.data.organizationId).toBeUndefined();
        expect(calledWith.args.data.name).toBe('Updated');
      });
    });

    describe('updateMany', () => {
      it('injects organizationId into where', async () => {
        const next = createNext();
        const params = createParams('Task', 'updateMany', {
          where: { status: 'todo' },
          data: { status: 'done' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { status: 'todo', organizationId: orgId },
              data: { status: 'done' },
            },
          })
        );
      });
    });

    describe('delete', () => {
      it('injects organizationId into where', async () => {
        const next = createNext();
        const params = createParams('Project', 'delete', {
          where: { id: 'proj-1' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { id: 'proj-1', organizationId: orgId },
            },
          })
        );
      });
    });

    describe('deleteMany', () => {
      it('injects organizationId into where', async () => {
        const next = createNext();
        const params = createParams('Task', 'deleteMany', {
          where: { status: 'archived' },
        });

        await runInContext(() => middleware(params, next));

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            args: {
              where: { status: 'archived', organizationId: orgId },
            },
          })
        );
      });
    });

    describe('upsert', () => {
      it('injects organizationId into where and create, strips from update', async () => {
        const next = createNext();
        const params = createParams('Deal', 'upsert', {
          where: { id: 'deal-1' },
          create: { name: 'New Deal', value: 1000 },
          update: { value: 2000, organizationId: 'should-be-removed' },
        });

        await runInContext(() => middleware(params, next));

        const calledWith = next.mock.calls[0][0];
        expect(calledWith.args.where).toEqual({
          id: 'deal-1',
          organizationId: orgId,
        });
        expect(calledWith.args.create).toEqual({
          name: 'New Deal',
          value: 1000,
          organizationId: orgId,
        });
        expect(calledWith.args.update.organizationId).toBeUndefined();
        expect(calledWith.args.update.value).toBe(2000);
      });
    });
  });

  describe('non-tenant-scoped models', () => {
    it('does not modify queries for non-scoped models', async () => {
      const next = createNext();
      const params = createParams('User', 'findMany', {
        where: { email: 'test@example.com' },
      });

      // Even without context, non-scoped models should pass through
      await middleware(params, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { email: 'test@example.com' },
          },
        })
      );
    });
  });

  describe('without organization context', () => {
    it('throws TenantContextError for scoped models', async () => {
      const next = createNext();
      const params = createParams('Project', 'findMany', {});

      await expect(middleware(params, next)).rejects.toThrow(TenantContextError);
      expect(next).not.toHaveBeenCalled();
    });

    it('does not throw for non-scoped models', async () => {
      const next = createNext();
      const params = createParams('User', 'findMany', {});

      await expect(middleware(params, next)).resolves.toBeDefined();
    });
  });

  describe('allowBypass option', () => {
    const bypassMiddleware = createTenantMiddleware({ allowBypass: true });

    it('allows queries without context when bypass is enabled', async () => {
      const next = createNext();
      const params = createParams('Project', 'findMany', {
        where: { status: 'active' },
      });

      await expect(bypassMiddleware(params, next)).resolves.toBeDefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { status: 'active' },
          },
        })
      );
    });

    it('still injects context when available even with bypass enabled', async () => {
      const next = createNext();
      const params = createParams('Project', 'findMany', {
        where: { status: 'active' },
      });

      await requestContext.run({ organizationId: orgId }, () =>
        bypassMiddleware(params, next)
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { status: 'active', organizationId: orgId },
          },
        })
      );
    });
  });

  describe('custom tenantField', () => {
    const customMiddleware = createTenantMiddleware({
      tenantField: 'orgId',
      scopedModels: ['Project'],
    });

    it('uses custom field name', async () => {
      const next = createNext();
      const params = createParams('Project', 'findMany', {});

      await requestContext.run({ organizationId: orgId }, () =>
        customMiddleware(params, next)
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { orgId: orgId },
          },
        })
      );
    });
  });

  describe('custom scopedModels', () => {
    const customMiddleware = createTenantMiddleware({
      scopedModels: ['CustomModel'],
    });

    it('applies to custom models', async () => {
      const next = createNext();
      const params = createParams('CustomModel', 'findMany', {});

      await requestContext.run({ organizationId: orgId }, () =>
        customMiddleware(params, next)
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { organizationId: orgId },
          },
        })
      );
    });

    it('does not apply to default models when overridden', async () => {
      const next = createNext();
      const params = createParams('Project', 'findMany', {});

      // No context, but Project is not in custom list so should pass
      await expect(customMiddleware(params, next)).resolves.toBeDefined();
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
    it('handles undefined args gracefully', async () => {
      const next = createNext();
      const params: Prisma.MiddlewareParams = {
        model: 'Project' as any,
        action: 'findMany' as any,
        args: undefined as any,
        dataPath: [],
        runInTransaction: false,
      };

      await requestContext.run({ organizationId: orgId }, () =>
        middleware(params, next)
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { organizationId: orgId },
          },
        })
      );
    });

    it('handles null model gracefully', async () => {
      const next = createNext();
      const params: Prisma.MiddlewareParams = {
        model: undefined as any,
        action: 'findMany' as any,
        args: {},
        dataPath: [],
        runInTransaction: false,
      };

      // Should pass through without modification
      await middleware(params, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
