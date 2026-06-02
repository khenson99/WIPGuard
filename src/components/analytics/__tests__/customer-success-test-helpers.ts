import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";

type HealthGrade = "A" | "B" | "C" | "D" | "F";
type IndicatorKey = "recency" | "cadence" | "consistency" | "depth" | "breadth";

interface MakeHealthInput {
  score?: number;
  grade?: HealthGrade;
  indicatorScores?: Partial<Record<IndicatorKey, number>>;
  indicatorValues?: Partial<Record<IndicatorKey, string>>;
}

const DEFAULT_INDICATOR_VALUES: Record<IndicatorKey, string> = {
  recency: "7d since touch",
  cadence: "3 touches / 30d",
  consistency: "3/3 months active",
  depth: "2/3 milestones done",
  breadth: "2/3 stakeholders covered",
};

export function makeHealth(input: MakeHealthInput = {}): CustomerSuccessPortfolio["accounts"][number]["health"] {
  const score = input.score ?? 75;
  const grade = input.grade ?? "B";
  const indicatorScores: Record<IndicatorKey, number> = {
    recency: input.indicatorScores?.recency ?? score,
    cadence: input.indicatorScores?.cadence ?? score,
    consistency: input.indicatorScores?.consistency ?? score,
    depth: input.indicatorScores?.depth ?? score,
    breadth: input.indicatorScores?.breadth ?? score,
  };
  const indicatorValues = {
    ...DEFAULT_INDICATOR_VALUES,
    ...input.indicatorValues,
  };

  return {
    score,
    grade,
    trend: "stable",
    confidence: 82,
    updatedAt: "2026-03-10T00:00:00.000Z",
    components: {
      adoption: {
        score,
        weight: 0.24,
        weightedScore: score * 0.24,
        trend: "stable",
        status: "watch",
        evidence: ["Usage stable"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      engagement: {
        score,
        weight: 0.22,
        weightedScore: score * 0.22,
        trend: "stable",
        status: "watch",
        evidence: ["Meetings steady"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      relationship: {
        score,
        weight: 0.2,
        weightedScore: score * 0.2,
        trend: "stable",
        status: "healthy",
        evidence: ["Champion engaged"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      support: {
        score,
        weight: 0.2,
        weightedScore: score * 0.2,
        trend: "stable",
        status: "watch",
        evidence: ["Queue manageable"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      commercial: {
        score,
        weight: 0.14,
        weightedScore: score * 0.14,
        trend: "stable",
        status: "healthy",
        evidence: ["Renewal tracked"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
    },
    leadingIndicators: {
      recency: {
        label: "Activity recency",
        score: indicatorScores.recency,
        status: indicatorScores.recency < 65 ? "risk" : "watch",
        value: indicatorValues.recency,
        evidence: ["Recent customer-facing touch found"],
      },
      cadence: {
        label: "Touch cadence",
        score: indicatorScores.cadence,
        status: indicatorScores.cadence < 65 ? "risk" : "watch",
        value: indicatorValues.cadence,
        evidence: ["Follow-up rhythm is steady"],
      },
      consistency: {
        label: "Touch consistency",
        score: indicatorScores.consistency,
        status: indicatorScores.consistency < 65 ? "risk" : "watch",
        value: indicatorValues.consistency,
        evidence: ["No large touch gaps"],
      },
      depth: {
        label: "Execution depth",
        score: indicatorScores.depth,
        status: indicatorScores.depth < 65 ? "risk" : "watch",
        value: indicatorValues.depth,
        evidence: ["Plan is moving forward"],
      },
      breadth: {
        label: "Relationship breadth",
        score: indicatorScores.breadth,
        status: indicatorScores.breadth < 65 ? "risk" : "healthy",
        value: indicatorValues.breadth,
        evidence: ["Champion engaged"],
      },
    },
  };
}

export function makeAccount(
  accountId: string,
  input: Partial<CustomerSuccessPortfolio["accounts"][number]> & {
    health?: CustomerSuccessPortfolio["accounts"][number]["health"];
  } = {}
): CustomerSuccessPortfolio["accounts"][number] {
  return {
    accountId,
    name: input.name ?? accountId,
    ownerName: input.ownerName ?? "Owner",
    health: input.health ?? makeHealth(),
    openAlertCount: input.openAlertCount ?? 0,
    lastActivityAt: input.lastActivityAt ?? "2026-03-10T00:00:00.000Z",
    renewalDate: input.renewalDate ?? "2026-06-01T00:00:00.000Z",
    segment: input.segment,
    tier: input.tier,
    relationship: input.relationship,
  };
}

export function makePortfolio(): CustomerSuccessPortfolio {
  return {
    generatedAt: "2026-03-10T08:00:00.000Z",
    summary: {
      totalAccounts: 12,
      avgHealthScore: 74,
      atRiskAccounts: 3,
      openAlerts: 6,
    },
    relationshipOps: {
      lastCompletedAt: "2026-03-10T09:30:00.000Z",
      sources: [
        {
          source: "CODA",
          status: "SUCCESS",
          completedAt: "2026-03-10T09:30:00.000Z",
          recordCount: 120,
          mappedCount: 110,
          errorCount: 0,
        },
        {
          source: "PYLON",
          status: "PARTIAL",
          completedAt: "2026-03-10T09:28:00.000Z",
          recordCount: 15,
          mappedCount: 10,
          errorCount: 2,
          lastError: "2 issue rows failed",
        },
      ],
    },
    healthDistribution: [
      { label: "A", count: 2 },
      { label: "B", count: 4 },
      { label: "C", count: 3 },
      { label: "D", count: 2 },
      { label: "F", count: 1 },
    ],
    attentionAccounts: [
      {
        accountId: "acct_1",
        name: "Acme Co",
        ownerName: "Casey",
        health: makeHealth({ score: 58, grade: "D" }),
        openAlertCount: 2,
        lifecycleStage: "AT_RISK",
        relationship: {
          connectedSystems: 3,
          retentionStatus: "At Risk",
          primaryLirPassed: false,
          implementationStage: "LIVE",
          missingSources: ["pylon"],
        },
        nextAction: "Schedule exec check-in",
      },
    ],
    alerts: [
      {
        id: "alert_1",
        accountId: "acct_1",
        title: "Renewal risk rising",
        category: "risk",
        severity: "high",
        status: "open",
        slaStatus: "at_risk",
        source: "commercial",
        evidence: ["Renewal in 45 days"],
        suggestedAction: "Confirm champion and rollout plan",
        createdAt: "2026-03-09T10:00:00.000Z",
        updatedAt: "2026-03-10T08:00:00.000Z",
      },
    ],
    recentActivity: [
      {
        id: "event_1",
        accountId: "acct_1",
        type: "relationship",
        title: "QBR completed",
        description: "Exec sponsor joined the call",
        occurredAt: "2026-03-09T12:00:00.000Z",
      },
    ],
    accounts: [
      makeAccount("acct_2", {
          name: "Beacon Ltd",
          segment: "Enterprise",
          tier: "Strategic",
          ownerName: "Morgan",
          health: makeHealth({ score: 88, grade: "A" }),
          lastActivityAt: "2026-03-10T12:00:00.000Z",
          renewalDate: "2026-05-30T00:00:00.000Z",
          openAlertCount: 5,
          relationship: {
            connectedSystems: 2,
            retentionStatus: "Healthy",
            primaryLirPassed: true,
            implementationStage: "LIVE",
            missingSources: [],
          },
        }),
      makeAccount("acct_1", {
          name: "Acme Co",
          segment: "Mid-market",
          tier: "Growth",
          ownerName: "Casey",
          health: makeHealth({ score: 58, grade: "D" }),
          lastActivityAt: "2026-03-09T12:00:00.000Z",
          renewalDate: "2026-04-20T00:00:00.000Z",
          openAlertCount: 2,
          relationship: {
            connectedSystems: 3,
            retentionStatus: "At Risk",
            primaryLirPassed: false,
            implementationStage: "LIVE",
            missingSources: ["pylon"],
          },
        }),
    ],
  };
}

export function makeAnalyticsData(): AnalyticsDashboardData {
  return {
    freshness: {
      google_workspace: { status: "CONNECTED", stale: false },
      slack: { status: "CONNECTED", stale: true },
      coda: { status: "CONNECTED", stale: false },
    },
    pylon: {
      openConversations: 28,
      urgentConversations: 18,
    },
    product: {
      deliveryBalance: 8,
      deliveryRate: 62.4,
      cycleTimeRiskSignals: 9,
    },
    coda: {
      totalCards: 42,
    },
    slack: {
      enabledRules: 2,
      totalRules: 2,
      trend: [{ date: "2026-03-08", artifactsCreated: 2, receipts: 3 }],
    },
    googleWorkspace: {
      enabledRules: 1,
      totalRules: 1,
      trend: [{ date: "2026-03-08", artifactsCreated: 1, receipts: 1 }],
    },
    codaOps: {
      enabledRules: 3,
      totalRules: 3,
      trend: [{ date: "2026-03-08", artifactsCreated: 4, receipts: 2 }],
    },
  } as unknown as AnalyticsDashboardData;
}
