export type CustomerLifecycleStage =
  | "ONBOARDING"
  | "ADOPTION"
  | "ACTIVE"
  | "EXPANSION"
  | "RENEWAL"
  | "AT_RISK"
  | "CHURNED";

export type CustomerRecordStatus = "ACTIVE" | "ARCHIVED" | "MERGED";

export type CustomerExternalProvider =
  | "INTERNAL"
  | "HUBSPOT"
  | "STRIPE"
  | "PYLON"
  | "CODA"
  | "SLACK"
  | "GOOGLE_WORKSPACE";

export type CustomerSuccessNoteSource =
  | "MANUAL"
  | "MEETING"
  | "SUPPORT"
  | "CRM"
  | "AI"
  | "SYSTEM";

export type CustomerSuccessNoteVisibility = "INTERNAL" | "RESTRICTED";

export type CustomerSuccessPlanStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type CustomerSuccessMilestoneStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED";

export type CustomerSuccessAlertCategory = "RISK" | "OPPORTUNITY" | "ACTION_REQUIRED";

export type CustomerSuccessAlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CustomerSuccessAlertStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";

export type CustomerSuccessSlaStatus = "NONE" | "ON_TRACK" | "AT_RISK" | "BREACHED";

export type CustomerSuccessAlertSource =
  | "HEALTH"
  | "SUPPORT"
  | "COMMERCIAL"
  | "RELATIONSHIP"
  | "WORKFLOW";

export type CustomerSuccessOutreachChannel = "EMAIL" | "SLACK";

export type CustomerSuccessOutreachStatus = "DRAFT" | "QUEUED" | "SENT" | "FAILED" | "CANCELED";

export type CustomerSuccessHealthTrend = "improving" | "stable" | "declining";

export type CustomerSuccessHealthStatus = "healthy" | "watch" | "risk";

export type CustomerSuccessHealthGrade = "A" | "B" | "C" | "D" | "F";

export interface CustomerRecordEntity {
  id: string;
  organizationId: string | null;
  name: string;
  segment: string | null;
  tier: string | null;
  lifecycleStage: CustomerLifecycleStage;
  status: CustomerRecordStatus;
  ownerId: string | null;
  dealCompanyId: string | null;
  primaryDealId: string | null;
  mergedIntoId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRecordExternalRefEntity {
  id: string;
  organizationId: string | null;
  customerRecordId: string;
  provider: CustomerExternalProvider;
  externalObjectType: string;
  externalId: string;
  label: string | null;
  isPrimary: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessNoteEntity {
  id: string;
  organizationId: string | null;
  customerRecordId: string;
  authorUserId: string | null;
  title: string | null;
  body: string;
  source: CustomerSuccessNoteSource;
  visibility: CustomerSuccessNoteVisibility;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessPlanMilestoneEntity {
  id: string;
  organizationId: string | null;
  planId: string;
  title: string;
  description: string | null;
  status: CustomerSuccessMilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
  linkedTaskId: string | null;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessPlanEntity {
  id: string;
  organizationId: string | null;
  customerRecordId: string;
  name: string;
  templateKey: string | null;
  status: CustomerSuccessPlanStatus;
  ownerUserId: string | null;
  startedAt: string | null;
  targetDate: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
  milestones: CustomerSuccessPlanMilestoneEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessAlertEntity {
  id: string;
  organizationId: string | null;
  customerRecordId: string;
  alertKey: string;
  title: string;
  category: CustomerSuccessAlertCategory;
  severity: CustomerSuccessAlertSeverity;
  status: CustomerSuccessAlertStatus;
  slaStatus: CustomerSuccessSlaStatus;
  source: CustomerSuccessAlertSource;
  evidence: unknown[] | null;
  suggestedAction: string | null;
  ownerUserId: string | null;
  linkedTaskId: string | null;
  openedAt: string;
  resolvedAt: string | null;
  lastEvaluatedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessOutreachMessageEntity {
  id: string;
  organizationId: string | null;
  customerRecordId: string;
  authorUserId: string | null;
  channel: CustomerSuccessOutreachChannel;
  status: CustomerSuccessOutreachStatus;
  templateKey: string | null;
  recipientName: string | null;
  recipientAddress: string;
  subject: string | null;
  body: string;
  providerMessageId: string | null;
  providerThreadId: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessHealthComponent {
  score: number;
  weight: number;
  weightedScore: number;
  trend: CustomerSuccessHealthTrend;
  status: CustomerSuccessHealthStatus;
  evidence: string[];
  lastUpdatedAt: string;
}

export interface CustomerSuccessLeadingIndicator {
  label: string;
  score: number;
  status: CustomerSuccessHealthStatus;
  value: string;
  evidence: string[];
}

export interface CustomerSuccessHealth {
  score: number;
  grade: CustomerSuccessHealthGrade;
  trend: CustomerSuccessHealthTrend;
  confidence: number;
  updatedAt: string;
  components: {
    adoption: CustomerSuccessHealthComponent;
    engagement: CustomerSuccessHealthComponent;
    relationship: CustomerSuccessHealthComponent;
    support: CustomerSuccessHealthComponent;
    commercial: CustomerSuccessHealthComponent;
  };
  leadingIndicators: {
    recency: CustomerSuccessLeadingIndicator;
    cadence: CustomerSuccessLeadingIndicator;
    consistency: CustomerSuccessLeadingIndicator;
    depth: CustomerSuccessLeadingIndicator;
    breadth: CustomerSuccessLeadingIndicator;
  };
}

export interface CustomerSuccessAlert {
  id: string;
  accountId: string;
  title: string;
  category: "risk" | "opportunity" | "action_required";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  slaStatus: "none" | "on_track" | "at_risk" | "breached";
  source: "health" | "support" | "commercial" | "relationship" | "workflow";
  evidence: string[];
  suggestedAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessEvent {
  id: string;
  accountId: string;
  type: "support" | "product" | "workflow" | "commercial" | "relationship" | "lifecycle";
  title: string;
  description?: string;
  actorName?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CustomerSuccessStakeholder {
  id: string;
  name: string;
  email?: string;
  role: string;
  coverageStatus?: "covered" | "missing" | "stale";
  lastTouchAt?: string;
}

export interface CustomerSuccessTaskSummary {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  priority?: string;
}

export interface CustomerSuccessProviderLink {
  provider: CustomerExternalProvider;
  externalObjectType: string;
  externalId: string;
  label?: string;
  isPrimary: boolean;
  url?: string;
}

export interface CustomerSuccessRelationshipReason {
  code: string;
  label: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  dimension: "usage" | "adoption" | "support" | "billing" | "onboarding" | "commercial" | "data";
}

export interface CustomerSuccessRetentionSummary {
  status: string;
  lifecyclePhase: "ONBOARDING" | "MATURE";
  primaryLirLabel: string;
  primaryLirPassed: boolean;
  primaryLirValue?: number;
  primaryLirThreshold?: number;
  currentMonthActivity?: number;
  trendVsPriorPct?: number;
  implementationStage?: string;
  goLiveDate?: string;
  subscriptionStartDate?: string;
  firstOrderDate?: string;
  explanation?: string;
  reasonCodes: CustomerSuccessRelationshipReason[];
  ardaAdoptionCountsSource?: "ARDA_ACTIVITY" | "ARDA_USER_DETAILS" | "NONE";
  ardaDirectActivityCounts?: {
    orders: number;
    cards: number;
    items: number;
  };
  ardaUserDetailsCounts?: {
    orders: number;
    cards: number;
    items: number;
  };
  coverage: {
    arda: boolean;
    coda: boolean;
    stripe: boolean;
    hubspot: boolean;
    pylon: boolean;
    ardaActivityCollectionAvailable?: boolean;
    ardaUserDetailsFallback?: boolean;
    missingSources: string[];
  };
  detailUrl: string;
}

export interface CustomerSuccessCodaSummary {
  customerStatus?: string;
  configuredHealth?: string;
  mainDocId?: string;
  orderArchiveDocumentId?: string;
  mainDocUrl?: string;
  orderArchiveDocumentUrl?: string;
  lastOrderAt?: string;
  sourceRecordCount: number;
}

export interface CustomerSuccessArdaSummary {
  tenantId?: string;
  configuredTenantId?: string;
  tenantName?: string;
  companyName?: string;
  customerStatus?: string;
  configuredHealth?: string;
  implementationStage?: string;
  sourceRecordCount: number;
}

export interface CustomerSuccessRelationshipIntelligence {
  connectedSystems: number;
  providers: CustomerSuccessProviderLink[];
  retention?: CustomerSuccessRetentionSummary;
  arda?: CustomerSuccessArdaSummary;
  coda?: CustomerSuccessCodaSummary;
}

export interface CustomerSuccessPortfolioRelationshipSummary {
  connectedSystems: number;
  retentionStatus?: string;
  primaryLirPassed?: boolean;
  implementationStage?: string;
  ardaAdoptionCountsSource?: "ARDA_ACTIVITY" | "ARDA_USER_DETAILS" | "NONE";
  missingSources: string[];
}

export interface CustomerSuccessPortfolioAccount {
  accountId: string;
  name: string;
  segment?: string;
  tier?: string;
  ownerName?: string;
  health: CustomerSuccessHealth;
  lastActivityAt?: string;
  activeUsers30d?: number;
  renewalDate?: string;
  openAlertCount: number;
  relationship?: CustomerSuccessPortfolioRelationshipSummary;
}

export interface CustomerSuccessPortfolio {
  generatedAt: string;
  summary: {
    totalAccounts: number;
    avgHealthScore: number;
    atRiskAccounts: number;
    openAlerts: number;
  };
  relationshipOps?: {
    lastCompletedAt?: string;
    sources: Array<{
      source: string;
      status: "SUCCESS" | "PARTIAL" | "ERROR";
      completedAt?: string;
      recordCount: number;
      mappedCount: number;
      errorCount: number;
      lastError?: string;
    }>;
  };
  healthDistribution: Array<{
    label: CustomerSuccessHealthGrade;
    count: number;
  }>;
  attentionAccounts: Array<{
    accountId: string;
    name: string;
    ownerName?: string;
    health: CustomerSuccessHealth;
    openAlertCount: number;
    lifecycleStage: string;
    nextAction?: string;
    relationship?: CustomerSuccessPortfolioRelationshipSummary;
  }>;
  alerts: CustomerSuccessAlert[];
  recentActivity: CustomerSuccessEvent[];
  accounts: CustomerSuccessPortfolioAccount[];
}

export interface CustomerSuccessAlertFeed {
  generatedAt: string;
  summary: {
    total: number;
    open: number;
    inProgress: number;
    breached: number;
    critical: number;
  };
  alerts: CustomerSuccessAlert[];
}

export interface CustomerSuccessActivityFeed {
  generatedAt: string;
  events: CustomerSuccessEvent[];
}

export interface CustomerSuccessAccountDetail {
  accountId: string;
  name: string;
  segment?: string;
  tier?: string;
  lifecycleStage: string;
  ownerName?: string;
  health: CustomerSuccessHealth;
  alerts: CustomerSuccessAlert[];
  timeline: CustomerSuccessEvent[];
  stakeholders: CustomerSuccessStakeholder[];
  tasks: CustomerSuccessTaskSummary[];
  successPlan: {
    templateKey?: string;
    milestones: Array<{
      id: string;
      title: string;
      status: string;
      dueDate?: string;
    }>;
  };
  outreach: {
    recommendedTemplates: string[];
    recentMessages: Array<{
      id: string;
      subject: string;
      sentAt?: string;
      status: string;
    }>;
  };
  commercial?: {
    arr?: number;
    renewalDate?: string;
    paymentStatus?: string;
    expansionPotential?: string;
  };
  relationshipIntelligence?: CustomerSuccessRelationshipIntelligence;
}

export interface CreateCustomerSuccessNoteInput {
  accountId: string;
  title?: string;
  body: string;
  source?: CustomerSuccessNoteSource;
  visibility?: CustomerSuccessNoteVisibility;
  metadata?: Record<string, unknown>;
}

export interface CreateCustomerSuccessPlanInput {
  accountId: string;
  name: string;
  templateKey?: string;
  targetDate?: string;
  milestoneTitles?: string[];
}

export interface UpdateCustomerSuccessAlertStatusInput {
  accountId: string;
  alertId: string;
  status: CustomerSuccessAlertStatus;
}

export interface CreateCustomerSuccessTaskInput {
  accountId: string;
  title: string;
  notes?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  responsibleIds?: string[];
  accountableIds?: string[];
  consultedIds?: string[];
  informedIds?: string[];
}

export interface SendCustomerSuccessOutreachInput {
  accountId: string;
  channel: CustomerSuccessOutreachChannel;
  recipientAddress: string;
  recipientName?: string;
  templateKey?: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}
