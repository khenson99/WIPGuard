/**
 * Unit tests for organization utilities.
 *
 * These tests verify the helper functions for multi-tenant
 * organization support without requiring a database connection.
 */

import { withOrgScope, DEFAULT_ORG_ID } from '../organization';

describe('Organization utilities', () => {
  describe('DEFAULT_ORG_ID', () => {
    it('should be a non-empty string', () => {
      expect(DEFAULT_ORG_ID).toBeTruthy();
      expect(typeof DEFAULT_ORG_ID).toBe('string');
      expect(DEFAULT_ORG_ID.length).toBeGreaterThan(0);
    });
  });

  describe('withOrgScope', () => {
    it('should add organizationId to an empty where clause', () => {
      const result = withOrgScope({}, 'org_123');
      expect(result).toEqual({ organizationId: 'org_123' });
    });

    it('should add organizationId to an existing where clause', () => {
      const result = withOrgScope({ status: 'active' }, 'org_456');
      expect(result).toEqual({
        status: 'active',
        organizationId: 'org_456',
      });
    });

    it('should override existing organizationId in where clause', () => {
      const result = withOrgScope(
        { organizationId: 'org_old', name: 'test' } as Record<string, unknown>,
        'org_new'
      );
      expect(result.organizationId).toBe('org_new');
      expect(result.name).toBe('test');
    });

    it('should preserve complex where clauses', () => {
      const complexWhere = {
        status: 'active',
        priority: 'high',
        createdAt: { gte: new Date('2024-01-01') },
      };
      const result = withOrgScope(complexWhere, 'org_complex');
      expect(result).toEqual({
        ...complexWhere,
        organizationId: 'org_complex',
      });
    });

    it('should not mutate the original where clause', () => {
      const original = { status: 'active' };
      const result = withOrgScope(original, 'org_789');
      expect(original).toEqual({ status: 'active' });
      expect(result).not.toBe(original);
    });
  });
});
