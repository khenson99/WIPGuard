import { AnalyticsSnapshotStatus, Prisma, RetentionTenantStatus } from "@/generated/prisma/client";
import { buildSubscriptionMrrBreakdown } from "@/lib/analytics/subscription-mrr";
import { snapshotKeyQueryVariants } from "@/lib/integrations/provider-registry";
import { prisma } from "@/lib/prisma";
import {
  buildDefaultCeoReportPacks,
  buildMetricReportRun,
  computeCeoReadiness,
  evaluateMetricTrust,
  getDefaultCeoMetricDefinitions,
  getDefaultBoardGradeMetricKeys,
  type CeoMetricDefinition,
  type CeoReadiness,
  type CeoMetricTrustStatus,
  type CeoMetricValue,
  type CeoReportPack,
  type CeoReportRun,
  type CeoSourceSample,
} from "@/lib/ceo/metric-trust";

export interface CeoMetricSnapshotPayload {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  definitions: CeoMetricDefinition[];
  metrics: CeoMetricValue[];
  reportPacks: CeoReportPack[];
  trustSummary: Record<CeoMetricTrustStatus, number>;
  readiness: CeoReadiness;
}

export interface CreateCeoReportRunResult extends CeoReportRun {
  id: string | null;
  boardFinal?: CeoReportBoardFinal | null;
}

export interface CeoReportBoardFinal {
  approvedAt: string;
  approvedById: string;
  overrideReason: string | null;
}

export interface MonthlyInvestorReportRunResult {
  created: boolean;
  periodStart: string;
  periodEnd: string;
  run: CreateCeoReportRunResult;
}

interface CeoReportRunRow {
  id: string;
  packSlug: string;
  packName: string;
  generatedAt: Date | string;
  metricPayload: unknown;
  deterministicNotes: string[];
  markdown: string;
  csv: string;
  slideJson: unknown;
  boardFinalAt?: Date | string | null;
  boardFinalApprovedById?: string | null;
  boardFinalOverrideReason?: string | null;
}

type CeoReportRunDelegate = {
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
    select: Record<keyof CeoReportRunRow, true>;
  }): Promise<CeoReportRunRow | null>;
  update(args: {
    where: { id: string };
    data: {
      boardFinalAt: Date;
      boardFinalApprovedById: string;
      boardFinalOverrideReason: string | null;
    };
    select: Record<keyof CeoReportRunRow, true>;
  }): Promise<CeoReportRunRow>;
};

const TRUST_SUMMARY_KEYS: CeoMetricTrustStatus[] = [
  "fresh",
  "stale",
  "partial",
  "missing",
  "error",
  "conflicted",
];

type AnalyticsSnapshotSample = {
  id: string;
  providerKey: string;
  status: AnalyticsSnapshotStatus;
  capturedAt: Date;
  expiresAt: Date;
  lastError: string | null;
  payload: Prisma.JsonValue | null;
};

type MetricCalculatorInput = {
  definition: CeoMetricDefinition;
  latestSnapshots: Map<string, AnalyticsSnapshotSample>;
  retentionMetric: RetentionMetricSource;
  sourceSamples: CeoSourceSample[];
  asOf: Date;
};

type MetricCalculation = {
  value: number | string | null;
  priorValue: number | string | null;
  delta: number | null;
  details?: CeoMetricValue["details"];
};

type CeoMetricCalculator = (input: MetricCalculatorInput) => MetricCalculation;

type RetentionMetricSource = {
  atRiskAccounts: number | null;
  source: CeoSourceSample;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metricUnitToDb(unit: CeoMetricDefinition["unit"]) {
  return unit.toUpperCase() as Uppercase<CeoMetricDefinition["unit"]>;
}

function metricTrustToDb(status: CeoMetricTrustStatus) {
  return status.toUpperCase() as Uppercase<CeoMetricTrustStatus>;
}

function audienceToDb(audience: CeoMetricDefinition["ownerAudience"] | CeoReportPack["audience"]) {
  return audience;
}

const CEO_REPORT_RUN_SELECT: Record<keyof CeoReportRunRow, true> = {
  id: true,
  packSlug: true,
  packName: true,
  generatedAt: true,
  metricPayload: true,
  deterministicNotes: true,
  markdown: true,
  csv: true,
  slideJson: true,
  boardFinalAt: true,
  boardFinalApprovedById: true,
  boardFinalOverrideReason: true,
};

function boardFinalFromRow(row: CeoReportRunRow): CeoReportBoardFinal | null {
  if (!row.boardFinalAt || !row.boardFinalApprovedById) return null;
  return {
    approvedAt: new Date(row.boardFinalAt).toISOString(),
    approvedById: row.boardFinalApprovedById,
    overrideReason: row.boardFinalOverrideReason ?? null,
  };
}

function reportRunFromRow(row: CeoReportRunRow): CreateCeoReportRunResult {
  return {
    id: row.id,
    packSlug: row.packSlug,
    packName: row.packName,
    generatedAt: new Date(row.generatedAt).toISOString(),
    metrics: row.metricPayload as unknown as CeoMetricValue[],
    deterministicNotes: row.deterministicNotes,
    markdown: row.markdown,
    csv: row.csv,
    slideJson: row.slideJson as unknown as CeoReportRun["slideJson"],
    boardFinal: boardFinalFromRow(row),
  };
}

function monthWindow(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)),
  };
}

function reportReadinessFromSlideJson(slideJson: unknown): CeoReadiness | null {
  if (!slideJson || typeof slideJson !== "object" || Array.isArray(slideJson)) return null;
  const readiness = (slideJson as Record<string, unknown>).readiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) return null;

  const record = readiness as Record<string, unknown>;
  if (typeof record.ready !== "boolean" || typeof record.status !== "string") return null;

  return {
    status: record.status === "board_ready" ? "board_ready" : "not_board_final",
    ready: record.ready,
    summary: typeof record.summary === "string" ? record.summary : "",
    failingGates: Array.isArray(record.failingGates)
      ? record.failingGates.filter(
          (gate): gate is CeoReadiness["failingGates"][number] =>
            Boolean(gate) &&
            typeof gate === "object" &&
            !Array.isArray(gate) &&
            typeof (gate as Record<string, unknown>).metricKey === "string" &&
            typeof (gate as Record<string, unknown>).label === "string" &&
            typeof (gate as Record<string, unknown>).reason === "string",
        )
      : [],
  };
}

function sourceSampleFromSnapshot(snapshot: AnalyticsSnapshotSample): CeoSourceSample {
  return {
    sourceKey: snapshot.providerKey,
    sourceId: snapshot.id,
    status: snapshot.status === AnalyticsSnapshotStatus.SUCCESS ? "SUCCESS" : "ERROR",
    capturedAt: snapshot.capturedAt,
    expiresAt: snapshot.expiresAt,
    lastError: snapshot.lastError,
  };
}

function latestSnapshotByProvider(snapshots: AnalyticsSnapshotSample[]): Map<string, AnalyticsSnapshotSample> {
  const latest = new Map<string, AnalyticsSnapshotSample>();
  for (const snapshot of snapshots) {
    const existing = latest.get(snapshot.providerKey);
    if (!existing || snapshot.capturedAt > existing.capturedAt) {
      latest.set(snapshot.providerKey, snapshot);
    }
  }
  return latest;
}

function sourceKeysForDefinition(definition: CeoMetricDefinition): string[] {
  return Array.from(
    new Set([
      ...definition.sourceDependencies,
      ...(definition.optionalSourceDependencies ?? []),
    ])
  );
}

function sourceKeyVariantLookup(sourceKeys: string[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const sourceKey of sourceKeys) {
    for (const variant of snapshotKeyQueryVariants([sourceKey])) {
      if (!lookup.has(variant)) {
        lookup.set(variant, sourceKey);
      }
    }
  }
  return lookup;
}

function getPathNumber(payload: unknown, path: string[]): number | null {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function getFirstNumber(payload: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getPathNumber(payload, path);
    if (value !== null) return value;
  }
  return null;
}

function getPathArray(payload: unknown, path: string[]): unknown[] {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : [];
}

function sumArrayNumber(payload: unknown, path: string[], key: string): number | null {
  const values = getPathArray(payload, path)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const value = (item as Record<string, unknown>)[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function cashBreakdownFromMercury(payload: unknown): {
  bankCash: number | null;
  treasuryCash: number | null;
  totalCash: number | null;
} {
  const bankCashFromPayload = getFirstNumber(payload, [["cashFlow", "bankCash"], ["bankCash"]]);
  const treasuryCashFromPayload = getFirstNumber(payload, [["cashFlow", "treasuryCash"], ["treasuryCash"]]);
  const totalCashFromPayload = getFirstNumber(payload, [
    ["cashFlow", "totalCash"],
    ["cashFlow", "totalBalance"],
    ["totalCash"],
    ["totalBalance"],
    ["cashBalance"],
  ]);
  const accounts = getPathArray(payload, ["accounts"]);
  const accountTotals = accounts.reduce<{
    bankCash: number;
    treasuryCash: number;
    hasAccounts: boolean;
  }>(
    (totals, account) => {
      if (!account || typeof account !== "object" || Array.isArray(account)) return totals;
      const record = account as Record<string, unknown>;
      const balance = record.balance;
      if (typeof balance !== "number" || !Number.isFinite(balance)) return totals;
      const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
      if (type === "treasury") totals.treasuryCash += balance;
      else totals.bankCash += balance;
      totals.hasAccounts = true;
      return totals;
    },
    { bankCash: 0, treasuryCash: 0, hasAccounts: false }
  );
  const bankCash = bankCashFromPayload ?? (accountTotals.hasAccounts ? accountTotals.bankCash : null);
  const treasuryCash =
    treasuryCashFromPayload ?? (accountTotals.hasAccounts ? accountTotals.treasuryCash : null);
  const totalCash = totalCashFromPayload ?? (
    bankCash !== null || treasuryCash !== null ? (bankCash ?? 0) + (treasuryCash ?? 0) : null
  );

  return { bankCash, treasuryCash, totalCash };
}

function subscriptionBreakdownFromSnapshots(latestSnapshots: Map<string, AnalyticsSnapshotSample>) {
  return buildSubscriptionMrrBreakdown({
    stripe: latestSnapshots.get("stripe")?.payload,
    hubspot: latestSnapshots.get("hubspot")?.payload,
  });
}

function qualifiedPipelineFromHubSpot(payload: unknown): number | null {
  const scoreboardPipeline = sumArrayNumber(payload, ["repScoreboard"], "totalPipeline");
  return (
    scoreboardPipeline ??
    getFirstNumber(payload, [
      ["pipeline", "qualifiedPipelineValue"],
      ["pipeline", "totalValue"],
      ["qualifiedPipelineValue"],
      ["totalPipelineValue"],
      ["totalValue"],
    ])
  );
}

function demoCountFromSnapshots(latestSnapshots: Map<string, AnalyticsSnapshotSample>): number | null {
  const hubspot = latestSnapshots.get("hubspot")?.payload;
  const googleWorkspace = latestSnapshots.get("googleWorkspace")?.payload;
  const webflow = latestSnapshots.get("webflow")?.payload;
  const count =
    (getFirstNumber(hubspot, [["demoCount"], ["demos"], ["meetings", "demos"]]) ?? 0) +
    (getFirstNumber(googleWorkspace, [["demoMeetings"], ["meetings", "demos"]]) ?? 0) +
    (getFirstNumber(webflow, [["demoRequests"], ["forms", "demoRequests"]]) ?? 0);
  return count > 0 ? count : null;
}

function websiteTrafficFromSnapshots(latestSnapshots: Map<string, AnalyticsSnapshotSample>) {
  const googleAnalytics = latestSnapshots.get("googleAnalytics")?.payload;
  const googleSearchConsole = latestSnapshots.get("googleSearchConsole")?.payload;
  const semrush = latestSnapshots.get("semrush")?.payload;
  const websiteSessions = getFirstNumber(googleAnalytics, [
    ["sessions30d"],
    ["overview", "sessions"],
    ["sessions"],
    ["traffic", "sessions"],
  ]);
  const organicTraffic = getFirstNumber(semrush, [["organicTraffic"], ["traffic", "organic"]]) ?? 0;
  const searchClicks = getFirstNumber(googleSearchConsole, [["clicks"], ["search", "clicks"]]) ?? 0;
  const searchImpressions = getFirstNumber(googleSearchConsole, [["impressions"], ["search", "impressions"]]) ?? 0;
  const count = (websiteSessions ?? 0) + organicTraffic;

  return {
    value: count > 0 ? count : null,
    websiteSessions,
    organicTraffic,
    searchClicks,
    searchImpressions,
  };
}

function paidSpendFromSnapshots(latestSnapshots: Map<string, AnalyticsSnapshotSample>): number {
  return ["googleAds", "metaAds", "redditAds"].reduce((sum, key) => {
    const value = getFirstNumber(latestSnapshots.get(key)?.payload, [
      ["totalSpend30d"],
      ["spend"],
      ["cost"],
      ["summary", "spend"],
    ]);
    return sum + (value ?? 0);
  }, 0);
}

function derivedSourceSample(input: {
  sourceKey: string;
  sourceId: string;
  asOf: Date;
  freshnessSlaHours: number;
  requiredSourceKeys: string[];
  sources: CeoSourceSample[];
}): CeoSourceSample {
  const trust = evaluateMetricTrust({
    asOf: input.asOf,
    freshnessSlaHours: input.freshnessSlaHours,
    requiredSourceKeys: input.requiredSourceKeys,
    sources: input.sources,
  });
  const citedStates = trust.sourceStates.filter((state) => state.sourceId || state.capturedAt);
  if (trust.status !== "fresh") {
    const capturedAt = citedStates
      .map((state) => state.capturedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .reduce<Date | null>(
        (latest, date) => (!latest || date.getTime() > latest.getTime() ? date : latest),
        null
      );
    return {
      sourceKey: input.sourceKey,
      sourceId: citedStates.length > 0 ? input.sourceId : null,
      status: citedStates.length > 0 ? "PARTIAL" : "MISSING",
      capturedAt,
      expiresAt: null,
      lastError: trust.warnings.join(" "),
    };
  }

  const capturedAt = citedStates
    .map((state) => state.capturedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .reduce<Date | null>(
      (latest, date) => (!latest || date.getTime() > latest.getTime() ? date : latest),
      null
    );
  const expiresAt = citedStates
    .map((state) => state.expiresAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .reduce<Date | null>(
      (earliest, date) => (!earliest || date.getTime() < earliest.getTime() ? date : earliest),
      null
    );

  return {
    sourceKey: input.sourceKey,
    sourceId: input.sourceId,
    status: "SUCCESS",
    capturedAt: capturedAt ?? input.asOf,
    expiresAt: expiresAt ?? new Date(input.asOf.getTime() + input.freshnessSlaHours * 60 * 60 * 1000),
  };
}

const CEO_METRIC_CALCULATORS: Record<string, CeoMetricCalculator> = {
  "development.delivery_health": ({ latestSnapshots }) => ({
    value: ["linear", "github", "posthog"].every((key) => latestSnapshots.has(key)) ? 100 : null,
    priorValue: null,
    delta: null,
  }),
  "finance.cash_balance": ({ latestSnapshots }) => {
    const mercury = latestSnapshots.get("mercury")?.payload;
    const cash = cashBreakdownFromMercury(mercury);
    return {
      value: cash.totalCash,
      priorValue: null,
      delta: null,
      details: [
        { key: "bankCash", label: "Bank cash", value: cash.bankCash, unit: "currency" },
        { key: "treasuryCash", label: "Treasury cash", value: cash.treasuryCash, unit: "currency" },
        { key: "totalCash", label: "Total cash", value: cash.totalCash, unit: "currency" },
      ],
    };
  },
  "finance.cash_runway_months": ({ latestSnapshots }) => {
    const mercury = latestSnapshots.get("mercury")?.payload;
    const cash = cashBreakdownFromMercury(mercury);
    const netBurn = getFirstNumber(mercury, [
      ["cashFlow", "netBurn"],
      ["cashFlow", "burnRate"],
      ["netBurn"],
      ["burnRate"],
    ]);
    return {
      value: cash.totalCash !== null && netBurn && netBurn > 0 ? Math.round((cash.totalCash / netBurn) * 100) / 100 : null,
      priorValue: null,
      delta: null,
      details: [
        { key: "cashBalance", label: "Cash balance", value: cash.totalCash, unit: "currency" },
        { key: "netBurn", label: "Net burn", value: netBurn, unit: "currency" },
      ],
    };
  },
  "finance.net_burn": ({ latestSnapshots }) => {
    const mercury = latestSnapshots.get("mercury")?.payload;
    const explicitNetBurn = getFirstNumber(mercury, [
      ["cashFlow", "netBurn"],
      ["cashFlow", "burnRate"],
      ["netBurn"],
      ["burnRate"],
    ]);
    const cashInflow = getFirstNumber(mercury, [["cashFlow", "inflows30d"], ["inflows30d"]]) ?? 0;
    const cashOutflow = getFirstNumber(mercury, [["cashFlow", "outflows30d"], ["outflows30d"]]) ?? 0;
    return {
      value: explicitNetBurn ?? (cashOutflow > 0 || cashInflow > 0 ? cashOutflow - cashInflow : null),
      priorValue: null,
      delta: null,
      details: [
        { key: "cashInflow", label: "Cash inflow", value: cashInflow, unit: "currency" },
        { key: "cashOutflow", label: "Cash outflow", value: cashOutflow, unit: "currency" },
      ],
    };
  },
  "finance.expenses": ({ latestSnapshots }) => {
    const mercury = latestSnapshots.get("mercury")?.payload;
    const expenses = getFirstNumber(mercury, [
      ["cashFlow", "expenses"],
      ["cashFlow", "outflows30d"],
      ["expenses"],
      ["outflows30d"],
    ]);
    return { value: expenses, priorValue: null, delta: null };
  },
  "finance.gross_margin": ({ latestSnapshots }) => {
    const stripe = latestSnapshots.get("stripe")?.payload;
    const mercury = latestSnapshots.get("mercury")?.payload;
    const revenue = getFirstNumber(stripe, [["revenue", "mrr"], ["mrr"]]);
    const cogs = getFirstNumber(mercury, [["cashFlow", "costOfGoodsSold"], ["costOfGoodsSold"]]) ?? 0;
    return {
      value: revenue && revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 10_000) / 100 : null,
      priorValue: null,
      delta: null,
      details: [
        { key: "revenue", label: "Revenue", value: revenue, unit: "currency" },
        { key: "costOfGoodsSold", label: "Cost of goods sold", value: cogs, unit: "currency" },
      ],
    };
  },
  "finance.mrr": ({ latestSnapshots }) => {
    const breakdown = subscriptionBreakdownFromSnapshots(latestSnapshots);
    return {
      value: breakdown.totalMrr,
      priorValue: null,
      delta: breakdown.stripeMrrChange,
      details: [
        { key: "stripeMrr", label: "Stripe MRR", value: breakdown.stripeMrr, unit: "currency" },
        {
          key: "hubspotOnlySubscriptionMrr",
          label: "HubSpot-only subscription MRR",
          value: breakdown.hubspotOnlySubscriptionMrr,
          unit: "currency",
        },
        {
          key: "excludedLinkedHubspotSubscriptionMrr",
          label: "Linked HubSpot subscription MRR excluded",
          value: breakdown.excludedLinkedHubspotSubscriptionMrr,
          unit: "currency",
        },
        { key: "totalMrr", label: "Total MRR", value: breakdown.totalMrr, unit: "currency" },
      ],
    };
  },
  "revenue.mrr": ({ latestSnapshots }) => {
    const breakdown = subscriptionBreakdownFromSnapshots(latestSnapshots);
    return {
      value: breakdown.totalMrr,
      priorValue: null,
      delta: breakdown.stripeMrrChange,
      details: [
        { key: "stripeMrr", label: "Stripe MRR", value: breakdown.stripeMrr, unit: "currency" },
        {
          key: "hubspotOnlySubscriptionMrr",
          label: "HubSpot-only subscription MRR",
          value: breakdown.hubspotOnlySubscriptionMrr,
          unit: "currency",
        },
        {
          key: "excludedLinkedHubspotSubscriptionMrr",
          label: "Linked HubSpot subscription MRR excluded",
          value: breakdown.excludedLinkedHubspotSubscriptionMrr,
          unit: "currency",
        },
        { key: "totalMrr", label: "Total MRR", value: breakdown.totalMrr, unit: "currency" },
      ],
    };
  },
  "revenue.arr": ({ latestSnapshots }) => {
    const breakdown = subscriptionBreakdownFromSnapshots(latestSnapshots);
    return {
      value: breakdown.totalArr,
      priorValue: null,
      delta: breakdown.stripeMrrChange === null ? null : breakdown.stripeMrrChange * 12,
    };
  },
  "revenue.subscription_revenue": ({ latestSnapshots }) => {
    const breakdown = subscriptionBreakdownFromSnapshots(latestSnapshots);
    return {
      value: breakdown.totalArr,
      priorValue: null,
      delta: breakdown.stripeMrrChange === null ? null : breakdown.stripeMrrChange * 12,
    };
  },
  "revenue.services_revenue": ({ latestSnapshots }) => {
    const hubspot = latestSnapshots.get("hubspot")?.payload;
    return {
      value: getFirstNumber(hubspot, [["servicesRevenue"], ["revenue", "services"]]),
      priorValue: null,
      delta: null,
    };
  },
  "revenue.active_subscriptions": ({ latestSnapshots }) => {
    const breakdown = subscriptionBreakdownFromSnapshots(latestSnapshots);
    return {
      value: breakdown.mergedActiveSubscriptions,
      priorValue: null,
      delta: null,
      details: [
        { key: "stripeActiveSubscriptions", label: "Stripe active subscriptions", value: breakdown.stripeActiveSubscriptions, unit: "count" },
        { key: "hubspotOnlyActiveSubscriptions", label: "HubSpot-only active subscriptions", value: breakdown.hubspotOnlyActiveSubscriptions, unit: "count" },
      ],
    };
  },
  "revenue.customer_count": ({ latestSnapshots }) => {
    const breakdown = subscriptionBreakdownFromSnapshots(latestSnapshots);
    return {
      value: breakdown.mergedActiveSubscriptions,
      priorValue: null,
      delta: null,
    };
  },
  "sales.open_pipeline_value": ({ latestSnapshots }) => {
    const hubspot = latestSnapshots.get("hubspot")?.payload;
    return {
      value: qualifiedPipelineFromHubSpot(hubspot),
      priorValue: null,
      delta: null,
    };
  },
  "sales.qualified_pipeline": ({ latestSnapshots }) => ({
    value: qualifiedPipelineFromHubSpot(latestSnapshots.get("hubspot")?.payload),
    priorValue: null,
    delta: null,
  }),
  "sales.demos": ({ latestSnapshots }) => ({
    value: demoCountFromSnapshots(latestSnapshots),
    priorValue: null,
    delta: null,
  }),
  "retention.at_risk_accounts": ({ retentionMetric }) => ({
    value: retentionMetric.atRiskAccounts,
    priorValue: null,
    delta: null,
  }),
  "customer_success.support_load": ({ latestSnapshots }) => {
    const pylon = latestSnapshots.get("pylon")?.payload;
    return {
      value: getFirstNumber(pylon, [["openIssues"], ["openConversations"], ["summary", "openIssues"]]),
      priorValue: null,
      delta: null,
    };
  },
  "customer_success.customer_health": ({ latestSnapshots, retentionMetric }) => {
    const pylon = latestSnapshots.get("pylon")?.payload;
    const openSupportIssues = getFirstNumber(pylon, [["openIssues"], ["openConversations"], ["summary", "openIssues"]]) ?? 0;
    const risk = (retentionMetric.atRiskAccounts ?? 0) * 10 + openSupportIssues * 5;
    return {
      value: Math.max(0, 100 - risk),
      priorValue: null,
      delta: null,
      details: [
        { key: "atRiskAccounts", label: "At-risk accounts", value: retentionMetric.atRiskAccounts, unit: "count" },
        { key: "openSupportIssues", label: "Open support issues", value: openSupportIssues, unit: "count" },
      ],
    };
  },
  "customer_success.customer_activity": ({ latestSnapshots }) => {
    const posthog = latestSnapshots.get("posthog")?.payload;
    const pylon = latestSnapshots.get("pylon")?.payload;
    const slack = latestSnapshots.get("slack")?.payload;
    const googleWorkspace = latestSnapshots.get("googleWorkspace")?.payload;
    const count =
      (getFirstNumber(posthog, [["activeAccounts30d"], ["activeUsers30d"], ["activatedAccounts30d"]]) ?? 0) +
      (getFirstNumber(pylon, [["openIssues"], ["openConversations"], ["summary", "openIssues"]]) ?? 0) +
      (getFirstNumber(slack, [["customerMessages30d"], ["messages30d"]]) ?? 0) +
      (getFirstNumber(googleWorkspace, [["customerMeetings30d"], ["meetings30d"]]) ?? 0);
    return { value: count > 0 ? count : null, priorValue: null, delta: null };
  },
  "customer_success.churn_rate": ({ latestSnapshots }) => ({
    value: getFirstNumber(latestSnapshots.get("hubspot")?.payload, [["churnRate"], ["retention", "churnRate"]]),
    priorValue: null,
    delta: null,
  }),
  "customer_success.retention_rate": ({ latestSnapshots }) => ({
    value: getFirstNumber(latestSnapshots.get("hubspot")?.payload, [["retentionRate"], ["retention", "retentionRate"]]),
    priorValue: null,
    delta: null,
  }),
  "customer_success.retention_risk": ({ retentionMetric }) => ({
    value: retentionMetric.atRiskAccounts,
    priorValue: null,
    delta: null,
  }),
  "website.sessions": ({ latestSnapshots }) => {
    const googleAnalytics = latestSnapshots.get("googleAnalytics")?.payload;
    return {
      value: getFirstNumber(googleAnalytics, [
        ["sessions30d"],
        ["overview", "sessions"],
        ["sessions"],
        ["traffic", "sessions"],
      ]),
      priorValue: null,
      delta: null,
    };
  },
  "marketing.website_traffic": ({ latestSnapshots }) => {
    const traffic = websiteTrafficFromSnapshots(latestSnapshots);
    return {
      value: traffic.value,
      priorValue: null,
      delta: null,
      details: [
        { key: "websiteSessions", label: "Website sessions", value: traffic.websiteSessions, unit: "count" },
        { key: "organicTraffic", label: "Organic traffic", value: traffic.organicTraffic, unit: "count" },
        { key: "searchClicks", label: "Search clicks", value: traffic.searchClicks, unit: "count" },
        { key: "searchImpressions", label: "Search impressions", value: traffic.searchImpressions, unit: "count" },
      ],
    };
  },
  "marketing.conversion_rate": ({ latestSnapshots }) => {
    const traffic = websiteTrafficFromSnapshots(latestSnapshots);
    const webflow = latestSnapshots.get("webflow")?.payload;
    const submissions = getFirstNumber(webflow, [["formSubmissions"], ["demoRequests"], ["forms", "submissions"]]);
    return {
      value: traffic.websiteSessions && submissions !== null ? Math.round((submissions / traffic.websiteSessions) * 10_000) / 100 : null,
      priorValue: null,
      delta: null,
      details: [
        { key: "conversions", label: "Conversions", value: submissions, unit: "count" },
        { key: "websiteSessions", label: "Website sessions", value: traffic.websiteSessions, unit: "count" },
      ],
    };
  },
  "social.paid_spend": ({ latestSnapshots }) => {
    const spend = paidSpendFromSnapshots(latestSnapshots);
    return { value: spend > 0 ? spend : null, priorValue: null, delta: null };
  },
  "marketing.pipeline_efficiency": ({ latestSnapshots }) => {
    const pipeline = qualifiedPipelineFromHubSpot(latestSnapshots.get("hubspot")?.payload);
    const spend = paidSpendFromSnapshots(latestSnapshots);
    return {
      value: pipeline !== null && spend > 0 ? Math.round((pipeline / spend) * 100) / 100 : null,
      priorValue: null,
      delta: null,
      details: [
        { key: "qualifiedPipeline", label: "Qualified pipeline", value: pipeline, unit: "currency" },
        { key: "acquisitionSpend", label: "Acquisition spend", value: spend, unit: "currency" },
      ],
    };
  },
  "product.activation_rate": ({ latestSnapshots }) => {
    const posthog = latestSnapshots.get("posthog")?.payload;
    const hubspot = latestSnapshots.get("hubspot")?.payload;
    const activated = getFirstNumber(posthog, [["activatedAccounts30d"], ["activation", "activatedAccounts"]]);
    const eligible = getFirstNumber(hubspot, [["eligibleAccounts"], ["accounts", "eligible"]]);
    return {
      value: activated !== null && eligible && eligible > 0 ? Math.round((activated / eligible) * 10_000) / 100 : activated,
      priorValue: null,
      delta: null,
    };
  },
};

function healthScoreForDefinition(input: MetricCalculatorInput): MetricCalculation {
  const trust = evaluateMetricTrust({
    asOf: input.asOf,
    freshnessSlaHours: input.definition.freshnessSlaHours,
    requiredSourceKeys: input.definition.sourceDependencies,
    optionalSourceKeys: input.definition.optionalSourceDependencies,
    sources: input.sourceSamples,
  });
  const scoreByStatus: Record<CeoMetricTrustStatus, number> = {
    fresh: 100,
    stale: 70,
    partial: 55,
    conflicted: 35,
    missing: 0,
    error: 0,
  };
  return { value: scoreByStatus[trust.status], priorValue: null, delta: null };
}

async function loadRetentionMetricSource(input: {
  organizationId: string | null;
  asOf: Date;
}): Promise<RetentionMetricSource> {
  if (!input.organizationId) {
    return {
      atRiskAccounts: null,
      source: { sourceKey: "retention", sourceId: null, status: "MISSING" },
    };
  }

  const [atRiskAccounts, latest] = await Promise.all([
    prisma.retentionTenantCurrent.count({
      where: {
        organizationId: input.organizationId,
        status: RetentionTenantStatus.AT_RISK,
      },
    }),
    prisma.retentionTenantCurrent.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: [{ lastMaterializedAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true, lastMaterializedAt: true, updatedAt: true },
    }),
  ]);

  if (!latest) {
    return {
      atRiskAccounts: null,
      source: { sourceKey: "retention", sourceId: null, status: "MISSING" },
    };
  }

  const capturedAt = latest.lastMaterializedAt ?? latest.updatedAt ?? input.asOf;
  return {
    atRiskAccounts,
    source: {
      sourceKey: "retention",
      sourceId: latest.id,
      status: "SUCCESS",
      capturedAt,
      expiresAt: new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000),
    },
  };
}

function valueForDefinition(input: MetricCalculatorInput): MetricCalculation {
  const calculator = CEO_METRIC_CALCULATORS[input.definition.key];
  if (calculator) return calculator(input);
  if (input.definition.key.startsWith("domain.") || input.definition.key.startsWith("source.")) {
    return healthScoreForDefinition(input);
  }
  return { value: null, priorValue: null, delta: null };
}

function verifiedMetricKeysForDefinitions(definitions: CeoMetricDefinition[]): Set<string> {
  const boardGradeKeys = getDefaultBoardGradeMetricKeys(definitions);
  return new Set(
    definitions
      .filter((definition) => definition.key in CEO_METRIC_CALCULATORS || definition.key.startsWith("domain."))
      .map((definition) => definition.key)
      .filter((key) => boardGradeKeys.has(key))
  );
}

async function loadLatestAnalyticsSnapshots(input: {
  userId: string;
  sourceKeys: string[];
  asOf: Date;
}): Promise<AnalyticsSnapshotSample[]> {
  const sourceKeyLookup = sourceKeyVariantLookup(input.sourceKeys);
  const providerKeys = Array.from(sourceKeyLookup.keys());
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: {
      userId: input.userId,
      providerKey: { in: providerKeys },
      capturedAt: { lte: input.asOf },
    },
    orderBy: [{ capturedAt: "desc" }],
    select: {
      id: true,
      providerKey: true,
      status: true,
      capturedAt: true,
      expiresAt: true,
      lastError: true,
      payload: true,
    },
  });

  return snapshots
    .filter((snapshot) => snapshot.capturedAt.getTime() <= input.asOf.getTime())
    .map((snapshot) => ({
      ...snapshot,
      providerKey: sourceKeyLookup.get(snapshot.providerKey) ?? snapshot.providerKey,
    }));
}

async function upsertMetricDefinitions(definitions: CeoMetricDefinition[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    definitions.map((definition) =>
      prisma.ceoMetricDefinition.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          label: definition.label,
          domain: definition.domain,
          ownerAudience: audienceToDb(definition.ownerAudience),
          unit: metricUnitToDb(definition.unit),
          calculationVersion: definition.calculationVersion,
          sourceDependencies: definition.sourceDependencies,
          freshnessSlaHours: definition.freshnessSlaHours,
          boardEligible: definition.boardEligible,
          weeklyEligible: definition.weeklyEligible,
          description: definition.description,
        },
        update: {
          label: definition.label,
          domain: definition.domain,
          ownerAudience: audienceToDb(definition.ownerAudience),
          unit: metricUnitToDb(definition.unit),
          calculationVersion: definition.calculationVersion,
          sourceDependencies: definition.sourceDependencies,
          freshnessSlaHours: definition.freshnessSlaHours,
          boardEligible: definition.boardEligible,
          weeklyEligible: definition.weeklyEligible,
          description: definition.description,
        },
        select: { id: true, key: true },
      })
    )
  );

  return new Map(entries.map((entry) => [entry.key, entry.id]));
}

async function persistMetricSnapshots(input: {
  metrics: CeoMetricValue[];
  definitionIds: Map<string, string>;
  userId: string;
  organizationId: string | null;
}): Promise<void> {
  for (const metric of input.metrics) {
    const valueSnapshot = await prisma.ceoMetricValueSnapshot.create({
      data: {
        metricKey: metric.definition.key,
        definitionId: input.definitionIds.get(metric.definition.key) ?? null,
        userId: input.userId,
        organizationId: input.organizationId,
        periodStart: new Date(metric.periodStart),
        periodEnd: new Date(metric.periodEnd),
        value: toPrismaJson(metric.value),
        priorValue: toPrismaJson(metric.priorValue),
        delta: metric.delta,
        asOf: new Date(metric.asOf),
        computedAt: new Date(metric.computedAt),
        trustStatus: metricTrustToDb(metric.trust.status),
        confidence: metric.trust.confidence,
        warnings: metric.trust.warnings,
        sourceState: toPrismaJson(metric.trust.sourceStates),
      },
      select: { id: true },
    });

    if (metric.lineage.length > 0) {
      await prisma.ceoMetricSourceLineage.createMany({
        data: metric.lineage.map((lineage) => ({
          valueSnapshotId: valueSnapshot.id,
          sourceKey: lineage.sourceKey,
          sourceType: "analytics_snapshot",
          sourceId: lineage.sourceId,
          capturedAt: lineage.capturedAt ? new Date(lineage.capturedAt) : null,
          metadata: Prisma.JsonNull,
        })),
      });
    }
  }
}

export async function loadCeoMetricSnapshot(input: {
  userId: string;
  organizationId?: string | null;
  persist?: boolean;
}): Promise<CeoMetricSnapshotPayload> {
  const definitions = getDefaultCeoMetricDefinitions();
  const sourceKeys = definitions.flatMap(sourceKeysForDefinition);
  const asOf = new Date();
  const snapshots = await loadLatestAnalyticsSnapshots({ userId: input.userId, sourceKeys, asOf });
  const latestSnapshots = latestSnapshotByProvider(snapshots);
  const snapshotSourceSamples = snapshots.map(sourceSampleFromSnapshot);
  const retentionMetric = await loadRetentionMetricSource({
    organizationId: input.organizationId ?? null,
    asOf,
  });
  const sourceSamples = [
    ...snapshotSourceSamples,
    derivedSourceSample({
      sourceKey: "customerJourney",
      sourceId: "derived:customerJourney",
      asOf,
      freshnessSlaHours: 24,
      requiredSourceKeys: ["hubspot"],
      sources: snapshotSourceSamples,
    }),
    derivedSourceSample({
      sourceKey: "demoAnalytics",
      sourceId: "derived:demoAnalytics",
      asOf,
      freshnessSlaHours: 24,
      requiredSourceKeys: ["hubspot"],
      sources: snapshotSourceSamples,
    }),
    derivedSourceSample({
      sourceKey: "processAnalytics",
      sourceId: "derived:processAnalytics",
      asOf,
      freshnessSlaHours: 1,
      requiredSourceKeys: ["hubspot"],
      sources: snapshotSourceSamples,
    }),
    retentionMetric.source,
  ];
  const computedAt = new Date().toISOString();
  const periodEnd = asOf.toISOString();
  const periodStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const reportPacks = buildDefaultCeoReportPacks(definitions);

  const metrics: CeoMetricValue[] = definitions.map((definition) => {
    const trust = evaluateMetricTrust({
      asOf,
      freshnessSlaHours: definition.freshnessSlaHours,
      requiredSourceKeys: definition.sourceDependencies,
      optionalSourceKeys: definition.optionalSourceDependencies,
      sources: sourceSamples,
    });
    const value = valueForDefinition({
      definition,
      latestSnapshots,
      retentionMetric,
      sourceSamples,
      asOf,
    });

    return {
      definition,
      value: value.value,
      priorValue: value.priorValue,
      delta: value.delta,
      details: value.details,
      periodStart,
      periodEnd,
      asOf: periodEnd,
      computedAt,
      trust,
      lineage: trust.sourceStates
        .filter((state) => state.sourceId || state.capturedAt)
        .map((state) => ({
          sourceKey: state.sourceKey,
          sourceId: state.sourceId,
          capturedAt: state.capturedAt,
        })),
    };
  });

  const trustSummary = TRUST_SUMMARY_KEYS.reduce(
    (summary, key) => {
      summary[key] = metrics.filter((metric) => metric.trust.status === key).length;
      return summary;
    },
    {} as Record<CeoMetricTrustStatus, number>
  );

  const definitionIds = await upsertMetricDefinitions(definitions);
  if (input.persist) {
    await persistMetricSnapshots({
      metrics,
      definitionIds,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
    });
  }
  const readiness = computeCeoReadiness({
    reportPacks,
    metrics,
    verifiedMetricKeys: verifiedMetricKeysForDefinitions(definitions),
  });

  return {
    generatedAt: computedAt,
    periodStart,
    periodEnd,
    definitions,
    metrics,
    reportPacks,
    trustSummary,
    readiness,
  };
}

export async function listCeoReportPacks(): Promise<CeoReportPack[]> {
  return buildDefaultCeoReportPacks(getDefaultCeoMetricDefinitions());
}

export async function createCeoReportRun(input: {
  userId: string;
  organizationId?: string | null;
  packSlug: string;
}): Promise<CreateCeoReportRunResult> {
  const snapshot = await loadCeoMetricSnapshot({
    userId: input.userId,
    organizationId: input.organizationId,
    persist: true,
  });
  const pack = snapshot.reportPacks.find((candidate) => candidate.slug === input.packSlug);
  if (!pack) {
    throw new Error(`Unknown CEO report pack: ${input.packSlug}`);
  }

  const run = buildMetricReportRun({ pack, metrics: snapshot.metrics, readiness: snapshot.readiness });
  const persisted = await prisma.ceoReportRun.create({
    data: {
      packSlug: run.packSlug,
      packName: run.packName,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      generatedAt: new Date(run.generatedAt),
      metricPayload: toPrismaJson(run.metrics),
      deterministicNotes: run.deterministicNotes,
      markdown: run.markdown,
      csv: run.csv,
      slideJson: toPrismaJson(run.slideJson),
    },
    select: { id: true },
  });

  return {
    ...run,
    id: persisted.id,
    boardFinal: null,
  };
}

export async function createMonthlyInvestorReportRun(input: {
  userId: string;
  organizationId?: string | null;
  now?: Date;
}): Promise<MonthlyInvestorReportRunResult> {
  const { start, end } = monthWindow(input.now);
  const existing = await (prisma.ceoReportRun as unknown as CeoReportRunDelegate).findFirst({
    where: {
      packSlug: "investor-update",
      generatedAt: {
        gte: start,
        lt: end,
      },
      OR: [
        { userId: input.userId },
        ...(input.organizationId ? [{ organizationId: input.organizationId }] : []),
      ],
    },
    orderBy: { generatedAt: "desc" },
    select: CEO_REPORT_RUN_SELECT,
  });

  if (existing) {
    return {
      created: false,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      run: reportRunFromRow(existing),
    };
  }

  const run = await createCeoReportRun({
    userId: input.userId,
    organizationId: input.organizationId,
    packSlug: "investor-update",
  });

  return {
    created: true,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    run,
  };
}

export async function getCeoReportRun(input: {
  userId: string;
  organizationId?: string | null;
  runId: string;
}): Promise<CreateCeoReportRunResult | null> {
  const row = await (prisma.ceoReportRun as unknown as CeoReportRunDelegate).findFirst({
    where: {
      id: input.runId,
      OR: [
        { userId: input.userId },
        ...(input.organizationId ? [{ organizationId: input.organizationId }] : []),
      ],
    },
    select: CEO_REPORT_RUN_SELECT,
  });
  if (!row) return null;

  return reportRunFromRow(row);
}

export async function approveCeoReportRun(input: {
  userId: string;
  organizationId?: string | null;
  runId: string;
  overrideReason?: string | null;
}): Promise<CreateCeoReportRunResult> {
  const overrideReason =
    typeof input.overrideReason === "string" && input.overrideReason.trim()
      ? input.overrideReason.trim()
      : null;
  const existing = await (prisma.ceoReportRun as unknown as CeoReportRunDelegate).findFirst({
    where: {
      id: input.runId,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    },
    select: CEO_REPORT_RUN_SELECT,
  });
  if (!existing) {
    throw new Error("CEO report run not found");
  }

  const readiness = reportReadinessFromSlideJson(existing.slideJson);
  if (readiness?.ready !== true && !overrideReason) {
    throw new Error("Board-final approval requires board-ready report or override reason");
  }

  const updated = await (prisma.ceoReportRun as unknown as CeoReportRunDelegate).update({
    where: { id: input.runId },
    data: {
      boardFinalAt: new Date(),
      boardFinalApprovedById: input.userId,
      boardFinalOverrideReason: overrideReason,
    },
    select: CEO_REPORT_RUN_SELECT,
  });

  return reportRunFromRow(updated);
}
