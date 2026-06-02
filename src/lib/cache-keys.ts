/**
 * Centralized cache key definitions and TTL constants.
 * All TTLs are in seconds.
 */

// === TTL Constants ===
export const CACHE_TTL = {
  /** Company priorities — changes monthly */
  COMPANY_PRIORITIES: 300, // 5 minutes

  /** Department list — changes weekly */
  DEPARTMENTS: 120, // 2 minutes

  /** Team member list — changes weekly */
  TEAM_MEMBERS: 120, // 2 minutes

  /** Integration connection status — changes on reconnect */
  INTEGRATION_STATUS: 60, // 1 minute

  /** Analytics snapshots */
  ANALYTICS: 120, // 2 minutes

  /** User session data */
  USER_SESSION: 300, // 5 minutes
} as const;

// === Key Generators ===

/** Company-scoped keys */
export const cacheKeys = {
  // Company priorities
  companyPriorities: (companyId: string) =>
    `company:${companyId}:priorities`,
  companyPrioritiesPattern: (companyId: string) =>
    `company:${companyId}:priorities*`,

  // Departments
  departments: (companyId: string) =>
    `company:${companyId}:departments`,
  departmentsPattern: (companyId: string) =>
    `company:${companyId}:departments*`,
  department: (companyId: string, departmentId: string) =>
    `company:${companyId}:departments:${departmentId}`,

  // Team members
  teamMembers: (companyId: string) =>
    `company:${companyId}:team-members`,
  teamMembersPattern: (companyId: string) =>
    `company:${companyId}:team-members*`,
  teamMember: (companyId: string, memberId: string) =>
    `company:${companyId}:team-members:${memberId}`,

  // Integration status
  integrationStatus: (companyId: string) =>
    `company:${companyId}:integrations`,
  integrationStatusPattern: (companyId: string) =>
    `company:${companyId}:integrations*`,

  // Analytics
  analytics: (companyId: string, type: string) =>
    `company:${companyId}:analytics:${type}`,
  analyticsPattern: (companyId: string) =>
    `company:${companyId}:analytics*`,

  // User-scoped
  userSession: (userId: string) =>
    `user:${userId}:session`,

  // Wildcard for full company cache clear
  companyAll: (companyId: string) =>
    `company:${companyId}:*`,
} as const;
