import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { IntegrationProvider } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma, type PrismaClientType } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { runWithContextAsync } from "@/lib/request-context";
import { getAuthenticatedUser } from "@/lib/session-user";
import { getCredentials } from "@/lib/analytics/credentials";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { computeProgressPct } from "@/lib/analytics/finance-utils";
import { normalizeStoredBudgetEndDate } from "@/lib/analytics/budget-period";
import { normalizeMercuryExpenseMappings } from "@/lib/analytics/mercury-expense-mappings";
import { normalizeMercuryDataPayload } from "@/lib/analytics/mercury-normalization";
import { createEmptyAnalyticsDashboardData, patchFreshnessWithStale } from "@/lib/analytics/response-shape";
import {
  analyticsErrorFromReason,
  createAnalyticsDomainError,
} from "@/lib/analytics/error-attribution";
import {
  readLatestSnapshot,
  readLatestSuccessfulSnapshot,
  snapshotExpiryFromNow,
  storeAnalyticsSnapshot,
  storeAnalyticsSnapshotFailure,
} from "@/lib/analytics/snapshots";
import { buildAnalyticsRouteMeta } from "@/lib/analytics/route-meta";
import { computeAnalyticsKpis } from "@/lib/analytics/kpis";
import { computeKpiDelta } from "@/lib/analytics/kpi-deltas";
import {
  buildVisitorFunnelData,
  parseVisitorFunnelFilters,
  syncVisitorFunnelArtifacts,
} from "@/lib/analytics/visitor-funnel";
import { getVisitorFunnelPrisma } from "@/lib/analytics/visitor-funnel-availability";
import type {
  AnalyticsDashboardData,
  AnalyticsRecommendation,
  BudgetData,
  BudgetLineItemData,
  FinancialGoalData,
  FinancialPlanningData,
  ForecastAssumptions,
  ForecastScenarioData,
  GoalMetric,
  GoalStatus,
  IntegrationTelemetryData,
  ProductSuccessData,
  StripeData,
  MercuryData,
  MercuryExpenseMapping,
  HubSpotData,
} from "@/lib/analytics/types";
import { MERCURY_CASHFLOW_SYNC_RULE_KEY } from "@/lib/integrations/provider-metrics-sync";

export const revalidate = 300;

type DomainKey =
  | "hubspot"
  | "salesPerformance"
  | "stripe"
  | "mercury"
  | "googleAnalytics"
  | "googleAds"
  | "metaAds"
  | "metaPage"
  | "instagram"
  | "redditAds"
  | "webflow"
  | "coda"
  | "semrush"
  | "pylon"
  | "product"
  | "googleWorkspace"
  | "slack"
  | "hubspotOps"
  | "codaOps"
  | "redditOps"
  | "lifecycleFunnel"
  | "funnelJourney"
  | "aiInsights"
  | "recommendations"
  | "distilledInsights"
  | "customerJourney"
  | "visitorFunnel"
  | "demoAnalytics"
  | "processAnalytics";

const ALL_DOMAINS: DomainKey[] = [
  "hubspot",
  "stripe",
  "mercury",
  "googleAnalytics",
  "googleAds",
  "metaAds",
  "metaPage",
  "instagram",
  "redditAds",
  "webflow",
  "coda",
  "semrush",
  "pylon",
  "product",
  "googleWorkspace",
  "slack",
  "hubspotOps",
  "codaOps",
  "redditOps",
  "lifecycleFunnel",
  "funnelJourney",
  "aiInsights",
  "recommendations",
  "distilledInsights",
  "customerJourney",
  "demoAnalytics",
  "processAnalytics",
];

const SECTION_DOMAINS: Record<string, DomainKey[]> = {
  overview: [
    "googleAnalytics",
    "hubspot",
    "stripe",
    "mercury",
    "pylon",
    "product",
    "googleWorkspace",
    "slack",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "ai-insights": [...ALL_DOMAINS],
  "ads-traffic": [
    "googleAnalytics",
    "googleAds",
    "metaAds",
    "instagram",
    "redditAds",
    "webflow",
    "semrush",
    "coda",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  finance: [
    "mercury",
    "stripe",
    "hubspot",
    "hubspotOps",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "finance-planning": ["stripe", "mercury"],
  "finance-forecast": ["stripe", "mercury"],
  "finance-pnl": ["stripe", "mercury"],
  "finance-unit-economics": ["stripe", "mercury", "hubspot"],
  "sales-pipeline": [
    "hubspot",
    "stripe",
    "googleWorkspace",
    "slack",
    "hubspotOps",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "customer-success": [
    "pylon",
    "coda",
    "product",
    "googleWorkspace",
    "slack",
    "codaOps",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "ads-google-analytics": ["googleAnalytics"],
  "ads-google-ads": ["googleAds"],
  "ads-meta-ads": ["metaAds", "metaPage", "instagram"],
  "ads-reddit-ads": ["redditAds", "redditOps"],
  "ads-webflow": ["webflow"],
  "ads-semrush": ["semrush"],
  "ads-coda-kanban": ["coda", "codaOps"],
  "finance-mercury": ["mercury"],
  "finance-stripe": ["stripe"],
  "finance-hubspot": ["hubspot", "hubspotOps"],
  "sales-hubspot": ["hubspot", "hubspotOps"],
  "sales-stripe": ["stripe"],
  "sales-google-workspace": ["googleWorkspace"],
  "sales-slack": ["slack"],
  "cs-pylon": ["pylon"],
  "cs-google-workspace": ["googleWorkspace"],
  "cs-slack": ["slack"],

  "customer-journey": [
    "hubspot", "stripe", "mercury", "googleWorkspace", "slack",
    "webflow", "coda", "googleAnalytics", "googleAds", "metaAds",
    "instagram", "redditAds", "pylon", "customerJourney",
    "lifecycleFunnel", "funnelJourney", "aiInsights", "recommendations", "distilledInsights",
  ],
  "cj-overview": ["hubspot", "stripe", "googleWorkspace", "slack", "webflow", "googleAnalytics", "googleAds", "metaAds", "instagram", "redditAds", "pylon", "customerJourney"],
  "cj-touchpoints": ["hubspot", "stripe", "googleWorkspace", "slack", "webflow", "googleAnalytics", "googleAds", "metaAds", "instagram", "redditAds", "pylon", "customerJourney"],
  "cj-conversion": ["hubspot", "stripe", "googleWorkspace", "slack", "webflow", "googleAnalytics", "googleAds", "metaAds", "instagram", "redditAds", "pylon", "customerJourney"],
  "cj-acquisition-funnel": ["hubspot", "stripe", "coda", "visitorFunnel"],

  "demo-analytics": [
    "hubspot", "googleWorkspace", "demoAnalytics",
    "lifecycleFunnel", "funnelJourney", "aiInsights", "recommendations", "distilledInsights",
  ],
  "demo-scheduling": ["hubspot", "googleWorkspace", "demoAnalytics"],
  "demo-attribution": ["hubspot", "googleAds", "metaAds", "instagram", "redditAds", "googleAnalytics", "webflow", "demoAnalytics"],
  "demo-coaching": ["hubspot", "googleWorkspace", "demoAnalytics"],

  "process-analytics": [
    "hubspot", "stripe", "processAnalytics",
    "lifecycleFunnel", "funnelJourney", "aiInsights", "recommendations", "distilledInsights",
  ],
  "process-bottlenecks": ["hubspot", "processAnalytics"],
  "process-velocity": ["hubspot", "processAnalytics"],
  "process-health": ["hubspot", "stripe", "processAnalytics"],
  "process-throughput": ["hubspot", "processAnalytics"],

  "sales-performance": ["salesPerformance"],
};

const LEGACY_SECTION_ALIASES: Record<string, string> = {
  "cs-coda": "customer-success",
  "cs-product": "customer-success",
};

const INTEGRATION_TELEMETRY_DOMAINS = new Set<DomainKey>([
  "googleWorkspace",
  "hubspotOps",
  "slack",
  "codaOps",
  "redditOps",
]);

type LegacyIntegrationTrendPoint = {
  date: string;
  receipts: number;
  failures: number;
  automationsTriggered?: number;
  createdTasks?: number;
};

type LegacyIntegrationTelemetryData = Omit<IntegrationTelemetryData, "automationsTriggeredInRange" | "trend"> & {
  automationsTriggeredInRange?: number;
  tasksCreatedInRange?: number;
  trend?: LegacyIntegrationTrendPoint[];
};

function normalizeIntegrationTelemetryPayload(payload: unknown): IntegrationTelemetryData | unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;

  const telemetry = payload as LegacyIntegrationTelemetryData;
  const {
    tasksCreatedInRange,
    automationsTriggeredInRange,
    trend = [],
    ...rest
  } = telemetry;

  return {
    ...rest,
    automationsTriggeredInRange:
      typeof automationsTriggeredInRange === "number"
        ? automationsTriggeredInRange
        : typeof tasksCreatedInRange === "number"
          ? tasksCreatedInRange
          : 0,
    trend: trend.map(({ createdTasks, automationsTriggered, ...point }) => ({
      ...point,
      automationsTriggered:
        typeof automationsTriggered === "number"
          ? automationsTriggered
          : typeof createdTasks === "number"
            ? createdTasks
            : 0,
    })),
  } as IntegrationTelemetryData;
}

function loadOnce<T>(loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    if (!promise) {
      promise = loader();
    }
    return promise;
  };
}

const loadCoreAnalyticsFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers")
);
const loadGaWebflowFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers-ga-webflow")
);
const loadAdsFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers-ads")
);
const loadCodaFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers-coda")
);
const loadSemrushFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers-semrush")
);
const loadPylonFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers-pylon")
);
const loadIntegrationTelemetryFetchers = loadOnce(
  () => import("@/lib/analytics/fetchers-integrations")
);
const loadFunnelBuilders = loadOnce(
  () => import("@/lib/analytics/funnel")
);
const loadCustomerJourneyBuilder = loadOnce(
  () => import("@/lib/analytics/customer-journey")
);
const loadDemoAnalyticsBuilder = loadOnce(
  () => import("@/lib/analytics/demo-analytics")
);
const loadProcessAnalyticsBuilder = loadOnce(
  () => import("@/lib/analytics/process-analytics")
);
const loadInsightBuilders = loadOnce(
  () => import("@/lib/analytics/insight-engine")
);
const loadPnlBuilder = loadOnce(
  () => import("@/lib/analytics/pnl-builder")
);
const loadUnitEconomicsBuilder = loadOnce(
  () => import("@/lib/analytics/unit-economics")
);
const loadForecastBuilder = loadOnce(
  () => import("@/lib/analytics/forecast-engine")
);
const loadBudgetVarianceBuilder = loadOnce(
  () => import("@/lib/analytics/budget-variance")
);

function requiredDomainsForSection(section: string | null): Set<DomainKey> {
  if (!section) return new Set(ALL_DOMAINS);
  const normalizedSection = LEGACY_SECTION_ALIASES[section] ?? section;
  return new Set(SECTION_DOMAINS[normalizedSection] ?? ALL_DOMAINS);
}

async function resolveAnalyticsOrganizationId(
  session: unknown,
  userId: string
): Promise<string | null> {
  const sessionUser = getAuthenticatedUser(session as { user?: unknown } | null | undefined);
  if (sessionUser?.organizationId) {
    return sessionUser.organizationId;
  }

  return (
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      })
    )?.organizationId ?? null
  );
}

const DEFAULT_DOMAIN_TIMEOUT_MS = 8_500;
const STRIPE_DOMAIN_TIMEOUT_MS = 20_000;

function timeoutMsForDomain(domain: DomainKey): number {
  return domain === "stripe" ? STRIPE_DOMAIN_TIMEOUT_MS : DEFAULT_DOMAIN_TIMEOUT_MS;
}

function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    fn()
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("timed out")) return true;
    if (msg.includes("fetch failed")) return true;
    const statusMatch = msg.match(/\((\d{3})\)/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      return status === 429 || (status >= 500 && status <= 599);
    }
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const { maxAttempts = 2, baseDelayMs = 500 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1 && isRetryableError(error)) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function normalizeLookupKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

async function hydrateStripeCustomerLinks(
  userId: string,
  data: AnalyticsDashboardData
): Promise<void> {
  if (!data.hubspot?.deals?.length) return;

  type StripeCustomerLinkRow = {
    hubspotDealId: string;
    hubspotDealName: string | null;
    stripeCustomerId: string;
  };

  type StripeCustomerLinkDelegate = {
    findMany: (args: { where: { userId: string } }) => Promise<StripeCustomerLinkRow[]>;
  };

  const stripeCustomerLink = (prisma as unknown as { stripeCustomerLink?: StripeCustomerLinkDelegate })
    .stripeCustomerLink;
  if (!stripeCustomerLink) {
    console.warn("[analytics] Prisma client missing StripeCustomerLink delegate");
    return;
  }

  const links = await stripeCustomerLink.findMany({
    where: { userId },
  });
  if (links.length === 0) return;

  const byDealId = new Map(links.map((link) => [link.hubspotDealId, link.stripeCustomerId]));
  const byDealName = new Map(
    links
      .filter((link) => link.hubspotDealName)
      .map((link) => [normalizeLookupKey(link.hubspotDealName), link.stripeCustomerId])
  );

  data.hubspot.deals = data.hubspot.deals.map((deal) => {
    const mapped =
      byDealId.get(deal.dealId) ||
      byDealName.get(normalizeLookupKey(deal.dealName));
    return {
      ...deal,
      stripeCustomerId: deal.stripeCustomerId ?? mapped ?? null,
    };
  });
}

async function computeProductSuccessData(from: Date, to: Date): Promise<ProductSuccessData> {
  const [createdTasksInRange, completedTasksInRange, overdueOpenTasks, contributors] = await Promise.all([
    prisma.task.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.task.count({ where: { completedOn: { gte: from, lte: to } } }),
    prisma.task.count({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: to },
      },
    }),
    prisma.statusHistory.findMany({
      where: {
        changedAt: { gte: from, lte: to },
        changedBy: { not: null },
      },
      distinct: ["changedBy"],
      select: { changedBy: true },
    }),
  ]);

  const activeContributors = contributors.filter((entry) => Boolean(entry.changedBy)).length;
  const backlogGrowth = createdTasksInRange - completedTasksInRange;
  const throughputRate =
    createdTasksInRange > 0 ? Math.round((completedTasksInRange / createdTasksInRange) * 10000) / 100 : null;

  return {
    activeContributors,
    createdTasksInRange,
    completedTasksInRange,
    overdueOpenTasks,
    backlogGrowth,
    throughputRate,
    _meta: {
      fetchedAt: new Date().toISOString(),
      nextRefresh: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      source: "live",
    },
  };
}

function buildRecommendations(data: AnalyticsDashboardData): AnalyticsRecommendation[] {
  const recommendations: AnalyticsRecommendation[] = [];

  if ((data.googleAnalytics?.bounceRate ?? 0) > 0.55) {
    recommendations.push({
      id: "ads-bounce",
      section: "ads-traffic",
      severity: "warning",
      title: "Reduce high bounce traffic",
      insight: `Bounce rate is ${((data.googleAnalytics?.bounceRate ?? 0) * 100).toFixed(1)}%, indicating weak landing relevance.`,
      suggestedAction: "Launch A/B tests on top entry pages and tighten ad-to-page message match.",
    });
  }

  if ((data.hubspot?.funnel?.noShowRate ?? 0) > 15) {
    recommendations.push({
      id: "sales-noshow",
      section: "sales-pipeline",
      severity: "critical",
      title: "No-show rate is hurting conversion",
      insight: `${data.hubspot?.funnel?.noShows ?? 0} no-shows detected in the selected period.`,
      suggestedAction: "Create an automated reminder + reschedule sequence with a 24h and 1h cadence.",
    });
  }

  if ((data.mercury?.cashFlow?.runway ?? 0) > 0 && (data.mercury?.cashFlow?.runway ?? 0) < 4) {
    recommendations.push({
      id: "finance-runway",
      section: "finance",
      severity: "critical",
      title: "Cash runway is below 4 months",
      insight: `Estimated runway is ${(data.mercury?.cashFlow?.runway ?? 0).toFixed(1)} months.`,
      suggestedAction: "Cut non-performing spend and prioritize collections/revenue acceleration this month.",
    });
  }

  if ((data.product?.backlogGrowth ?? 0) > 0) {
    recommendations.push({
      id: "cs-backlog",
      section: "customer-success",
      severity: "warning",
      title: "Execution backlog is growing",
      insight: `Backlog grew by ${data.product?.backlogGrowth ?? 0} items in the selected range.`,
      suggestedAction: "Enable queue-throttling automations and rebalance owner load across active contributors.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "general-steady",
      section: "sales-pipeline",
      severity: "info",
      title: "Performance is stable",
      insight: "No major risk spikes were detected across the selected range.",
      suggestedAction: "Use this window to run one growth experiment in Ads and one cycle-time experiment in execution.",
    });
  }

  return recommendations;
}

function isForecastAssumptions(value: unknown): value is ForecastAssumptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Partial<ForecastAssumptions>;
  return (
    typeof c.revenueGrowthRate === "number" &&
    typeof c.churnRateDelta === "number" &&
    typeof c.burnRateDelta === "number" &&
    typeof c.additionalMonthlyExpense === "number" &&
    typeof c.additionalMonthlyRevenue === "number"
  );
}

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  revenueGrowthRate: 0,
  churnRateDelta: 0,
  burnRateDelta: 0,
  additionalMonthlyExpense: 0,
  additionalMonthlyRevenue: 0,
};

const LIVE_FIRST_FINANCE_SECTIONS = new Set([
  "overview",
  "finance",
  "finance-mercury",
  "finance-stripe",
  "finance-hubspot",
  "finance-planning",
  "finance-forecast",
  "finance-pnl",
  "finance-unit-economics",
]);

const FINANCIAL_PLANNING_SECTIONS = new Set([
  "finance",
  "finance-planning",
  "finance-forecast",
  "finance-pnl",
  "finance-unit-economics",
]);

const LIVE_FIRST_FINANCE_DOMAINS = new Set<FetchEntry["key"]>([
  "hubspot",
  "stripe",
  "mercury",
]);

function isLiveFirstDomain(
  section: string | null,
  domain: FetchEntry["key"],
): boolean {
  return section !== null && LIVE_FIRST_FINANCE_SECTIONS.has(section) && LIVE_FIRST_FINANCE_DOMAINS.has(domain);
}

function stripePayloadHasSignal(data: StripeData | null | undefined): boolean {
  if (!data) return false;

  return Boolean(
    data.revenue.mrr > 0 ||
      data.revenue.totalRevenue30d > 0 ||
      data.revenue.totalRevenuePrev30d > 0 ||
      data.subscriptions.active > 0 ||
      data.subscriptions.pastDue > 0 ||
      data.subscriptions.canceled > 0 ||
      data.subscriptions.trialing > 0 ||
      data.subscriptions.recentChurnEvents.length > 0 ||
      data.payments.succeeded > 0 ||
      data.payments.failed > 0 ||
      data.revenueTrend.some((point) => point.revenue > 0)
  );
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmailDomain(value: string | null | undefined): string | null {
  const email = normalizeEmail(value);
  if (!email || !email.includes("@")) return null;
  const [, domain] = email.split("@");
  const normalized = domain?.trim().toLowerCase() ?? "";
  if (!normalized || GENERIC_EMAIL_DOMAINS.has(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeStripeCustomerId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized === "Unknown customer") {
    return null;
  }
  return normalized;
}

function buildSubscriptionOverview(data: AnalyticsDashboardData): FinancialPlanningData["subscriptionOverview"] {
  const stripeRefs = data.stripe?.subscriptions.activeCustomerRefs ?? [];
  const hubspotDeals = (data.hubspot?.deals ?? []).filter(
    (deal) => deal.stageLabel.trim().toLowerCase() === "subscription",
  );
  const stripeActiveSubscriptions = data.stripe?.subscriptions.active ?? stripeRefs.length;

  const stripeCustomerIds = new Set(
    stripeRefs
      .map((ref) => normalizeStripeCustomerId(ref.customerId))
      .filter(Boolean) as string[],
  );
  const stripeEmails = new Set(
    stripeRefs.map((ref) => normalizeEmail(ref.email)).filter(Boolean) as string[],
  );
  const stripeDomains = new Set(
    stripeRefs.map((ref) => ref.emailDomain?.trim().toLowerCase() ?? null).filter(Boolean) as string[],
  );

  const seenHubspotEntities = new Set<string>();
  let uniqueHubspotActiveSubscriptions = 0;
  let hubspotOnlyCount = 0;

  for (const deal of hubspotDeals) {
    const customerId = normalizeStripeCustomerId(deal.stripeCustomerId);
    const email = normalizeEmail(deal.primaryContactEmail);
    const emailDomain = normalizeEmailDomain(deal.primaryContactEmail);
    const entityKey = customerId
      ? `customer:${customerId}`
      : email
        ? `email:${email}`
        : `deal:${deal.dealId}`;

    if (seenHubspotEntities.has(entityKey)) continue;
    seenHubspotEntities.add(entityKey);
    uniqueHubspotActiveSubscriptions += 1;

    if (customerId && stripeCustomerIds.has(customerId)) continue;
    if (email && stripeEmails.has(email)) continue;
    if (emailDomain && stripeDomains.has(emailDomain)) continue;

    hubspotOnlyCount += 1;
  }

  return {
    mergedActiveSubscriptions: stripeActiveSubscriptions + hubspotOnlyCount,
    stripeActiveSubscriptions,
    hubspotActiveSubscriptions: uniqueHubspotActiveSubscriptions,
  };
}

async function buildFinancialPlanningData(
  userId: string,
  data: AnalyticsDashboardData,
): Promise<FinancialPlanningData> {
  const [
    { buildProfitAndLossCore: buildProfitAndLoss },
    { computeUnitEconomics },
    { buildDefaultScenarios, buildForecastScenario },
    { computeBudgetActuals, computeBudgetSummary },
  ] = await Promise.all([
    loadPnlBuilder(),
    loadUnitEconomicsBuilder(),
    loadForecastBuilder(),
    loadBudgetVarianceBuilder(),
  ]);

  const stripe = data.stripe as StripeData | null;
  const mercury = data.mercury as MercuryData | null;
  const hubspot = data.hubspot as HubSpotData | null;
  const subscriptionOverview = buildSubscriptionOverview(data);

  const [dbBudgets, dbGoals, dbForecasts] = await Promise.all([
    prisma.budget.findMany({
      where: { userId },
      include: { lineItems: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financialGoal.findMany({
      where: { userId },
      orderBy: { deadline: "asc" },
    }),
    prisma.forecastScenario.findMany({ where: { userId } }),
  ]);

  type FinancialExpenseRatios = {
    cogs: number;
    payroll: number;
    marketing: number;
    infrastructure: number;
    ops: number;
  };

  function mapBudgetDraft(
    budget: {
      id: string;
      name: string;
      period: string;
      startDate: Date;
      endDate: Date;
      lineItems: { id: string; category: string; plannedAmount: number; notes: string | null }[];
    },
  ): BudgetData {
    return {
      id: budget.id,
      name: budget.name,
      period: budget.period.toLowerCase() as BudgetData["period"],
      startDate: budget.startDate.toISOString(),
      endDate: normalizeStoredBudgetEndDate(
        budget.startDate.toISOString(),
        budget.endDate.toISOString(),
        budget.period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
      ),
      lineItems: budget.lineItems.map((lineItem) => ({
        id: lineItem.id,
        category: lineItem.category.toLowerCase() as BudgetLineItemData["category"],
        plannedAmount: lineItem.plannedAmount,
        actualAmount: null,
        variance: null,
        variancePct: null,
        notes: lineItem.notes ?? undefined,
      })),
      totalPlanned: budget.lineItems.reduce((sum, lineItem) => sum + lineItem.plannedAmount, 0),
      totalActual: null,
      totalVariance: null,
    };
  }

  function deriveExpenseRatiosFromBudget(budget: BudgetData | null): FinancialExpenseRatios | null {
    if (!budget) return null;

    const totals = {
      cogs: 0,
      payroll: 0,
      marketing: 0,
      infrastructure: 0,
      ops: 0,
    };

    for (const item of budget.lineItems) {
      if (item.plannedAmount <= 0) continue;
      if (item.category === "other") {
        totals.ops += item.plannedAmount;
        continue;
      }
      totals[item.category] += item.plannedAmount;
    }

    const totalPlanned = Object.values(totals).reduce((sum, value) => sum + value, 0);
    if (totalPlanned <= 0) return null;

    return {
      cogs: totals.cogs / totalPlanned,
      payroll: totals.payroll / totalPlanned,
      marketing: totals.marketing / totalPlanned,
      infrastructure: totals.infrastructure / totalPlanned,
      ops: totals.ops / totalPlanned,
    };
  }

  function deriveExpenseRatiosFromMercury(mercuryData: MercuryData | null): FinancialExpenseRatios | null {
    const breakdown = mercuryData?.cashFlow.expenseBreakdown30d;
    if (!breakdown) return null;

    const totals = {
      cogs: breakdown.cogs ?? 0,
      payroll: breakdown.payroll ?? 0,
      marketing: breakdown.marketing ?? 0,
      infrastructure: breakdown.infrastructure ?? 0,
      ops: (breakdown.ops ?? 0) + (breakdown.other ?? 0),
    };

    const totalExpenses = Object.values(totals).reduce((sum, value) => sum + value, 0);
    if (totalExpenses <= 0) return null;

    return {
      cogs: totals.cogs / totalExpenses,
      payroll: totals.payroll / totalExpenses,
      marketing: totals.marketing / totalExpenses,
      infrastructure: totals.infrastructure / totalExpenses,
      ops: totals.ops / totalExpenses,
    };
  }

  const budgetDrafts = dbBudgets.map(mapBudgetDraft);
  const activeBudgetRatios = deriveExpenseRatiosFromBudget(budgetDrafts[0] ?? null);
  const mercuryExpenseRatios = deriveExpenseRatiosFromMercury(mercury);
  const effectiveExpenseRatios = mercuryExpenseRatios ?? activeBudgetRatios;

  // --- P&L ---
  const pnl = buildProfitAndLoss(
    stripe,
    mercury,
    effectiveExpenseRatios ? { ratios: effectiveExpenseRatios } : undefined,
  );

  // --- Unit Economics ---
  const unitEconomics = computeUnitEconomics(
    stripe,
    mercury,
    hubspot,
    effectiveExpenseRatios ? { ratios: effectiveExpenseRatios } : undefined,
  );

  // --- Forecasts: defaults + custom saved scenarios ---
  const defaultForecasts = buildDefaultScenarios(stripe, mercury);
  const customForecasts: ForecastScenarioData[] = dbForecasts.map((s: { id: string; name: string; assumptions: unknown }) =>
    buildForecastScenario(
      stripe,
      mercury,
      isForecastAssumptions(s.assumptions) ? s.assumptions : DEFAULT_ASSUMPTIONS,
      { id: s.id, name: s.name },
    ),
  );
  const forecasts = [...defaultForecasts, ...customForecasts];

  // --- Budgets with variance ---
  const budgets: BudgetData[] = budgetDrafts.map((budgetDraft) => {
    const lineItems: BudgetLineItemData[] = mercury?.cashFlow
      ? computeBudgetActuals(budgetDraft, mercury)
      : budgetDraft.lineItems;
    const summary = computeBudgetSummary(lineItems);
    return {
      id: budgetDraft.id,
      name: budgetDraft.name,
      period: budgetDraft.period,
      startDate: budgetDraft.startDate,
      endDate: budgetDraft.endDate,
      lineItems,
      totalPlanned: summary.totalPlanned,
      totalActual: summary.totalActual,
      totalVariance: summary.totalVariance,
    };
  });

  // --- Goals with current progress ---
  const currentMetrics: Record<string, number> = {
    mrr: stripe?.revenue.mrr ?? 0,
    arr: (stripe?.revenue.mrr ?? 0) * 12,
    runway: mercury?.cashFlow.runway ?? 0,
    burn_rate: mercury?.cashFlow.burnRate ?? 0,
    net_cash_flow: mercury?.cashFlow.netCashFlow ?? 0,
    revenue: stripe?.revenue.totalRevenue30d ?? 0,
    customer_count: subscriptionOverview?.mergedActiveSubscriptions ?? 0,
  };

  const goals: FinancialGoalData[] = dbGoals.map((g: { id: string; metric: GoalMetric | string; targetValue: number; deadline: Date; }) => {
    const metricKey = g.metric.toLowerCase() as GoalMetric;
    const currentValue = currentMetrics[metricKey] ?? 0;
    const direction = metricKey === "burn_rate" ? "lower" : "higher";
    const progressPct = computeProgressPct(currentValue, g.targetValue, direction);
    const isPastDeadline = new Date(g.deadline) < new Date();
    let status: GoalStatus = "active";
    const achieved =
      direction === "lower"
        ? currentValue <= g.targetValue
        : currentValue >= g.targetValue;
    if (achieved) status = "achieved";
    else if (isPastDeadline) status = "missed";
    return {
      id: g.id,
      metric: metricKey,
      targetValue: g.targetValue,
      currentValue,
      progressPct,
      deadline: g.deadline.toISOString(),
      status,
    };
  });

  return {
    budgets,
    activeBudget: budgets[0] ?? null,
    forecasts,
    goals,
    pnl,
    unitEconomics,
    subscriptionOverview,
  };
}

function providerForDomain(
  domain: DomainKey
):
  | "google_workspace"
  | "hubspot"
  | "slack"
  | "coda"
  | "reddit"
  | "redditAds"
  | "stripe"
  | "mercury"
  | "googleAnalytics"
  | "googleAds"
  | "metaAds"
  | "metaPage"
  | "webflow"
  | "semrush"
  | "pylon"
  | null {
  if (domain === "hubspot" || domain === "hubspotOps") return "hubspot";
  if (domain === "googleWorkspace") return "google_workspace";
  if (domain === "slack") return "slack";
  if (domain === "coda" || domain === "codaOps") return "coda";
  if (domain === "stripe") return "stripe";
  if (domain === "mercury") return "mercury";
  if (domain === "googleAnalytics") return "googleAnalytics";
  if (domain === "googleAds") return "googleAds";
  if (domain === "metaAds") return "metaAds";
  if (domain === "metaPage" || domain === "instagram") return "metaPage";
  if (domain === "webflow") return "webflow";
  if (domain === "semrush") return "semrush";
  if (domain === "pylon") return "pylon";
  if (domain === "redditAds") return "redditAds";
  if (domain === "redditOps") return "reddit";
  return null;
}

type FetchEntry = {
  key: Exclude<
    DomainKey,
    | "lifecycleFunnel"
    | "funnelJourney"
    | "aiInsights"
    | "recommendations"
  | "distilledInsights"
  | "customerJourney"
  | "visitorFunnel"
  | "demoAnalytics"
    | "processAnalytics"
  >;
  fn: () => Promise<unknown>;
  snapshotUserId: string;
};

type FetchOutcome = {
  key: FetchEntry["key"];
  payload: unknown;
  stale: boolean;
  capturedAt: string | null;
  source: "snapshot" | "live";
  fallbackError?: string;
};

type RefreshInput = {
  userId: string;
  rangePreset: string;
  fromDate: Date;
  toDate: Date;
  snapshotExpiresAt: Date;
  entry: FetchEntry;
};

const inFlightStaleRefreshes = new Map<string, Promise<void>>();

function staleRefreshKey(input: RefreshInput): string {
  return [
    input.userId,
    input.entry.key,
    input.rangePreset,
    input.fromDate.toISOString(),
    input.toDate.toISOString(),
  ].join(":");
}

async function refreshDomainSnapshot(input: RefreshInput): Promise<void> {
  try {
    const live = await withRetry(() =>
      withTimeout(input.entry.fn, timeoutMsForDomain(input.entry.key), input.entry.key)
    );
    await storeAnalyticsSnapshot({
      userId: input.userId,
      providerKey: input.entry.key,
      contextKey: "default",
      rangePreset: input.rangePreset,
      fromDate: input.fromDate,
      toDate: input.toDate,
      payload: live,
      expiresAt: input.snapshotExpiresAt,
    });
  } catch (error) {
    await storeAnalyticsSnapshotFailure({
      userId: input.userId,
      providerKey: input.entry.key,
      contextKey: "default",
      rangePreset: input.rangePreset,
      fromDate: input.fromDate,
      toDate: input.toDate,
      error: error instanceof Error ? error.message : "Failed",
      expiresAt: input.snapshotExpiresAt,
    });
    throw error;
  }
}

function queueStaleSnapshotRefresh(input: RefreshInput): void {
  const key = staleRefreshKey(input);
  if (inFlightStaleRefreshes.has(key)) {
    return;
  }

  const job = refreshDomainSnapshot(input)
    .catch((error) => {
      console.error("analytics stale snapshot refresh failed", {
        domain: input.entry.key,
        userId: input.userId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    })
    .finally(() => {
      inFlightStaleRefreshes.delete(key);
    });

  inFlightStaleRefreshes.set(key, job);
  void job;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const section = url.searchParams.get("section");
  const domains = requiredDomainsForSection(section);
  const range = parseAnalyticsTimeRange(url.searchParams);
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const integrationUserId = resolveIntegrationOwnerUserId(userId);

  const permission = await enforcePermission({
    userId,
    action: "analytics.read",
    request,
    targetType: "analytics",
  });
  if (permission.deniedResponse) {
    return permission.deniedResponse;
  }

  const organizationId = await resolveAnalyticsOrganizationId(session, userId);
  if (!organizationId) {
    return NextResponse.json(
      { error: "Organization context required for analytics" },
      { status: 403 }
    );
  }

  return runWithContextAsync({ organizationId, userId }, async () => {
    const creds = await getCredentials(integrationUserId);
    const hasGAServiceAccount = Boolean(creds.gaPropertyId && creds.gaClientEmail && creds.gaPrivateKey);
    const hasGAOAuth = Boolean(
      creds.gaPropertyId &&
        process.env.GA_REFRESH_TOKEN?.trim() &&
        process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim()
    );

    const result: AnalyticsDashboardData = createEmptyAnalyticsDashboardData({
      freshness: {
      google_workspace: {
        provider: "google_workspace",
        source: creds.freshness.GOOGLE_WORKSPACE.source,
        status: creds.freshness.GOOGLE_WORKSPACE.status,
        connectedAt: creds.freshness.GOOGLE_WORKSPACE.connectedAt,
        lastSyncedAt: creds.freshness.GOOGLE_WORKSPACE.lastSyncedAt,
        lastError: creds.freshness.GOOGLE_WORKSPACE.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      hubspot: {
        provider: "hubspot",
        source: creds.freshness.HUBSPOT.source,
        status: creds.freshness.HUBSPOT.status,
        connectedAt: creds.freshness.HUBSPOT.connectedAt,
        lastSyncedAt: creds.freshness.HUBSPOT.lastSyncedAt,
        lastError: creds.freshness.HUBSPOT.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      slack: {
        provider: "slack",
        source: creds.freshness.SLACK.source,
        status: creds.freshness.SLACK.status,
        connectedAt: creds.freshness.SLACK.connectedAt,
        lastSyncedAt: creds.freshness.SLACK.lastSyncedAt,
        lastError: creds.freshness.SLACK.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      coda: {
        provider: "coda",
        source: creds.freshness.CODA.source,
        status: creds.freshness.CODA.status,
        connectedAt: creds.freshness.CODA.connectedAt,
        lastSyncedAt: creds.freshness.CODA.lastSyncedAt,
        lastError: creds.freshness.CODA.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      reddit: {
        provider: "reddit",
        source: creds.freshness.REDDIT.source,
        status: creds.freshness.REDDIT.status,
        connectedAt: creds.freshness.REDDIT.connectedAt,
        lastSyncedAt: creds.freshness.REDDIT.lastSyncedAt,
        lastError: creds.freshness.REDDIT.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      stripe: {
        provider: "stripe",
        source: creds.freshness.STRIPE.source,
        status: creds.freshness.STRIPE.status,
        connectedAt: creds.freshness.STRIPE.connectedAt,
        lastSyncedAt: creds.freshness.STRIPE.lastSyncedAt,
        lastError: creds.freshness.STRIPE.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      mercury: {
        provider: "mercury",
        source: creds.freshness.MERCURY.source,
        status: creds.freshness.MERCURY.status,
        connectedAt: creds.freshness.MERCURY.connectedAt,
        lastSyncedAt: creds.freshness.MERCURY.lastSyncedAt,
        lastError: creds.freshness.MERCURY.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      googleAnalytics: {
        provider: "googleAnalytics",
        source: creds.freshness.GOOGLE_ANALYTICS.source,
        status: creds.freshness.GOOGLE_ANALYTICS.status,
        connectedAt: creds.freshness.GOOGLE_ANALYTICS.connectedAt,
        lastSyncedAt: creds.freshness.GOOGLE_ANALYTICS.lastSyncedAt,
        lastError: creds.freshness.GOOGLE_ANALYTICS.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      googleAds: {
        provider: "googleAds",
        source: creds.freshness.GOOGLE_ADS.source,
        status: creds.freshness.GOOGLE_ADS.status,
        connectedAt: creds.freshness.GOOGLE_ADS.connectedAt,
        lastSyncedAt: creds.freshness.GOOGLE_ADS.lastSyncedAt,
        lastError: creds.freshness.GOOGLE_ADS.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      metaAds: {
        provider: "metaAds",
        source: creds.freshness.META_ADS.source,
        status: creds.freshness.META_ADS.status,
        connectedAt: creds.freshness.META_ADS.connectedAt,
        lastSyncedAt: creds.freshness.META_ADS.lastSyncedAt,
        lastError: creds.freshness.META_ADS.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      metaPage: {
        provider: "metaPage",
        source: creds.freshness.META_PAGE.source,
        status: creds.freshness.META_PAGE.status,
        connectedAt: creds.freshness.META_PAGE.connectedAt,
        lastSyncedAt: creds.freshness.META_PAGE.lastSyncedAt,
        lastError: creds.freshness.META_PAGE.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      redditAds: {
        provider: "redditAds",
        source: creds.freshness.REDDIT.source,
        status: creds.freshness.REDDIT.status,
        connectedAt: creds.freshness.REDDIT.connectedAt,
        lastSyncedAt: creds.freshness.REDDIT.lastSyncedAt,
        lastError: creds.freshness.REDDIT.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      webflow: {
        provider: "webflow",
        source: creds.freshness.WEBFLOW.source,
        status: creds.freshness.WEBFLOW.status,
        connectedAt: creds.freshness.WEBFLOW.connectedAt,
        lastSyncedAt: creds.freshness.WEBFLOW.lastSyncedAt,
        lastError: creds.freshness.WEBFLOW.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      semrush: {
        provider: "semrush",
        source: creds.freshness.SEMRUSH.source,
        status: creds.freshness.SEMRUSH.status,
        connectedAt: creds.freshness.SEMRUSH.connectedAt,
        lastSyncedAt: creds.freshness.SEMRUSH.lastSyncedAt,
        lastError: creds.freshness.SEMRUSH.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      pylon: {
        provider: "pylon",
        source: creds.freshness.PYLON.source,
        status: creds.freshness.PYLON.status,
        connectedAt: creds.freshness.PYLON.connectedAt,
        lastSyncedAt: creds.freshness.PYLON.lastSyncedAt,
        lastError: creds.freshness.PYLON.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
    },
    timeRange: range,
    lastFullRefresh: new Date().toISOString(),
  });

  const fetchers = ([
    ...(creds.hubspotToken
      ? [{
          key: "hubspot" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchHubSpotData } = await loadCoreAnalyticsFetchers();
            return fetchHubSpotData(creds.hubspotToken!, { fromDate, toDate });
          },
        }]
      : []),
    ...(creds.stripeKey
      ? [{
          key: "stripe" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchStripeData } = await loadCoreAnalyticsFetchers();
            const primary = await fetchStripeData(creds.stripeKey!, { fromDate, toDate });
            const envStripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? null;
            const shouldTryEnvFallback =
              creds.freshness.STRIPE.source === "connection" &&
              Boolean(envStripeKey) &&
              envStripeKey !== creds.stripeKey &&
              !stripePayloadHasSignal(primary);

            if (!shouldTryEnvFallback) {
              return primary;
            }

            try {
              const fallback = await fetchStripeData(envStripeKey!, { fromDate, toDate });
              if (stripePayloadHasSignal(fallback)) {
                stripeUsedEnvFallback = true;
                return fallback;
              }
            } catch (error) {
              console.warn("[analytics] Stripe env fallback fetch failed", error);
            }

            return primary;
          },
        }]
      : []),
    ...(creds.mercuryKey
      ? [{
          key: "mercury" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchMercuryData } = await loadCoreAnalyticsFetchers();
            const mercuryRule = await prisma.integrationRule.findUnique({
              where: {
                userId_provider_key: {
                  userId: integrationUserId,
                  provider: IntegrationProvider.MERCURY,
                  key: MERCURY_CASHFLOW_SYNC_RULE_KEY,
                },
              },
              select: { config: true },
            });
            const expenseMappings: MercuryExpenseMapping[] = normalizeMercuryExpenseMappings(
              mercuryRule?.config ?? null,
            );
            return fetchMercuryData(creds.mercuryKey!, {
              fromDate,
              toDate,
              expenseMappings,
            });
          },
        }]
      : []),
    ...((hasGAServiceAccount || hasGAOAuth)
      ? [{
          key: "googleAnalytics" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchGAData } = await loadGaWebflowFetchers();
            return fetchGAData(
              creds.gaPropertyId!,
              creds.gaClientEmail ?? "",
              creds.gaPrivateKey ?? "",
              { fromDate, toDate }
            );
          },
        }]
      : []),
    ...(creds.googleAdsDevToken && creds.googleAdsCustomerId && creds.googleAdsRefreshToken && creds.googleAdsClientId && creds.googleAdsClientSecret
      ? [{
          key: "googleAds" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchGoogleAdsData } = await loadAdsFetchers();
            return fetchGoogleAdsData(
              creds.googleAdsDevToken!,
              creds.googleAdsCustomerId!,
              creds.googleAdsRefreshToken!,
              creds.googleAdsClientId!,
              creds.googleAdsClientSecret!,
              creds.googleAdsLoginCustomerId,
              { fromDate, toDate },
            );
          },
        }]
      : []),
    ...(creds.metaAccessToken && creds.metaAdAccountId
      ? [{
          key: "metaAds" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchMetaAdsData } = await loadAdsFetchers();
            return fetchMetaAdsData(
              creds.metaAccessToken!,
              creds.metaAdAccountId!,
              { fromDate, toDate }
            );
          },
        }]
      : []),
    ...(creds.metaAccessToken && creds.metaPageId
      ? [{
          key: "metaPage" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchMetaPageData } = await loadAdsFetchers();
            return fetchMetaPageData(
              creds.metaAccessToken!,
              creds.metaPageId!,
              { fromDate, toDate }
            );
          },
        }]
      : []),
    ...(creds.metaAccessToken && creds.metaInstagramAccountId
      ? [{
          key: "instagram" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchMetaInstagramData } = await loadAdsFetchers();
            return fetchMetaInstagramData(
              creds.metaAccessToken!,
              creds.metaInstagramAccountId!,
              { pageId: creds.metaPageId ?? undefined },
              fromDate,
              toDate,
            );
          },
        }]
      : []),
    ...(creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId
      ? [{
          key: "redditAds" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchRedditAdsData } = await loadAdsFetchers();
            return fetchRedditAdsData(
              creds.redditClientId!,
              creds.redditClientSecret!,
              creds.redditRefreshToken!,
              creds.redditAdAccountId!,
              creds.redditUserAgent,
              { fromDate, toDate },
            );
          },
        }]
      : []),
    ...(creds.webflowApiToken && creds.webflowSiteId
      ? [{
          key: "webflow" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchWebflowData } = await loadGaWebflowFetchers();
            return fetchWebflowData(
              creds.webflowApiToken!,
              creds.webflowSiteId!,
              fromDate,
              toDate
            );
          },
        }]
      : []),
    ...(creds.codaApiToken && creds.codaDocId
      ? [{
          key: "coda" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchCodaData } = await loadCodaFetchers();
            return fetchCodaData(creds.codaApiToken!, creds.codaDocId!, {
              fromDate,
              toDate,
            });
          },
        }]
      : []),
    ...(creds.semrushApiToken && creds.semrushDomain
      ? [{
          key: "semrush" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchSemrushData } = await loadSemrushFetchers();
            return fetchSemrushData(
              creds.semrushApiToken!,
              creds.semrushDomain!
            );
          },
        }]
      : []),
    ...(creds.pylonApiKey
      ? [{
          key: "pylon" as const,
          snapshotUserId: integrationUserId,
          fn: async () => {
            const { fetchPylonData } = await loadPylonFetchers();
            return fetchPylonData({
              apiKey: creds.pylonApiKey!,
              from: range.from,
              to: range.to,
              baseUrl: creds.pylonBaseUrl ?? undefined,
            });
          },
        }]
      : []),
    {
      key: "product" as const,
      snapshotUserId: userId,
      fn: () => computeProductSuccessData(fromDate, toDate),
    },
    {
      key: "googleWorkspace" as const,
      snapshotUserId: integrationUserId,
      fn: async () => {
        const { fetchIntegrationTelemetryData } =
          await loadIntegrationTelemetryFetchers();
        return fetchIntegrationTelemetryData({
          userId: integrationUserId,
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
          from: fromDate,
          to: toDate,
        });
      },
    },
    {
      key: "hubspotOps" as const,
      snapshotUserId: integrationUserId,
      fn: async () => {
        const { fetchIntegrationTelemetryData } =
          await loadIntegrationTelemetryFetchers();
        return fetchIntegrationTelemetryData({
          userId: integrationUserId,
          provider: IntegrationProvider.HUBSPOT,
          from: fromDate,
          to: toDate,
        });
      },
    },
    {
      key: "slack" as const,
      snapshotUserId: integrationUserId,
      fn: async () => {
        const { fetchIntegrationTelemetryData } =
          await loadIntegrationTelemetryFetchers();
        return fetchIntegrationTelemetryData({
          userId: integrationUserId,
          provider: IntegrationProvider.SLACK,
          from: fromDate,
          to: toDate,
        });
      },
    },
    {
      key: "codaOps" as const,
      snapshotUserId: integrationUserId,
      fn: async () => {
        const { fetchIntegrationTelemetryData } =
          await loadIntegrationTelemetryFetchers();
        return fetchIntegrationTelemetryData({
          userId: integrationUserId,
          provider: IntegrationProvider.CODA,
          from: fromDate,
          to: toDate,
        });
      },
    },
    {
      key: "redditOps" as const,
      snapshotUserId: integrationUserId,
      fn: async () => {
        const { fetchIntegrationTelemetryData } =
          await loadIntegrationTelemetryFetchers();
        return fetchIntegrationTelemetryData({
          userId: integrationUserId,
          provider: IntegrationProvider.REDDIT,
          from: fromDate,
          to: toDate,
        });
      },
    },
  ] as FetchEntry[]).filter((entry) => domains.has(entry.key));

  const TIMEOUT_OVERRIDES: Partial<Record<DomainKey, number>> = {
    stripe: 15_000,
  };
  const DEFAULT_TIMEOUT = 8_000;

  const snapshotExpiresAt = snapshotExpiryFromNow(1);
  const capturedAtByDomain: Partial<Record<DomainKey, string | null>> = {};
  let stripeUsedEnvFallback = false;

  const settled = await Promise.allSettled(
    fetchers.map(async (entry): Promise<FetchOutcome> => {
      const liveFirst = isLiveFirstDomain(section, entry.key);
      const latestSnapshot = await readLatestSnapshot({
        userId: entry.snapshotUserId,
        providerKey: entry.key,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
      });

      if (!forceRefresh && !liveFirst && latestSnapshot.payload) {
        if (latestSnapshot.needsRefresh) {
          queueStaleSnapshotRefresh({
            userId: entry.snapshotUserId,
            rangePreset: range.preset,
            fromDate,
            toDate,
            snapshotExpiresAt,
            entry,
          });
        }

        return {
          key: entry.key,
          payload: latestSnapshot.payload,
          stale: latestSnapshot.stale,
          capturedAt: latestSnapshot.capturedAt,
          source: "snapshot" as const,
        };
      }

      try {
        const live = await withRetry(
          () => withTimeout(entry.fn, TIMEOUT_OVERRIDES[entry.key] ?? DEFAULT_TIMEOUT, entry.key),
        );
        await storeAnalyticsSnapshot({
          userId: entry.snapshotUserId,
          providerKey: entry.key,
          contextKey: "default",
          rangePreset: range.preset,
          fromDate,
          toDate,
          payload: live,
          expiresAt: snapshotExpiresAt,
        });

        return {
          key: entry.key,
          payload: live,
          stale: false,
          capturedAt: new Date().toISOString(),
          source: "live" as const,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed";

        await storeAnalyticsSnapshotFailure({
          userId: entry.snapshotUserId,
          providerKey: entry.key,
          contextKey: "default",
          rangePreset: range.preset,
          fromDate,
          toDate,
          error: message,
          expiresAt: snapshotExpiresAt,
        });

        const fallback = await readLatestSuccessfulSnapshot({
          userId: entry.snapshotUserId,
          providerKey: entry.key,
          contextKey: "default",
          rangePreset: range.preset,
          fromDate,
          toDate,
        });

        if (fallback.payload) {
          return {
            key: entry.key,
            payload: fallback.payload,
            stale: true,
            capturedAt: fallback.capturedAt,
            source: "snapshot" as const,
            fallbackError: message,
          };
        }

        throw createAnalyticsDomainError(entry.key, message);
      }
    })
  );

  settled.forEach((outcome) => {
    if (outcome.status === "rejected") {
      const mapped = analyticsErrorFromReason(outcome.reason);
      result.errors.push(mapped);
      result.staleDomains.push(mapped.source);

      const provider = providerForDomain(mapped.source as DomainKey);
      if (provider) {
        const existing = result.freshness[provider];
        if (existing) {
          result.freshness[provider] = patchFreshnessWithStale(existing, {
            stale: true,
            source: "snapshot",
            lastError: mapped.message,
          });
        }
      }
      return;
    }

    const { key, payload, stale, capturedAt, fallbackError } = outcome.value;
    const normalizedPayload = key === "mercury"
      ? normalizeMercuryDataPayload(payload as MercuryData | null)
      : INTEGRATION_TELEMETRY_DOMAINS.has(key)
        ? normalizeIntegrationTelemetryPayload(payload)
        : payload;
    (result as unknown as Record<string, unknown>)[key] = normalizedPayload;
    capturedAtByDomain[key] = capturedAt;

    if (stale) {
      result.staleDomains.push(key);
      if (fallbackError) {
        result.errors.push({ source: key, message: fallbackError });
      }
    }

    const provider = providerForDomain(key);
    if (provider) {
      const existing = result.freshness[provider];
      if (existing) {
        result.freshness[provider] = patchFreshnessWithStale(existing, {
          stale,
          capturedAt,
          source: key === "stripe" && stripeUsedEnvFallback ? "env" : undefined,
          lastError: fallbackError ?? null,
        });
      }
    }
  });

  await hydrateStripeCustomerLinks(userId, result);

  if (domains.has("funnelJourney")) {
    const { buildCrossFunnelData } = await loadFunnelBuilders();
    result.funnelJourney = buildCrossFunnelData(result);
  }
  if (domains.has("lifecycleFunnel")) {
    const { buildLifecycleFunnelData } = await loadFunnelBuilders();
    result.lifecycleFunnel = buildLifecycleFunnelData(result);
  }
  if (domains.has("aiInsights")) {
    const { buildAiInsightsBundle } = await loadInsightBuilders();
    result.aiInsights = buildAiInsightsBundle(result);
  }
  
  if (domains.has("customerJourney")) {
    const { buildCustomerJourneyData } = await loadCustomerJourneyBuilder();
    result.customerJourney = buildCustomerJourneyData(result);
  }
  if (domains.has("visitorFunnel")) {
    const funnelPrisma = getVisitorFunnelPrisma(prisma as PrismaClientType);
    if (funnelPrisma) {
      await syncVisitorFunnelArtifacts({
        prisma: funnelPrisma,
        analyticsData: result,
        stripeKey: creds.stripeKey ?? null,
        from: fromDate,
        to: toDate,
      });
      result.visitorFunnel = await buildVisitorFunnelData(funnelPrisma, {
        from: fromDate,
        to: toDate,
        filters: parseVisitorFunnelFilters(url.searchParams),
        closedWonCount: (result.hubspot?.deals ?? []).filter(
          (deal) => deal.stageLabel.trim().toLowerCase() === "closed won",
        ).length,
        includeOperationalMetadata:
          ((session.user as { role?: string } | undefined)?.role ?? null) === "admin",
      });
    } else {
      result.visitorFunnel = null;
    }
  }
  if (domains.has("recommendations")) {
    result.recommendations = buildRecommendations(result);
  }
  if (domains.has("distilledInsights")) {
    const { buildDistilledInsights } = await loadInsightBuilders();
    result.distilledInsights = buildDistilledInsights(result);
  }
  if (domains.has("demoAnalytics")) {
    const { buildDemoAnalyticsData } = await loadDemoAnalyticsBuilder();
    const { listDemoAnalyticsMeetings } = await loadDemoAnalyticsBuilder();
    const meetings = await listDemoAnalyticsMeetings();
    result.demoAnalytics = buildDemoAnalyticsData(result, { meetings });
  }
  if (domains.has("processAnalytics")) {
    const { buildProcessAnalyticsData } = await loadProcessAnalyticsBuilder();
    result.processAnalytics = buildProcessAnalyticsData(result);
  }

  // Populate financial planning data for finance surfaces that depend on it.
  if (section === null || FINANCIAL_PLANNING_SECTIONS.has(section)) {
    try {
      result.financialPlanning = await buildFinancialPlanningData(userId, result);
    } catch (error) {
      console.error("Failed to build financial planning data:", error);
      // Non-fatal — leave as null
    }
  }

  if (section === "overview") {
    try {
      const prevToDate = new Date(fromDate.getTime() - 1);
      const prevFromDate = new Date(
        prevToDate.getTime() - (Math.max(1, range.days) - 1) * 24 * 60 * 60 * 1000,
      );
      prevFromDate.setUTCHours(0, 0, 0, 0);

      const [prevStripe, prevGa] = await Promise.all([
        readLatestSuccessfulSnapshot<StripeData>({
          userId: integrationUserId,
          providerKey: "stripe",
          contextKey: "default",
          rangePreset: range.preset,
          fromDate: prevFromDate,
          toDate: prevToDate,
        }),
        readLatestSuccessfulSnapshot<AnalyticsDashboardData["googleAnalytics"]>({
          userId: integrationUserId,
          providerKey: "googleAnalytics",
          contextKey: "default",
          rangePreset: range.preset,
          fromDate: prevFromDate,
          toDate: prevToDate,
        }),
      ]);

      const currentTraffic =
        result.googleAnalytics || result.ga ? computeAnalyticsKpis(result).traffic : null;
      const currentFinance = result.stripe ? computeAnalyticsKpis(result).finance : null;

      const prevTraffic = prevGa.payload
        ? computeAnalyticsKpis(
            { googleAnalytics: prevGa.payload } as unknown as AnalyticsDashboardData,
          ).traffic
        : null;
      const prevFinance = prevStripe.payload
        ? computeAnalyticsKpis(
            { stripe: prevStripe.payload } as unknown as AnalyticsDashboardData,
          ).finance
        : null;

      result.deltas = {
        traffic: {
          bounceRatePct: computeKpiDelta({
            current: currentTraffic?.bounceRatePct ?? null,
            previous: prevTraffic?.bounceRatePct ?? null,
            currentCapturedAt: capturedAtByDomain.googleAnalytics ?? null,
            previousCapturedAt: prevGa.capturedAt,
          }),
          pagesPerSession: computeKpiDelta({
            current: currentTraffic?.pagesPerSession ?? null,
            previous: prevTraffic?.pagesPerSession ?? null,
            currentCapturedAt: capturedAtByDomain.googleAnalytics ?? null,
            previousCapturedAt: prevGa.capturedAt,
          }),
        },
        finance: {
          mrr: computeKpiDelta({
            current: currentFinance?.mrr ?? null,
            previous: prevFinance?.mrr ?? null,
            currentCapturedAt: capturedAtByDomain.stripe ?? null,
            previousCapturedAt: prevStripe.capturedAt,
          }),
          paymentSuccessPct: computeKpiDelta({
            current: currentFinance?.paymentSuccessPct ?? null,
            previous: prevFinance?.paymentSuccessPct ?? null,
            currentCapturedAt: capturedAtByDomain.stripe ?? null,
            previousCapturedAt: prevStripe.capturedAt,
          }),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ source: "deltas", message });
    }
  }

  const staleDomains = Array.from(new Set(result.staleDomains));
  const erroredDomains = Array.from(new Set(result.errors.map((entry) => entry.source)));
  result.staleDomains = staleDomains;
  result.meta = buildAnalyticsRouteMeta({
    section,
    forceRefresh,
    staleDomains,
    erroredDomains,
  });

  return NextResponse.json(result, {
    headers: {
        "Cache-Control": forceRefresh ? "no-cache, no-store" : "private, max-age=30, stale-while-revalidate=120",
      },
    });
  });
}
