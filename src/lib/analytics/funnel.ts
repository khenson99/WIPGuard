import type {
  AnalyticsDashboardData,
  CrossFunnelAttribution,
  CrossFunnelData,
  FunnelDropoffRecord,
  FunnelInsight,
  FunnelTouchpoint,
  LifecycleFunnelData,
  LifecycleSegment,
  LifecycleStage,
  LifecycleStageId,
  LifecycleTransition,
} from "@/lib/analytics/types";

const SALES_STAGE_ORDER = [
  "Prospect",
  "Lead",
  "Demo Scheduled",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Subscription",
  "Closed Won",
] as const;

type StageDefinition = {
  id: LifecycleStageId;
  label: string;
  section: LifecycleStage["section"];
  rawVolume: (data: AnalyticsDashboardData) => number;
  trendDelta: (data: AnalyticsDashboardData) => number | null;
  evidence: (
    data: AnalyticsDashboardData,
  ) => Array<Omit<LifecycleSegment, "share">>;
};

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function normalizePct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function toTrendDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function normalizeConfidence(value: number): number {
  return Math.max(0.2, Math.min(0.98, Math.round(value * 100) / 100));
}

function withShares(
  segments: Array<Omit<LifecycleSegment, "share">>,
): LifecycleSegment[] {
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.contribution),
    0,
  );
  return segments.map((segment) => ({
    ...segment,
    share:
      total > 0 ? Math.round((segment.contribution / total) * 1000) / 10 : 0,
  }));
}

function lifecycleStageDefinitions(): StageDefinition[] {
  return [
    {
      id: "awareness",
      label: "Awareness",
      section: "website-traffic",
      rawVolume: (data) =>
        data.googleAnalytics?.users30d ??
        data.googleAnalytics?.sessions30d ??
        (data.googleAds?.totalImpressions ?? 0) +
          (data.metaAds?.totalImpressions ?? 0) +
          (data.redditAds?.totalImpressions ?? 0),
      trendDelta: (data) =>
        toTrendDelta(
          data.googleAnalytics?.users30d ?? 0,
          data.googleAnalytics?.usersPrev30d ?? 0,
        ),
      evidence: (data) => [
        {
          source: "Google Analytics",
          domain: "googleAnalytics",
          contribution: data.googleAnalytics?.users30d ?? 0,
          confidence: data.googleAnalytics ? 0.92 : 0.42,
          detail: "Unique users captured in selected range.",
        },
        {
          source: "Google Ads",
          domain: "googleAds",
          contribution: data.googleAds?.totalImpressions ?? 0,
          confidence: data.googleAds ? 0.86 : 0.35,
          detail: "Paid awareness from Google campaign impressions.",
        },
        {
          source: "Meta Ads",
          domain: "metaAds",
          contribution: data.metaAds?.totalImpressions ?? 0,
          confidence: data.metaAds ? 0.83 : 0.35,
          detail: "Paid awareness from Meta campaign impressions.",
        },
        {
          source: "Reddit Ads",
          domain: "redditAds",
          contribution: data.redditAds?.totalImpressions ?? 0,
          confidence: data.redditAds ? 0.8 : 0.3,
          detail: "Awareness from Reddit ad impressions.",
        },
      ],
    },
    {
      id: "acquisition",
      label: "Acquisition",
      section: "sales-pipeline",
      rawVolume: (data) =>
        (data.hubspot?.funnel?.demoScheduled ?? 0) +
        (data.coda?.totalCards ?? data.codaKanban?.totalCards ?? 0) +
        (data.stripe?.subscriptions?.trialing ?? 0),
      trendDelta: (data) => {
        const current =
          (data.hubspot?.funnel?.demoScheduled ?? 0) +
          (data.coda?.totalCards ?? data.codaKanban?.totalCards ?? 0) +
          (data.stripe?.subscriptions?.trialing ?? 0);
        const previous = Math.max(
          1,
          (data.googleAnalytics?.sessionsPrev30d ?? 0) * 0.04,
        );
        return toTrendDelta(current, previous);
      },
      evidence: (data) => [
        {
          source: "Demo Scheduled",
          domain: "hubspot",
          contribution: data.hubspot?.funnel?.demoScheduled ?? 0,
          confidence: data.hubspot ? 0.9 : 0.35,
          detail: "Leads that signed up for a demo.",
        },
        {
          source: "Free Kanban Cards",
          domain: "coda",
          contribution:
            data.coda?.totalCards ?? data.codaKanban?.totalCards ?? 0,
          confidence: (data.coda ?? data.codaKanban) ? 0.85 : 0.35,
          detail: "Users who created a free Kanban card.",
        },
        {
          source: "Free Trials",
          domain: "stripe",
          contribution: data.stripe?.subscriptions?.trialing ?? 0,
          confidence: data.stripe ? 0.95 : 0.35,
          detail: "Users who signed up for a free trial.",
        },
      ],
    },
    {
      id: "activation",
      label: "Activation",
      section: "sales-pipeline",
      rawVolume: (data) =>
        (data.hubspot?.funnel?.demoFollowUp ?? 0) +
        (data.coda?.engagedLeadCandidates?.length ??
          data.codaKanban?.engagedLeadCandidates?.length ??
          0),
      trendDelta: (data) => {
        const current =
          (data.hubspot?.funnel?.demoFollowUp ?? 0) +
          (data.coda?.engagedLeadCandidates?.length ??
            data.codaKanban?.engagedLeadCandidates?.length ??
            0);
        const previous = Math.max(
          1,
          (data.hubspot?.funnel?.totalDeals ?? 0) * 0.5,
        );
        return toTrendDelta(current, previous);
      },
      evidence: (data) => [
        {
          source: "HubSpot Demo Follow-Up",
          domain: "hubspot",
          contribution: data.hubspot?.funnel?.demoFollowUp ?? 0,
          confidence: data.hubspot ? 0.88 : 0.35,
          detail: "Post-demo follow-up opportunities.",
        },
        {
          source: "Engaged Kanban Users",
          domain: "coda",
          contribution:
            data.coda?.engagedLeadCandidates?.length ??
            data.codaKanban?.engagedLeadCandidates?.length ??
            0,
          confidence: (data.coda ?? data.codaKanban) ? 0.85 : 0.35,
          detail: "Active returning Kanban users evaluated for opportunities.",
        },
        {
          source: "Google Workspace Ops",
          domain: "googleWorkspace",
          contribution: data.googleWorkspace?.tasksCreatedInRange ?? 0,
          confidence: data.googleWorkspace ? 0.74 : 0.3,
          detail: "Follow-up workflow tasks generated in range.",
        },
      ],
    },
    {
      id: "revenue",
      label: "Revenue",
      section: "finance",
      rawVolume: (data) =>
        (data.hubspot?.funnel?.closedWon ?? 0) +
        (data.stripe?.subscriptions?.active ?? 0),
      trendDelta: (data) =>
        toTrendDelta(
          data.stripe?.revenue?.totalRevenue30d ?? 0,
          data.stripe?.revenue?.totalRevenuePrev30d ?? 0,
        ),
      evidence: (data) => [
        {
          source: "HubSpot Closed Won",
          domain: "hubspot",
          contribution: data.hubspot?.funnel?.closedWon ?? 0,
          confidence: data.hubspot ? 0.9 : 0.35,
          detail: "Won opportunities in selected range.",
        },
        {
          source: "Stripe Active Subscriptions",
          domain: "stripe",
          contribution: data.stripe?.subscriptions?.active ?? 0,
          confidence: data.stripe ? 0.93 : 0.35,
          detail: "Active recurring revenue accounts.",
        },
        {
          source: "Mercury Net Cash",
          domain: "stripe",
          contribution: Math.max(
            0,
            Math.round((data.mercury?.cashFlow?.netCashFlow ?? 0) / 1000),
          ),
          confidence: data.mercury ? 0.75 : 0.3,
          detail: "Bank-side cashflow proxy (normalized).",
        },
      ],
    },
    {
      id: "retention",
      label: "Retention",
      section: "customer-success",
      rawVolume: (data) =>
        (data.stripe?.subscriptions?.active ?? 0) -
        (data.stripe?.subscriptions?.canceled ?? 0) +
        (data.pylon?.resolvedInRange ?? 0),
      trendDelta: (data) => {
        const current = data.pylon?.resolvedInRange ?? 0;
        const previous = Math.max(
          1,
          current - (data.pylon?.openConversations ?? 0),
        );
        return toTrendDelta(current, previous);
      },
      evidence: (data) => [
        {
          source: "Stripe Retained Subscriptions",
          domain: "stripe",
          contribution: Math.max(
            0,
            (data.stripe?.subscriptions?.active ?? 0) -
              (data.stripe?.subscriptions?.canceled ?? 0),
          ),
          confidence: data.stripe ? 0.91 : 0.35,
          detail: "Active less canceled subscriptions in range.",
        },
        {
          source: "Pylon Resolved",
          domain: "pylon",
          contribution: data.pylon?.resolvedInRange ?? 0,
          confidence: data.pylon ? 0.82 : 0.35,
          detail: "Resolved customer conversations.",
        },
        {
          source: "Slack Ops",
          domain: "slack",
          contribution: data.slack?.tasksCreatedInRange ?? 0,
          confidence: data.slack ? 0.73 : 0.3,
          detail: "Retention-related workflow execution.",
        },
      ],
    },
    {
      id: "expansion",
      label: "Expansion",
      section: "customer-success",
      rawVolume: (data) =>
        (data.hubspot?.funnel?.activeSubscriptions ?? 0) +
        Math.max(0, data.product?.completedTasksInRange ?? 0),
      trendDelta: (data) => {
        const throughput = data.product?.throughputRate ?? 0;
        const prev = Math.max(1, throughput - 5);
        return toTrendDelta(throughput, prev);
      },
      evidence: (data) => [
        {
          source: "HubSpot Active Subscriptions",
          domain: "hubspot",
          contribution: data.hubspot?.funnel?.activeSubscriptions ?? 0,
          confidence: data.hubspot ? 0.8 : 0.3,
          detail: "Active base available for expansion.",
        },
        {
          source: "Product Throughput",
          domain: "product",
          contribution: data.product?.completedTasksInRange ?? 0,
          confidence: data.product ? 0.78 : 0.3,
          detail: "Feature/ops throughput enabling expansion.",
        },
        {
          source: "Coda Ops",
          domain: "coda",
          contribution: data.codaOps?.tasksCreatedInRange ?? 0,
          confidence: data.codaOps ? 0.72 : 0.28,
          detail: "Execution tasks for expansion opportunities.",
        },
      ],
    },
  ];
}

function buildLifecycleStages(data: AnalyticsDashboardData): LifecycleStage[] {
  const defs = lifecycleStageDefinitions();
  const stages: LifecycleStage[] = [];

  for (let idx = 0; idx < defs.length; idx += 1) {
    const def = defs[idx];
    const volume = Math.max(0, Math.round(def.rawVolume(data)));
    const previousVolume = idx > 0 ? stages[idx - 1].volume : null;
    const conversionFromPrevious =
      previousVolume && previousVolume > 0
        ? normalizePct(toPct(volume, previousVolume))
        : null;
    const evidence = withShares(
      def
        .evidence(data)
        .filter((item) => item.contribution > 0 || item.confidence >= 0.7)
        .slice(0, 5),
    );
    const confidenceBase =
      evidence.length > 0
        ? evidence.reduce(
            (sum, item) => sum + item.confidence * (item.share || 1),
            0,
          ) /
          Math.max(
            1,
            evidence.reduce((sum, item) => sum + (item.share || 1), 0),
          )
        : 0.35;

    stages.push({
      id: def.id,
      label: def.label,
      section: def.section,
      volume,
      conversionFromPrevious,
      trendDeltaPct: def.trendDelta(data),
      confidence: normalizeConfidence(confidenceBase),
      evidence,
    });
  }

  return stages;
}

function buildLifecycleTransitions(
  stages: LifecycleStage[],
): LifecycleTransition[] {
  const transitions: LifecycleTransition[] = [];
  for (let idx = 0; idx < stages.length - 1; idx += 1) {
    const from = stages[idx];
    const to = stages[idx + 1];
    transitions.push({
      id: `${from.id}->${to.id}`,
      fromStageId: from.id,
      toStageId: to.id,
      fromVolume: from.volume,
      toVolume: to.volume,
      dropoff: Math.max(0, from.volume - to.volume),
      conversionRate:
        from.volume > 0 ? normalizePct(toPct(to.volume, from.volume)) : null,
      trendDeltaPct:
        from.trendDeltaPct !== null && to.trendDeltaPct !== null
          ? Math.round((to.trendDeltaPct - from.trendDeltaPct) * 10) / 10
          : null,
    });
  }
  return transitions;
}

function buildLifecycleNarrative(
  stages: LifecycleStage[],
  transitions: LifecycleTransition[],
): string[] {
  const lines = stages.map(
    (stage) =>
      `${stage.label}: ${stage.volume.toLocaleString()} (${stage.trendDeltaPct === null ? "no trend baseline" : `${stage.trendDeltaPct.toFixed(1)}% trend`})`,
  );

  const weakest = transitions
    .filter((item) => item.conversionRate !== null)
    .sort((a, b) => (a.conversionRate ?? 100) - (b.conversionRate ?? 100))[0];
  if (weakest) {
    lines.push(
      `Largest lifecycle leak: ${weakest.fromStageId} -> ${weakest.toStageId} at ${(weakest.conversionRate ?? 0).toFixed(1)}% conversion.`,
    );
  }

  return lines;
}

export function buildLifecycleFunnelData(
  data: AnalyticsDashboardData,
): LifecycleFunnelData {
  const stages = buildLifecycleStages(data);
  const transitions = buildLifecycleTransitions(stages);

  return {
    stages,
    transitions,
    generatedAt: new Date().toISOString(),
    narrative: buildLifecycleNarrative(stages, transitions),
  };
}

function buildDropoffRecords(
  data: AnalyticsDashboardData,
): FunnelDropoffRecord[] {
  const stages = data.hubspot?.funnel?.stages ?? [];
  const deals = data.hubspot?.deals ?? [];
  const byLabel = new Map(stages.map((stage) => [stage.label, stage]));
  const dropoffs: FunnelDropoffRecord[] = [];

  for (let idx = 0; idx < SALES_STAGE_ORDER.length - 1; idx += 1) {
    const fromLabel = SALES_STAGE_ORDER[idx];
    const toLabel = SALES_STAGE_ORDER[idx + 1];
    const from = byLabel.get(fromLabel);
    const to = byLabel.get(toLabel);
    if (!from || !to) continue;

    const dropped = Math.max(0, from.count - to.count);
    if (dropped <= 0) continue;

    const dropoffRate = toPct(dropped, from.count);
    const stageDeals = deals
      .filter((deal) => deal.stageLabel === fromLabel)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, Math.min(10, dropped));

    if (stageDeals.length === 0) {
      dropoffs.push({
        id: `${from.stageId}->${to.stageId}:aggregate`,
        fromStageId: from.stageId,
        fromStageLabel: from.label,
        toStageId: to.stageId,
        toStageLabel: to.label,
        droppedCount: dropped,
        dropoffRate,
        entityType: "deal",
        entityId: `${from.stageId}:aggregate`,
        entityName: `${from.label} aggregate drop-off`,
        owner: null,
        value: from.value,
        reason: `Stage conversion gap from ${from.label} to ${to.label}.`,
        source: "inferred",
        lastActivityAt: null,
      });
      continue;
    }

    for (const deal of stageDeals) {
      dropoffs.push({
        id: `${from.stageId}->${to.stageId}:${deal.dealId}`,
        fromStageId: from.stageId,
        fromStageLabel: from.label,
        toStageId: to.stageId,
        toStageLabel: to.label,
        droppedCount: 1,
        dropoffRate,
        entityType: "deal",
        entityId: deal.dealId,
        entityName: deal.dealName,
        owner: deal.ownerId,
        value: deal.amount,
        reason: `Deal has not progressed from ${from.label} to ${to.label}.`,
        source: "hubspot",
        lastActivityAt: deal.updatedAt,
      });
    }
  }

  return dropoffs.sort((a, b) => b.value - a.value);
}

function buildAttribution(
  data: AnalyticsDashboardData,
): CrossFunnelAttribution {
  const dealsBySource = data.hubspot?.funnel?.dealsBySource ?? [];
  const totalDeals = data.hubspot?.funnel?.totalDeals ?? 0;

  return {
    marketingSources: dealsBySource.map((source) => ({
      source: source.source,
      leads: source.count,
      deals: source.count,
      revenue: source.value,
      conversionRate: totalDeals > 0 ? toPct(source.count, totalDeals) : null,
    })),
  };
}

function buildInsights(
  data: AnalyticsDashboardData,
  dropoffs: FunnelDropoffRecord[],
): FunnelInsight[] {
  const insights: FunnelInsight[] = [];

  const largestDrop = dropoffs[0];
  if (largestDrop) {
    insights.push({
      id: "dropoff-largest",
      severity:
        largestDrop.dropoffRate >= 35
          ? "critical"
          : largestDrop.dropoffRate >= 20
            ? "warning"
            : "info",
      headline: `Largest drop-off is ${largestDrop.fromStageLabel} -> ${largestDrop.toStageLabel}`,
      detail: `Drop-off rate is ${largestDrop.dropoffRate.toFixed(1)}% with ${largestDrop.droppedCount} account(s) affected in this transition.`,
    });
  }

  const salesWinRate = data.hubspot?.funnel?.winRate ?? 0;
  if (salesWinRate < 25) {
    insights.push({
      id: "winrate-low",
      severity: "warning",
      headline: "Sales win rate is below target",
      detail: `Current win rate is ${salesWinRate.toFixed(1)}%; prioritize stage-specific qualification and follow-up automation.`,
    });
  }

  // Check top paths and trials for insights
  const trials = data.stripe?.subscriptions?.trialing ?? 0;
  if (trials > 0) {
     insights.push({
      id: "funnel-trials",
      severity: "info",
      headline: `Healthy top-of-funnel with ${trials} active trials`,
      detail: `Ensure automated email sequences are active for trial users to maximize conversion to paid.`,
     });
  }

  // Evaluate ad spend ROI if applicable
  const googleSpend = data.googleAds?.totalSpend30d ?? 0;
  const metaSpend = data.metaAds?.totalSpend30d ?? 0;
  
  if (googleSpend > 0 && metaSpend > 0) {
     insights.push({
       id: "ad-diversification",
       severity: "info",
       headline: "Ad spend diversified",
       detail: `Monitor Channel ROI table closely to determine if Google Ads ($${googleSpend}) or Meta ($${metaSpend}) provides more efficient CPL/CAC.`,
     });
  }

  if (insights.length === 0) {
    insights.push({
      id: "funnel-stable",
      severity: "info",
      headline: "Funnel is stable across current range",
      detail:
        "No severe drop-off concentration was detected in the selected period.",
    });
  }

  return insights;
}

function lifecycleStagesToTouchpoints(
  stages: LifecycleStage[],
): FunnelTouchpoint[] {
  return stages.map((stage) => ({
    stageId: stage.id,
    stageLabel: stage.label,
    count: stage.volume,
    conversionFromPrevious: stage.conversionFromPrevious,
  }));
}

export function buildCrossFunnelData(
  data: AnalyticsDashboardData,
): CrossFunnelData {
  const lifecycle = buildLifecycleFunnelData(data);
  const stages = lifecycleStagesToTouchpoints(lifecycle.stages);
  const dropoffs = buildDropoffRecords(data);
  const attribution = buildAttribution(data);
  const insights = buildInsights(data, dropoffs);

  const narrative = [
    ...lifecycle.narrative,
    ...insights.map((insight) => insight.detail),
  ];

  return {
    stages,
    dropoffs,
    attribution,
    insights,
    narrative,
  };
}

export const __private__ = {
  buildLifecycleStages,
  buildLifecycleTransitions,
};
