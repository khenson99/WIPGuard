import type { LirDefinition, RetentionLifecyclePhase } from "@/lib/retention/types";

export const RETENTION_FEATURE_VERSION = "v1";

export const RETENTION_CANDIDATE_LIRS: LirDefinition[] = [
  {
    id: "onboarding-first-order",
    label: "Time to first order",
    lifecyclePhase: "ONBOARDING",
    metricKey: "timeToFirstOrderDays",
    comparator: "lte",
    threshold: 21,
    windowLabel: "First 30 days",
    description: "Tenant places its first meaningful order within 21 days of go-live.",
    rationale: "Early value realization is the cleanest onboarding-stage proxy for future retention.",
  },
  {
    id: "onboarding-active-days",
    label: "Meaningful activity days",
    lifecyclePhase: "ONBOARDING",
    metricKey: "daysActiveLast30",
    comparator: "gte",
    threshold: 6,
    windowLabel: "Last 30 days",
    description: "Tenant shows repeated operational activity across six or more days in the last 30 days.",
    rationale: "Repeated activity is stronger than one-time setup completion.",
  },
  {
    id: "mature-active-weeks",
    label: "Active weeks trailing 8",
    lifecyclePhase: "MATURE",
    metricKey: "activeWeeksTrailing8",
    comparator: "gte",
    threshold: 5,
    windowLabel: "Trailing 8 weeks",
    description: "Tenant is active in at least five of the last eight weeks.",
    rationale: "Habitual weekly operations are usually the clearest signal of embedded workflow value.",
  },
  {
    id: "mature-recent-baseline",
    label: "Recent activity vs baseline",
    lifecyclePhase: "MATURE",
    metricKey: "recentBaselineRatio",
    comparator: "gte",
    threshold: 0.7,
    windowLabel: "Last 30 vs trailing 90 days",
    description: "Current activity stays above 70% of the trailing baseline.",
    rationale: "Current-month collapse is more actionable than historical average usage.",
  },
  {
    id: "mature-orders-cadence",
    label: "Monthly order cadence",
    lifecyclePhase: "MATURE",
    metricKey: "ordersPerMonth",
    comparator: "gte",
    threshold: 8,
    windowLabel: "Current month",
    description: "Tenant sustains at least eight order events in the current month.",
    rationale: "Order throughput is the most direct signal of recurring operational value for Arda.",
  },
];

export const DEFAULT_RETENTION_LIR_BY_PHASE: Record<RetentionLifecyclePhase, LirDefinition> = {
  ONBOARDING: RETENTION_CANDIDATE_LIRS[0],
  MATURE: RETENTION_CANDIDATE_LIRS[2],
};

export const RETENTION_STATUS_HELP = {
  Healthy: "Tenant is meeting the primary LIR and has no severe support, billing, or onboarding blockers.",
  Watch: "Tenant is below the ideal LIR threshold or showing soft deterioration that needs operator review.",
  "At Risk": "Tenant is failing the primary LIR with evidence of collapse, support distress, or strong contraction risk.",
  "Onboarding Risk": "Tenant has not reached first value or early habit thresholds in the expected onboarding window.",
  "Billing Risk": "Tenant has meaningful billing distress regardless of usage behavior and needs commercial intervention.",
} as const;
