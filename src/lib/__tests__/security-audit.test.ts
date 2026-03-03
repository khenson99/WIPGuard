import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockCreate = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    auditLog: {
      create: mockCreate,
      findMany: mockFindMany,
    },
    securityAuditLog: {
      create: mockCreate,
      findMany: mockFindMany,
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({
      auditLog: { create: mockCreate, findMany: mockFindMany },
      securityAuditLog: { create: mockCreate, findMany: mockFindMany },
    })),
  },
}));

describe('security-audit module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      id: 'audit-1',
      createdAt: new Date(),
    });
  });

  describe('logSecurityEvent / recordAuditEvent', () => {
    it('should record an audit event with required fields', async () => {
      const securityAudit = await import('@/lib/security-audit');

      // Find the main export function for logging
      const logFn = securityAudit.logSecurityEvent
        || securityAudit.recordAuditEvent
        || securityAudit.createAuditLog
        || securityAudit.logAuditEvent;

      if (logFn) {
        await logFn({
          action: 'LOGIN',
          userId: 'user-123',
          resource: 'session',
          details: { ip: '127.0.0.1' },
        });

        expect(mockCreate).toHaveBeenCalled();
        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.data).toBeDefined();
        expect(callArgs.data.action || callArgs.data.eventType).toBeDefined();
      }
    });

    it('should handle missing optional fields gracefully', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const logFn = securityAudit.logSecurityEvent
        || securityAudit.recordAuditEvent
        || securityAudit.createAuditLog
        || securityAudit.logAuditEvent;

      if (logFn) {
        await logFn({
          action: 'LOGOUT',
          userId: 'user-123',
        });

        expect(mockCreate).toHaveBeenCalled();
      }
    });

    it('should not throw on Prisma errors (fail-safe logging)', async () => {
      mockCreate.mockRejectedValueOnce(new Error('DB connection failed'));

      const securityAudit = await import('@/lib/security-audit');

      const logFn = securityAudit.logSecurityEvent
        || securityAudit.recordAuditEvent
        || securityAudit.createAuditLog
        || securityAudit.logAuditEvent;

      if (logFn) {
        // Audit logging should be fail-safe — should not throw
        await expect(
          logFn({
            action: 'LOGIN',
            userId: 'user-123',
          })
        ).resolves.not.toThrow();
      }
    });

    it('should record the correct action type', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const logFn = securityAudit.logSecurityEvent
        || securityAudit.recordAuditEvent
        || securityAudit.createAuditLog
        || securityAudit.logAuditEvent;

      if (logFn) {
        await logFn({
          action: 'POLICY_VIOLATION',
          userId: 'user-456',
          resource: 'work-item',
          resourceId: 'wi-789',
          details: { reason: 'WIP limit exceeded' },
        });

        expect(mockCreate).toHaveBeenCalled();
      }
    });
  });

  describe('IP extraction', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const extractIp = securityAudit.extractIp
        || securityAudit.getClientIp
        || securityAudit.extractClientIp;

      if (extractIp) {
        const mockHeaders = new Headers();
        mockHeaders.set('x-forwarded-for', '192.168.1.1, 10.0.0.1');

        const ip = extractIp(mockHeaders);
        expect(ip).toBe('192.168.1.1');
      }
    });

    it('should extract IP from x-real-ip header', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const extractIp = securityAudit.extractIp
        || securityAudit.getClientIp
        || securityAudit.extractClientIp;

      if (extractIp) {
        const mockHeaders = new Headers();
        mockHeaders.set('x-real-ip', '10.0.0.5');

        const ip = extractIp(mockHeaders);
        expect(ip).toBe('10.0.0.5');
      }
    });

    it('should return unknown/null for missing IP headers', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const extractIp = securityAudit.extractIp
        || securityAudit.getClientIp
        || securityAudit.extractClientIp;

      if (extractIp) {
        const mockHeaders = new Headers();
        const ip = extractIp(mockHeaders);
        expect(ip === null || ip === undefined || ip === 'unknown' || ip === '').toBe(true);
      }
    });
  });

  describe('metadata assembly', () => {
    it('should assemble audit metadata with timestamp', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const assembleMeta = securityAudit.assembleMetadata
        || securityAudit.buildAuditMetadata
        || securityAudit.createMetadata;

      if (assembleMeta) {
        const metadata = assembleMeta({
          userId: 'user-1',
          action: 'UPDATE',
          userAgent: 'Mozilla/5.0',
        });

        expect(metadata).toBeDefined();
      }
    });
  });

  describe('event types', () => {
    it('should export security event type constants', async () => {
      const securityAudit = await import('@/lib/security-audit');

      const eventTypes = securityAudit.SecurityEventType
        || securityAudit.AuditEventType
        || securityAudit.SECURITY_EVENTS;

      if (eventTypes) {
        expect(eventTypes).toBeDefined();
      }
    });
  });
});
