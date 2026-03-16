import type { AnalyticsDashboardData } from "@/lib/analytics/types";

export type IntegrationStatus = "Not provisioned" | "Connected but stale" | "Connected but no data" | "Active";

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

function deriveTelemetryStatus(input: {
  connected: boolean;
  stale: boolean;
  hasPayload: boolean;
}): IntegrationStatus {
  if (!input.connected && !input.hasPayload) {
    return "Not provisioned";
  }
  if (input.connected && !input.hasPayload) {
    return "Connected but no data";
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
      buckets.set(item.date, (buckets.get(item.date) ?? 0) + item.receipts);
    });
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-7)
    .map(([date, total]) => ({ date, total }));
}

function deriveCSActions(input: {
  pylon: AnalyticsDashboardData["pylon"];
  pylonConnected: boolean;
  pylonError: string | null;
}): CSAction[] {
  const actions: CSAction[] = [];

  if (input.pylonConnected && !input.pylon) {
    actions.push({
      title: "Repair Pylon conversation ingestion",
      detail: input.pylonError
        ? `Pylon is connected but analytics payloads are empty: ${input.pylonError}. Validate issue and conversation API access for the selected date range.`
        : "Pylon is connected but no conversation telemetry was returned. Validate issue and conversation API access for the selected date range.",
      impact: "Expected: restore support queue visibility in the dashboard.",
      severity: "warning",
    });
  }

  const urgent = input.pylon?.urgentConversations ?? 0;
  if (urgent > 15) {
    actions.push({
      title: "Rebalance urgent queue ownership",
      detail: `${urgent} urgent conversations exceed the 15-threshold. Assign a daily triage owner and enforce 2-hour response SLA.`,
      impact: "Expected: lower urgent backlog within 1 week.",
      severity: urgent > 25 ? "critical" : "warning",
    });
  }

  const waitingOnTeam = input.pylon?.waitingOnTeam ?? 0;
  if (waitingOnTeam > 8) {
    actions.push({
      title: "Clear the waiting-on-team queue",
      detail: `${waitingOnTeam} conversations are waiting on the internal team. Assign owners and publish a twice-daily update cadence until that queue is back under control.`,
      impact: "Expected: faster customer updates and fewer support escalations.",
      severity: waitingOnTeam > 15 ? "critical" : "warning",
    });
  }

  const avgFirstResponse = input.pylon?.avgFirstResponseMinutes ?? null;
  if (avgFirstResponse !== null && avgFirstResponse > 120) {
    actions.push({
      title: "Tighten first-response coverage",
      detail: `Average first response is ${avgFirstResponse.toFixed(0)} minutes. Expand triage coverage windows or add routing for high-priority accounts.`,
      impact: "Expected: lower time-to-first-response and better queue health.",
      severity: avgFirstResponse > 240 ? "critical" : "warning",
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
    {
      label: "Pylon",
      status: deriveTelemetryStatus({
        connected: data?.freshness.pylon?.status === "CONNECTED",
        stale: Boolean(data?.freshness.pylon?.stale),
        hasPayload: Boolean(pylon),
      }),
      details: pylon
        ? `${pylon.openConversations ?? 0} open · ${pylon.urgentConversations ?? 0} urgent`
        : "Conversation telemetry unavailable for the selected range",
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
      id: "waiting-on-team",
      label: "Waiting on Team",
      value: pylon?.waitingOnTeam ?? 0,
      threshold: 8,
      description: "Internal queue lag slows customer updates.",
    },
    {
      id: "first-response",
      label: "First Response Minutes",
      value: pylon?.avgFirstResponseMinutes ?? 0,
      threshold: 120,
      description: "Slow first response is usually the first sign of coverage gaps.",
    },
  ];

  return {
    actions: deriveCSActions({
      pylon: pylon ?? null,
      pylonConnected: data?.freshness.pylon?.status === "CONNECTED",
      pylonError: data?.meta?.errors?.pylon?.message ?? null,
    }),
    codaCards: coda?.totalCards ?? "—",
    hasLegacyAnalytics: Boolean(pylon || coda),
    integrationStatuses,
    maxTrend: Math.max(1, ...trend.map((item) => item.total)),
    openConversations: pylon?.openConversations ?? "—",
    riskItems,
    avgFirstResponseMinutes: pylon?.avgFirstResponseMinutes ?? null,
    trend,
    urgentConversations: pylon?.urgentConversations ?? "—",
  };
}
