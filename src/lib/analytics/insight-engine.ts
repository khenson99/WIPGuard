import type {
  AiInsight,
  AiInsightsBundle,
  AnalyticsDashboardData,
  AnalyticsSectionId,
  DistilledInsight,
} from "@/lib/analytics/types";

const SECTION_ORDER: AnalyticsSectionId[] = ["ads-traffic", "finance", "sales-pipeline", "customer-success"];

const SEVERITY_RANK: Record<AiInsight["severity"], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.99, Math.round(value * 100) / 100));
}

function toPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function toDelta(current: number, previous: number): string {
  if (previous <= 0) return "n/a";
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function sortInsights(items: AiInsight[]): AiInsight[] {
  return [...items].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    }
    return b.confidence - a.confidence;
  });
}

function buildAdsInsight(data: AnalyticsDashboardData): AiInsight | null {
  const bounce = data.googleAnalytics?.bounceRate ?? 0;
  const sessionsCurrent = data.googleAnalytics?.sessions30d ?? 0;
  const sessionsPrev = data.googleAnalytics?.sessionsPrev30d ?? 0;
  const totalClicks = (data.googleAds?.totalClicks ?? 0) + (data.metaAds?.totalClicks ?? 0) + (data.redditAds?.totalClicks ?? 0);
  const totalConversions = (data.googleAds?.totalConversions ?? 0) + (data.metaAds?.totalConversions ?? 0);
  const clickToConv = totalClicks > 0 ? totalConversions / totalClicks : 0;
  const hasAdsSignals = Boolean(data.googleAnalytics) || totalClicks > 0 || totalConversions > 0;

  if (!hasAdsSignals) {
    return null;
  }

  if (bounce <= 0.55 && clickToConv >= 0.02) {
    return null;
  }

  return {
    id: "ai-ads-traffic-quality",
    section: "ads-traffic",
    severity: bounce > 0.65 || clickToConv < 0.015 ? "critical" : "warning",
    title: "Traffic quality is reducing acquisition efficiency",
    why: `Bounce rate is ${toPct(bounce)} and click-to-conversion is ${(clickToConv * 100).toFixed(2)}%, indicating paid/landing mismatch.`,
    confidence: clampConfidence(0.86),
    expectedImpact: "Improve paid conversion efficiency and reduce wasted spend within 2-4 weeks.",
    stale: data.staleDomains.includes("googleAnalytics") || data.staleDomains.includes("googleAds") || data.staleDomains.includes("metaAds"),
    evidence: [
      {
        source: "Google Analytics",
        domain: "googleAnalytics",
        metric: "Bounce Rate",
        value: toPct(bounce),
        delta: toDelta(sessionsCurrent, sessionsPrev),
      },
      {
        source: "Google Ads + Meta Ads",
        domain: "googleAds/metaAds",
        metric: "Click-to-Conversion",
        value: `${(clickToConv * 100).toFixed(2)}%`,
        delta: `${totalConversions} conversions / ${totalClicks} clicks`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Create paid-landing relevance sprint",
        payload: {
          title: "Tighten ad to landing message match",
          priority: "P1",
          status: "QUEUED",
        },
      },
      {
        type: "assign_owner",
        label: "Assign demand gen owner for channel triage",
        payload: {
          role: "demand-gen",
        },
      },
    ],
  };
}

function buildFinanceInsight(data: AnalyticsDashboardData): AiInsight | null {
  const runway = data.mercury?.cashFlow?.runway ?? 0;
  const revenueGrowth = data.stripe?.revenue?.revenueGrowth ?? 0;
  const burnRate = data.mercury?.cashFlow?.burnRate ?? 0;

  if (!(runway > 0 && runway < 6)) {
    return null;
  }

  return {
    id: "ai-finance-runway",
    section: "finance",
    severity: runway < 4 ? "critical" : "warning",
    title: "Runway risk requires near-term correction",
    why: `Estimated runway is ${runway.toFixed(1)} months with burn rate ${burnRate.toFixed(0)} and revenue growth ${revenueGrowth.toFixed(1)}%.`,
    confidence: clampConfidence(0.92),
    expectedImpact: "Extending runway by 1-2 months through spend reprioritization and revenue acceleration.",
    stale: data.staleDomains.includes("mercury") || data.staleDomains.includes("stripe"),
    evidence: [
      {
        source: "Mercury",
        domain: "mercury",
        metric: "Runway",
        value: `${runway.toFixed(1)} months`,
        delta: `Burn ${burnRate.toFixed(0)}/month`,
      },
      {
        source: "Stripe",
        domain: "stripe",
        metric: "Revenue Growth",
        value: `${revenueGrowth.toFixed(1)}%`,
        delta: `${(data.stripe?.revenue?.totalRevenue30d ?? 0).toFixed(0)} current period`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Create 30-day runway protection plan",
        payload: {
          title: "Runway protection and collections plan",
          priority: "P0",
          status: "WORKING_ON_TODAY",
        },
      },
      {
        type: "create_automation_from_template",
        label: "Enable HubSpot stage checklist automation",
        payload: {
          templateKey: "hubspot-stage-checklist",
        },
      },
    ],
  };
}

function buildSalesInsight(data: AnalyticsDashboardData): AiInsight | null {
  const noShowRate = data.hubspot?.funnel?.noShowRate ?? 0;
  const demoScheduled = data.hubspot?.funnel?.demoScheduled ?? 0;
  const demoFollowUp = data.hubspot?.funnel?.demoFollowUp ?? 0;
  const closedWon = data.hubspot?.funnel?.closedWon ?? 0;

  if (noShowRate <= 15 && demoFollowUp <= closedWon) {
    return null;
  }

  return {
    id: "ai-sales-conversion-leak",
    section: "sales-pipeline",
    severity: noShowRate > 25 ? "critical" : "warning",
    title: "Sales conversion leakage concentrated around demo flow",
    why: `No-show rate is ${noShowRate.toFixed(1)}% and follow-up backlog is ${demoFollowUp} versus ${closedWon} closed won.`,
    confidence: clampConfidence(0.88),
    expectedImpact: "Recovering demo attendance and follow-up speed should lift win-rate in the next cycle.",
    stale: data.staleDomains.includes("hubspot") || data.staleDomains.includes("googleWorkspace"),
    evidence: [
      {
        source: "HubSpot",
        domain: "hubspot",
        metric: "No-show Rate",
        value: `${noShowRate.toFixed(1)}%`,
        delta: `${data.hubspot?.funnel?.noShows ?? 0} no-shows`,
      },
      {
        source: "HubSpot",
        domain: "hubspot",
        metric: "Demo Throughput",
        value: `${demoFollowUp}/${demoScheduled} follow-up/scheduled`,
        delta: `${closedWon} closed won`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Create no-show recovery playbook",
        payload: {
          title: "No-show recovery + fast follow-up runbook",
          priority: "P1",
          status: "QUEUED",
        },
      },
      {
        type: "assign_owner",
        label: "Assign pipeline owner for SLA monitoring",
        payload: {
          role: "sales-ops",
        },
      },
    ],
  };
}

function buildCustomerSuccessInsight(data: AnalyticsDashboardData): AiInsight | null {
  const urgent = data.pylon?.urgentConversations ?? 0;
  const backlogGrowth = data.product?.backlogGrowth ?? 0;
  const throughputRate = data.product?.throughputRate ?? 0;

  if (urgent <= 10 && backlogGrowth <= 0) {
    return null;
  }

  return {
    id: "ai-cs-escalation-risk",
    section: "customer-success",
    severity: urgent > 20 || backlogGrowth > 10 ? "critical" : "warning",
    title: "Customer-success execution pressure is rising",
    why: `Urgent conversations: ${urgent}; backlog growth: ${backlogGrowth}; throughput: ${throughputRate?.toFixed(1) ?? "n/a"}%.`,
    confidence: clampConfidence(0.83),
    expectedImpact: "Rebalancing support and execution queues should reduce urgent backlog and churn precursors.",
    stale: data.staleDomains.includes("pylon") || data.staleDomains.includes("codaOps") || data.staleDomains.includes("slack"),
    evidence: [
      {
        source: "Pylon",
        domain: "pylon",
        metric: "Urgent Conversations",
        value: String(urgent),
        delta: `${data.pylon?.resolvedInRange ?? 0} resolved`,
      },
      {
        source: "Product Signals",
        domain: "product",
        metric: "Backlog Growth",
        value: String(backlogGrowth),
        delta: `${throughputRate?.toFixed(1) ?? "n/a"}% throughput`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Create urgent CS triage queue",
        payload: {
          title: "Urgent CS triage and owner rebalance",
          priority: "P1",
          status: "WORKING_ON_TODAY",
        },
      },
      {
        type: "open_integration_followup",
        label: "Review Slack/Coda automation health",
        payload: {
          providers: ["slack", "coda"],
        },
      },
    ],
  };
}

function buildSteadyStateInsight(data: AnalyticsDashboardData): AiInsight {
  return {
    id: "ai-steady-state",
    section: "sales-pipeline",
    severity: "info",
    title: "No critical cross-functional regressions detected",
    why: "Current lifecycle and domain indicators are inside guardrails for the selected range.",
    confidence: clampConfidence(0.74),
    expectedImpact: "Use this window for one growth experiment and one cycle-time experiment.",
    stale: data.staleDomains.length > 0,
    evidence: [
      {
        source: "Lifecycle",
        domain: "cross-domain",
        metric: "Funnel Stability",
        value: "Stable",
        delta: `${data.staleDomains.length} stale domains`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Define next GTM experiment",
        payload: {
          title: "Run one GTM + one execution experiment",
          priority: "P2",
          status: "QUEUED",
        },
      },
    ],
  };
}

export function buildAiInsightsBundle(data: AnalyticsDashboardData): AiInsightsBundle {
  const candidateInsights = [
    buildAdsInsight(data),
    buildFinanceInsight(data),
    buildSalesInsight(data),
    buildCustomerSuccessInsight(data),
  ].filter((item): item is AiInsight => item !== null);

  const global = sortInsights(candidateInsights.length > 0 ? candidateInsights : [buildSteadyStateInsight(data)]).slice(0, 8);

  const bySection = SECTION_ORDER.reduce<AiInsightsBundle["bySection"]>(
    (acc, section) => {
      acc[section] = global.filter((item) => item.section === section);
      return acc;
    },
    {
      "ads-traffic": [],
      finance: [],
      "sales-pipeline": [],
      "customer-success": [],
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    global,
    bySection,
  };
}

export function buildDistilledInsights(data: AnalyticsDashboardData): DistilledInsight[] {
  const insights = buildAiInsightsBundle(data).global.slice(0, 5);
  return insights.map((item) => ({
    id: item.id,
    section: item.section,
    severity: item.severity,
    title: item.title,
    why: item.why,
    changeOverTime: item.evidence.map((evidence) => `${evidence.metric}: ${evidence.delta}`).join(" | "),
    confidence: item.confidence,
    actions: item.actions,
  }));
}

export const __private__ = {
  sortInsights,
};
