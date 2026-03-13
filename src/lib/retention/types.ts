export type RetentionStatus =
  | "Healthy"
  | "Watch"
  | "At Risk"
  | "Onboarding Risk"
  | "Billing Risk";

export type RetentionLifecyclePhase = "ONBOARDING" | "MATURE";

export type RetentionReasonSeverity = "info" | "warning" | "critical";

export type RetentionReasonDimension =
  | "usage"
  | "adoption"
  | "support"
  | "billing"
  | "onboarding"
  | "commercial"
  | "data";

export interface RetentionReasonCode {
  code: string;
  label: string;
  detail: string;
  severity: RetentionReasonSeverity;
  dimension: RetentionReasonDimension;
}

export type LirComparator = "gte" | "lte";

export interface LirDefinition {
  id: string;
  label: string;
  lifecyclePhase: RetentionLifecyclePhase;
  metricKey: string;
  comparator: LirComparator;
  threshold: number;
  windowLabel: string;
  description: string;
  rationale: string;
}

export interface RetentionMetricValue {
  value: number | null;
  label: string;
  helpText?: string;
}

export interface RetentionSummaryKpi {
  label: string;
  value: number;
  helpText: string;
}

export interface RetentionSegmentRollup {
  segmentKey: string;
  label: string;
  tenants: number;
  lirPassRate: number;
  atRiskRate: number;
}

export interface RetentionSummary {
  generatedAt: string;
  lirDefinition: LirDefinition;
  totals: {
    tenants: number;
    activeTenants: number;
    lirPassingTenants: number;
    atRiskTenants: number;
    onboardingRiskTenants: number;
    billingRiskTenants: number;
  };
  kpis: RetentionSummaryKpi[];
  byIcp: RetentionSegmentRollup[];
  byPlan: RetentionSegmentRollup[];
  byAgeBucket: RetentionSegmentRollup[];
  sharpDeclines: RetentionTenantRow[];
  onboardingMisses: RetentionTenantRow[];
  supportHeavyHighUsage: RetentionTenantRow[];
  billingRiskAccounts: RetentionTenantRow[];
  cohorts: Array<{
    cohortMonth: string;
    tenants: number;
    lirPassRate: number;
    activeAfter180dRate: number | null;
  }>;
  dataCoverage: Array<{
    source: string;
    tenantsCovered: number;
    totalTenants: number;
    coveragePct: number;
  }>;
}

export interface RetentionTenantRow {
  customerRecordId: string;
  tenantName: string;
  status: RetentionStatus;
  lifecyclePhase: RetentionLifecyclePhase;
  primaryLirPassed: boolean;
  primaryLirLabel: string;
  primaryLirValue: number | null;
  primaryLirThreshold: number | null;
  currentMonthActivity: number | null;
  trendVsPriorPct: number | null;
  supportRisk: boolean;
  billingRisk: boolean;
  onboardingRisk: boolean;
  icp: boolean;
  ownerName: string | null;
  segment: string | null;
  plan: string | null;
  ageBucket: string | null;
  reasonCodes: RetentionReasonCode[];
  lastMaterializedAt: string;
}

export interface RetentionTimelinePoint {
  monthStart: string;
  primaryLirPassed: boolean;
  primaryLirValue: number | null;
  currentMonthActivity: number | null;
  orderCount: number | null;
  cardTouches: number | null;
  itemTouches: number | null;
  activeWeeksTrailing8: number | null;
  recentBaselineRatio: number | null;
  supportTickets30d: number | null;
  mrr: number | null;
  status: RetentionStatus | null;
}

export interface RetentionTenantDetail {
  generatedAt: string;
  lirDefinition: LirDefinition;
  tenant: RetentionTenantRow & {
    goLiveDate: string | null;
    subscriptionStartDate: string | null;
    firstOrderDate: string | null;
    implementationStage: string | null;
    commercial: Record<string, unknown>;
    supportSummary: Record<string, unknown>;
    billingSummary: Record<string, unknown>;
    usageSummary: Record<string, unknown>;
    adoptionSummary: Record<string, unknown>;
    coverage: RetentionCoveragePayload;
    explanation: string;
  };
  timeline: RetentionTimelinePoint[];
}

export interface RetentionTenantFilterInput {
  status?: string | null;
  plan?: string | null;
  icp?: string | null;
  owner?: string | null;
  segment?: string | null;
  lifecyclePhase?: string | null;
  ageBucket?: string | null;
  search?: string | null;
}

export interface RetentionFeaturePayload {
  commercial: Record<string, unknown>;
  usage: Record<string, unknown>;
  adoption: Record<string, unknown>;
  support: Record<string, unknown>;
  billing: Record<string, unknown>;
  overlays: Record<string, unknown>;
  candidateMetrics: Record<string, number | boolean | null>;
  timelines?: Record<string, unknown>;
}

export interface RetentionOutcomePayload {
  churnWithin90d: boolean;
  churnWithin180d: boolean;
  activeAfter180d: boolean | null;
  contractionWithin90d: boolean;
  supportDistress: boolean;
  usageCollapse: boolean;
}

export interface RetentionCoveragePayload {
  arda: boolean;
  coda: boolean;
  stripe: boolean;
  hubspot: boolean;
  pylon: boolean;
  missingSources: string[];
}

export interface RetentionCurrentDetailPayload {
  goLiveDate: string | null;
  subscriptionStartDate: string | null;
  firstOrderDate: string | null;
  implementationStage: string | null;
  commercial: Record<string, unknown>;
  supportSummary: Record<string, unknown>;
  billingSummary: Record<string, unknown>;
  usageSummary: Record<string, unknown>;
  adoptionSummary: Record<string, unknown>;
  coverage: RetentionCoveragePayload;
  explanation: string;
}

export interface RetentionAnalysisCandidateResult {
  definition: LirDefinition;
  coverage: number;
  lift: number;
  segmentSpread: number;
  interpretabilityScore: number;
  score: number;
  label: string;
}
