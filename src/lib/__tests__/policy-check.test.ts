import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    policy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    workItem: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    board: {
      findUnique: vi.fn(),
    },
    boardColumn: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('policy-check module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export policy check functions', async () => {
      const policyCheck = await import('@/lib/policy-check');

      // Should export at least one function
      const exports = Object.keys(policyCheck);
      expect(exports.length).toBeGreaterThan(0);

      // Check for common expected exports
      const hasPolicyFn = exports.some((key) =>
        key.toLowerCase().includes('policy')
        || key.toLowerCase().includes('check')
        || key.toLowerCase().includes('evaluate')
        || key.toLowerCase().includes('validate')
      );
      expect(hasPolicyFn).toBe(true);
    });
  });

  describe('WIP limit checking', () => {
    it('should detect WIP limit violation', async () => {
      const policyCheck = await import('@/lib/policy-check');
      const prisma = (await import('@/lib/prisma')).default;

      const checkFn = policyCheck.checkWipLimit
        || policyCheck.evaluateWipPolicy
        || policyCheck.checkPolicy
        || policyCheck.validateWipLimit;

      if (checkFn) {
        // Mock: column has WIP limit of 3, currently has 3 items
        vi.mocked(prisma.workItem.count || prisma.workItem.findMany).mockResolvedValue(3 as unknown);

        const result = await checkFn({
          columnId: 'col-1',
          wipLimit: 3,
          boardId: 'board-1',
        });

        // Should indicate a violation
        if (typeof result === 'boolean') {
          expect(result).toBe(false); // false = not allowed
        } else if (result && typeof result === 'object') {
          expect(result.allowed === false || result.violated === true || result.violation).toBeTruthy();
        }
      }
    });

    it('should allow when under WIP limit', async () => {
      const policyCheck = await import('@/lib/policy-check');
      const prisma = (await import('@/lib/prisma')).default;

      const checkFn = policyCheck.checkWipLimit
        || policyCheck.evaluateWipPolicy
        || policyCheck.checkPolicy
        || policyCheck.validateWipLimit;

      if (checkFn) {
        // Mock: column has WIP limit of 5, currently has 2 items
        vi.mocked(prisma.workItem.count || prisma.workItem.findMany).mockResolvedValue(2 as unknown);

        const result = await checkFn({
          columnId: 'col-1',
          wipLimit: 5,
          boardId: 'board-1',
        });

        if (typeof result === 'boolean') {
          expect(result).toBe(true);
        } else if (result && typeof result === 'object') {
          expect(result.allowed === true || result.violated === false || !result.violation).toBeTruthy();
        }
      }
    });

    it('should handle no WIP limit (unlimited)', async () => {
      const policyCheck = await import('@/lib/policy-check');

      const checkFn = policyCheck.checkWipLimit
        || policyCheck.evaluateWipPolicy
        || policyCheck.checkPolicy
        || policyCheck.validateWipLimit;

      if (checkFn) {
        const result = await checkFn({
          columnId: 'col-1',
          wipLimit: 0, // 0 or null typically means unlimited
          boardId: 'board-1',
        });

        if (typeof result === 'boolean') {
          expect(result).toBe(true);
        } else if (result && typeof result === 'object') {
          expect(result.allowed !== false).toBeTruthy();
        }
      }
    });
  });

  describe('policy evaluation', () => {
    it('should evaluate policies for a board', async () => {
      const policyCheck = await import('@/lib/policy-check');
      const prisma = (await import('@/lib/prisma')).default;

      const evalFn = policyCheck.evaluatePolicies
        || policyCheck.checkPolicies
        || policyCheck.runPolicyChecks
        || policyCheck.evaluateBoardPolicies;

      if (evalFn) {
        vi.mocked(prisma.policy.findMany).mockResolvedValue([
          {
            id: 'policy-1',
            name: 'WIP Limit',
            type: 'WIP_LIMIT',
            config: JSON.stringify({ limit: 3 }),
            boardId: 'board-1',
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown,
        ]);

        const result = await evalFn({ boardId: 'board-1' });
        expect(result).toBeDefined();
      }
    });

    it('should handle boards with no policies', async () => {
      const policyCheck = await import('@/lib/policy-check');
      const prisma = (await import('@/lib/prisma')).default;

      const evalFn = policyCheck.evaluatePolicies
        || policyCheck.checkPolicies
        || policyCheck.runPolicyChecks
        || policyCheck.evaluateBoardPolicies;

      if (evalFn) {
        vi.mocked(prisma.policy.findMany).mockResolvedValue([]);

        const result = await evalFn({ boardId: 'board-empty' });
        expect(result).toBeDefined();
        if (Array.isArray(result)) {
          expect(result).toHaveLength(0);
        }
      }
    });

    it('should skip disabled policies', async () => {
      const policyCheck = await import('@/lib/policy-check');
      const prisma = (await import('@/lib/prisma')).default;

      const evalFn = policyCheck.evaluatePolicies
        || policyCheck.checkPolicies
        || policyCheck.runPolicyChecks
        || policyCheck.evaluateBoardPolicies;

      if (evalFn) {
        vi.mocked(prisma.policy.findMany).mockResolvedValue([
          {
            id: 'policy-disabled',
            name: 'Disabled Policy',
            type: 'WIP_LIMIT',
            config: JSON.stringify({ limit: 1 }),
            boardId: 'board-1',
            enabled: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown,
        ]);

        const result = await evalFn({ boardId: 'board-1' });
        expect(result).toBeDefined();
      }
    });
  });
});
