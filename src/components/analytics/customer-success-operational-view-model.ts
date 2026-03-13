import type { AnalyticsDashboardData } from "@/lib/analytics/types";

export type IntegrationStatus = "Not provisioned" | "Connected but stale" | "Active";

export interface IntegrationStatusItem {
  label: string;
  status: IntegrationStatus;
  details: string;
}

export interface CSAction {
  title: string;
  detail: string;
  impact: string;
  severity: "critical" | "warning" | "info";
}

export interface RiskItem {
  id: string;
  label: string;
  value: number;
  threshold: number;
  description: string;
}

export interface CustomerOpsTrendPoint {
  date: string;
  total: number;
}

function deriveIntegrationStatus(input: {
  connected: boolean;
  stale: boolean;
  enabledRules: number;
  totalRules: number;
}): IntegrationStatus {
  if (!input.connected || input.totalRules === 0 || input.enabledRules === 0) {
    return "Not provisioned";
  }
  if (input.stale) {
    return "Connected but stale";
  }
  return "Active";
}

function buildCombinedTrend(data: AnalyticsDashboardData | null): CustomerOpsTrendPoint[] {
  if (!data) return [];

  const buckets = new Map<string, number>();
  const trendSources = [data.slack?.trend ?? [], data.googleWorkspace?.trend ?? [], data.codaOps?.trend ?? []];

  trendSources.forEach((trend) => {
    trend.forEach((item) => {
      buckets.set(item.date, (buckets.get(item.date) ?? 0) + item.createdTasks + item.receipts);
    });
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-7)
    .map(([date, total]) => ({ date, total }));
}

function deriveCSActions(input: {
  pylon: AnalyticsDashboardData["pylon"];
  product: AnalyticsDashboardData["product"];
  coda: AnalyticsDashboardData["coda"];
}): CSAction[] {
  const actions: CSAction[] = [];

  const urgent = input.pylon?.urgentConversations ?? 0;
  if (urgent > 15) {
    actions.push({
      title: "Rebalance urgent queue ownership",
      detail: `${urgent} urgent conversations exceed the 15-threshold. Assign a daily triage owner and enforce 2-hour response SLA.`,
      impact: "Expected: lower urgent backlog within 1 week.",
      severity: urgent > 25 ? "critical" : "warning",
    });
  }

  const backlogGrowth = input.product?.backlogGrowth ?? 0;
  if (backlogGrowth > 5) {
    actions.push({
      title: "Throttle backlog inflow",
      detail: `Backlog grew by ${backlogGrowth} net items. Route non-critical requests into weekly batches and prioritize customer-blocking items.`,
      impact: "Expected: improved throughput and queue stability.",
      severity: backlogGrowth > 15 ? "critical" : "warning",
    });
  }

  const throughputRate = input.product?.throughputRate ?? 100;
  if (throughputRate < 70) {
    actions.push({
      title: "Automate follow-up execution",
      detail: `Throughput at ${throughputRate.toFixed(1)}% — below 70% target. Use Slack/Coda workflows to auto-create and assign post-resolution follow-up tasks.`,
      impact: "Expected: faster closure and improved customer confidence.",
      severity: throughputRate < 50 ? "critical" : "warning",
    });
  }

  const overdueOpen = input.product?.overdueOpenTasks ?? 0;
  if (overdueOpen > 5) {
    actions.push({
      title: "Review overdue task assignments",
      detail: `${overdueOpen} tasks are overdue. Reassign or rescope blockers to restore delivery cadence.`,
      impact: "Expected: reduced retention risk from stalled execution.",
      severity: overdueOpen > 15 ? "critical" : "warning",
    });
  }

  if (actions.length === 0) {
    actions.push({
      title: "System operating within thresholds",
      detail: "All customer-success indicators are within acceptable ranges. No immediate intervention required.",
      impact: "Use this window to invest in proactive retention workflows.",
      severity: "info",
    });
  }

  return actions;
}

export function deriveCustomerSuccessOperationalView(data: AnalyticsDashboardData | null) {
  const pylon = data?.pylon;
  const coda = data?.coda;
  const product = data?.product;
  const googleWorkspace = data?.googleWorkspace;
  const slackOps = data?.slack;
  const codaOps = data?.codaOps;
  const trend = buildCombinedTrend(data);

  const integrationStatuses: IntegrationStatusItem[] = [
    {
      label: "Google Workspace",
      status: deriveIntegrationStatus({
        connected: data?.freshness.google_workspace?.status === "CONNECTED",
        stale: Boolean(data?.freshness.google_workspace?.stale),
        enabledRules: googleWorkspace?.enabledRules ?? 0,
        totalRules: googleWorkspace?.totalRules ?? 0,
      }),
      details: `${googleWorkspace?.enabledRules ?? 0}/${googleWorkspace?.totalRules ?? 0} rules enabled`,
    },
    {
      label: "Slack",
      status: deriveIntegrationStatus({
        connected: data?.freshness.slack?.status === "CONNECTED",
        stale: Boolean(data?.freshness.slack?.stale),
        enabledRules: slackOps?.enabledRules ?? 0,
        totalRules: slackOps?.totalRules ?? 0,
      }),
      details: `${slackOps?.enabledRules ?? 0}/${slackOps?.totalRules ?? 0} rules enabled`,
    },
    {
      label: "Coda",
      status: deriveIntegrationStatus({
        connected: data?.freshness.coda?.status === "CONNECTED",
        stale: Boolean(data?.freshness.coda?.stale),
        enabledRules: codaOps?.enabledRules ?? 0,
        totalRules: codaOps?.totalRules ?? 0,
      }),
      details: `${codaOps?.enabledRules ?? 0}/${codaOps?.totalRules ?? 0} rules enabled`,
    },
  ];

  const riskItems: RiskItem[] = [
    {
      id: "urgent",
      label: "Urgent Support Load",
      value: pylon?.urgentConversations ?? 0,
      threshold: 10,
      description: "High urgent queue can increase churn risk.",
    },
    {
      id: "backlog",
      label: "Backlog Growth",
      value: product?.backlogGrowth ?? 0,
      threshold: 1,
      description: "Growing backlog can degrade response quality.",
    },
    {
      id: "overdue",
      label: "Overdue Open Tasks",
      value: product?.overdueOpenTasks ?? 0,
      threshold: 5,
      description: "Overdue execution creates retention delays.",
    },
  ];

  return {
    actions: deriveCSActions({ pylon: pylon ?? null, product: product ?? null, coda: coda ?? null }),
    codaCards: coda?.totalCards ?? "—",
    hasLegacyAnalytics: Boolean(pylon || coda || product),
    integrationStatuses,
    maxTrend: Math.max(1, ...trend.map((item) => item.total)),
    openConversations: pylon?.openConversations ?? "—",
    riskItems,
    throughputRate: product?.throughputRate ?? null,
    trend,
    urgentConversations: pylon?.urgentConversations ?? "—",
  };
}
