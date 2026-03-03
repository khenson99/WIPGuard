import {
  requestContext,
  getRequestContext,
  getRequiredOrganizationId,
  runWithContext,
  runWithContextAsync,
  TenantContextError,
} from '../request-context';

describe('request-context', () => {
  describe('getRequestContext', () => {
    it('returns undefined when no context is set', () => {
      expect(getRequestContext()).toBeUndefined();
    });

    it('returns the context when set via AsyncLocalStorage', () => {
      const ctx = { organizationId: 'org-123', userId: 'user-456' };
      requestContext.run(ctx, () => {
        expect(getRequestContext()).toEqual(ctx);
      });
    });

    it('returns undefined after context exits', () => {
      const ctx = { organizationId: 'org-123' };
      requestContext.run(ctx, () => {
        // inside context
      });
      expect(getRequestContext()).toBeUndefined();
    });
  });

  describe('getRequiredOrganizationId', () => {
    it('throws TenantContextError when no context is set', () => {
      expect(() => getRequiredOrganizationId()).toThrow(TenantContextError);
    });

    it('returns organizationId when context is set', () => {
      const ctx = { organizationId: 'org-789' };
      requestContext.run(ctx, () => {
        expect(getRequiredOrganizationId()).toBe('org-789');
      });
    });
  });

  describe('runWithContext', () => {
    it('sets context for synchronous functions', () => {
      const result = runWithContext({ organizationId: 'org-sync' }, () => {
        return getRequestContext()?.organizationId;
      });
      expect(result).toBe('org-sync');
    });

    it('isolates context between nested calls', () => {
      runWithContext({ organizationId: 'org-outer' }, () => {
        expect(getRequestContext()?.organizationId).toBe('org-outer');

        runWithContext({ organizationId: 'org-inner' }, () => {
          expect(getRequestContext()?.organizationId).toBe('org-inner');
        });

        expect(getRequestContext()?.organizationId).toBe('org-outer');
      });
    });
  });

  describe('runWithContextAsync', () => {
    it('sets context for async functions', async () => {
      const result = await runWithContextAsync(
        { organizationId: 'org-async' },
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          return getRequestContext()?.organizationId;
        }
      );
      expect(result).toBe('org-async');
    });
  });

  describe('TenantContextError', () => {
    it('has correct name and code', () => {
      const error = new TenantContextError('test message');
      expect(error.name).toBe('TenantContextError');
      expect(error.code).toBe('TENANT_CONTEXT_MISSING');
      expect(error.message).toBe('test message');
      expect(error instanceof Error).toBe(true);
    });
  });
});
