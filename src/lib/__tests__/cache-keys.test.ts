import { describe, it, expect } from 'vitest';
import { cacheKeys, CACHE_TTL } from '../cache-keys';

describe('cache-keys', () => {
  describe('CACHE_TTL', () => {
    it('should have correct TTL values', () => {
      expect(CACHE_TTL.COMPANY_PRIORITIES).toBe(300);
      expect(CACHE_TTL.DEPARTMENTS).toBe(120);
      expect(CACHE_TTL.TEAM_MEMBERS).toBe(120);
      expect(CACHE_TTL.PROJECTS).toBe(60);
      expect(CACHE_TTL.WIP_POLICIES).toBe(300);
      expect(CACHE_TTL.INTEGRATION_STATUS).toBe(60);
      expect(CACHE_TTL.ANALYTICS).toBe(120);
      expect(CACHE_TTL.USER_SESSION).toBe(300);
    });
  });

  describe('cacheKeys', () => {
    const companyId = 'comp-123';
    const departmentId = 'dept-456';
    const memberId = 'member-789';
    const projectId = 'proj-abc';
    const userId = 'user-def';

    it('should generate correct company priority keys', () => {
      expect(cacheKeys.companyPriorities(companyId)).toBe(
        'company:comp-123:priorities'
      );
      expect(cacheKeys.companyPrioritiesPattern(companyId)).toBe(
        'company:comp-123:priorities*'
      );
    });

    it('should generate correct department keys', () => {
      expect(cacheKeys.departments(companyId)).toBe(
        'company:comp-123:departments'
      );
      expect(cacheKeys.department(companyId, departmentId)).toBe(
        'company:comp-123:departments:dept-456'
      );
      expect(cacheKeys.departmentsPattern(companyId)).toBe(
        'company:comp-123:departments*'
      );
    });

    it('should generate correct team member keys', () => {
      expect(cacheKeys.teamMembers(companyId)).toBe(
        'company:comp-123:team-members'
      );
      expect(cacheKeys.teamMember(companyId, memberId)).toBe(
        'company:comp-123:team-members:member-789'
      );
    });

    it('should generate correct project keys', () => {
      expect(cacheKeys.projects(companyId)).toBe(
        'company:comp-123:projects'
      );
      expect(cacheKeys.project(companyId, projectId)).toBe(
        'company:comp-123:projects:proj-abc'
      );
    });

    it('should generate correct WIP policy keys', () => {
      expect(cacheKeys.wipPolicies(companyId)).toBe(
        'company:comp-123:wip-policies'
      );
    });

    it('should generate correct integration status keys', () => {
      expect(cacheKeys.integrationStatus(companyId)).toBe(
        'company:comp-123:integrations'
      );
    });

    it('should generate correct analytics keys', () => {
      expect(cacheKeys.analytics(companyId, 'flow')).toBe(
        'company:comp-123:analytics:flow'
      );
    });

    it('should generate correct user session keys', () => {
      expect(cacheKeys.userSession(userId)).toBe(
        'user:user-def:session'
      );
    });

    it('should generate wildcard pattern for full company cache', () => {
      expect(cacheKeys.companyAll(companyId)).toBe(
        'company:comp-123:*'
      );
    });
  });
});
