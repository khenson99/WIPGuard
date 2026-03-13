import { prisma } from "@/lib/prisma";
import type {
  RetentionCoveragePayload,
  RetentionLifecyclePhase,
  RetentionReasonCode,
  RetentionSegmentRollup,
  RetentionSummary,
  RetentionTenantDetail,
  RetentionTenantFilterInput,
  RetentionTenantRow,
  RetentionTimelinePoint,
} from "@/lib/retention/types";
import {
  DEFAULT_RETENTION_LIR_BY_PHASE,
  RETENTION_STATUS_HELP,
} from "@/lib/retention/lir-config";
import { retentionStatusFromDb } from "@/lib/retention/status";

export interface RetentionActor {
  id: string;
  organizationId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseReasonCodes(value: unknown): RetentionReasonCode[] {
  return asArray<Record<string, unknown>>(value)
    .map((item) => {
      const code = asString(item.code);
      const label = asString(item.label);
      const detail = asString(item.detail);
      const severity = asString(item.severity);
      const dimension = asString(item.dimension);
      if (!code || !label || !detail || !severity || !dimension) return null;
      return {
        code,
        label,
        detail,
        severity: severity as RetentionReasonCode["severity"],
        dimension: dimension as RetentionReasonCode["dimension"],
      };
    })
    .filter((item): item is RetentionReasonCode => item !== null);
}

function lifecycleFromDb(value: string | null | undefined): RetentionLifecyclePhase {
  return value === "ONBOARDING" ? "ONBOARDING" : "MATURE";
}

function compareRowsByRisk(a: RetentionTenantRow, b: RetentionTenantRow): number {
  const order = ["Billing Risk", "At Risk", "Onboarding Risk", "Watch", "Healthy"];
  const statusDiff = order.indexOf(a.status) - order.indexOf(b.status);
  if (statusDiff !== 0) return statusDiff;
  return (b.trendVsPriorPct ?? -Infinity) - (a.trendVsPriorPct ?? -Infinity);
}

function buildExplanation(row: RetentionTenantRow): string {
  const base = RETENTION_STATUS_HELP[row.status];
  const reasons = row.reasonCodes.slice(0, 3).map((reason) => reason.label).join(", ");
  return reasons ? `${base} Key drivers: ${reasons}.` : base;
}

function matchesFilter(row: RetentionTenantRow, filter: RetentionTenantFilterInput): boolean {
  if (filter.status && row.status !== filter.status) return false;
  if (filter.plan && row.plan !== filter.plan) return false;
  if (filter.owner && row.ownerName !== filter.owner) return false;
  if (filter.segment && row.segment !== filter.segment) return false;
  if (filter.lifecyclePhase && row.lifecyclePhase !== filter.lifecyclePhase) return false;
  if (filter.ageBucket && row.ageBucket !== filter.ageBucket) return false;
  if (filter.icp === "true" && !row.icp) return false;
  if (filter.icp === "false" && row.icp) return false;
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    if (
      !row.tenantName.toLowerCase().includes(needle) &&
      !(row.ownerName ?? "").toLowerCase().includes(needle) &&
      !(row.segment ?? "").toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  return true;
}

function mapCurrentToRow(current: {
  customerRecordId: string;
  lifecyclePhase: string;
  status: string;
  primaryLirPassed: boolean;
  primaryLirLabel: string;
  primaryLirValue: number | null;
  primaryLirThreshold: number | null;
  currentMonthActivity: number | null;
  activityTrendPct: number | null;
  supportRisk: boolean;
  billingRisk: boolean;
  onboardingRisk: boolean;
  icp: boolean;
  ownerName: string | null;
  segment: string | null;
  plan: string | null;
  ageBucket: string | null;
  lastMaterializedAt: Date;
  reasonCodes: unknown;
  customerRecord: {
    name: string;
  };
}): RetentionTenantRow {
  return {
    customerRecordId: current.customerRecordId,
    tenantName: current.customerRecord.name,
    status: retentionStatusFromDb(current.status) ?? "Watch",
    lifecyclePhase: lifecycleFromDb(current.lifecyclePhase),
    primaryLirPassed: current.primaryLirPassed,
    primaryLirLabel: current.primaryLirLabel,
    primaryLirValue: current.primaryLirValue,
    primaryLirThreshold: current.primaryLirThreshold,
    currentMonthActivity: current.currentMonthActivity,
    trendVsPriorPct: current.activityTrendPct,
    supportRisk: current.supportRisk,
    billingRisk: current.billingRisk,
    onboardingRisk: current.onboardingRisk,
    icp: current.icp,
    ownerName: current.ownerName,
    segment: current.segment,
    plan: current.plan,
    ageBucket: current.ageBucket,
    reasonCodes: parseReasonCodes(current.reasonCodes),
    lastMaterializedAt: current.lastMaterializedAt.toISOString(),
  };
}

function buildRollups(
  rows: RetentionTenantRow[],
  accessor: (row: RetentionTenantRow) => string
): RetentionSegmentRollup[] {
  const buckets = new Map<string, RetentionTenantRow[]>();
  for (const row of rows) {
    const key = accessor(row);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  return [...buckets.entries()].map(([key, bucket]) => ({
    segmentKey: key,
    label: key,
    tenants: bucket.length,
    lirPassRate:
      bucket.length > 0 ? Math.round((bucket.filter((row) => row.primaryLirPassed).length / bucket.length) * 1000) / 10 : 0,
    atRiskRate:
      bucket.length > 0
        ? Math.round(
            (bucket.filter((row) => row.status === "At Risk" || row.status === "Billing Risk").length / bucket.length) * 1000
          ) / 10
        : 0,
  }));
}

export async function listRetentionTenants(
  actor: RetentionActor,
  filter: RetentionTenantFilterInput = {}
): Promise<RetentionTenantRow[]> {
  const records = await prisma.retentionTenantCurrent.findMany({
    where: {
      organizationId: actor.organizationId,
    },
    include: {
      customerRecord: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return records.map(mapCurrentToRow).filter((row) => matchesFilter(row, filter)).sort(compareRowsByRisk);
}

export async function getRetentionSummary(
  actor: RetentionActor,
  filter: RetentionTenantFilterInput = {}
): Promise<RetentionSummary> {
  const rows = await listRetentionTenants(actor, filter);
  const matureRows = rows.filter((row) => row.lifecyclePhase === "MATURE");
  const onboardingRows = rows.filter((row) => row.lifecyclePhase === "ONBOARDING");

  const activeAfter180dRateRows = await prisma.retentionTenantMonth.findMany({
    where: {
      organizationId: actor.organizationId,
    },
    select: {
      monthStart: true,
      outcomeData: true,
    },
    orderBy: [{ monthStart: "asc" }],
  });

  const cohortBuckets = new Map<string, { tenants: number; active: number; pass: number }>();
  for (const monthRow of activeAfter180dRateRows) {
    const monthKey = monthRow.monthStart.toISOString().slice(0, 7);
    const bucket = cohortBuckets.get(monthKey) ?? { tenants: 0, active: 0, pass: 0 };
    const outcomes = asRecord(monthRow.outcomeData);
    bucket.tenants += 1;
    if (asBoolean(outcomes.activeAfter180d)) bucket.active += 1;
    if (asBoolean(asRecord(monthRow.outcomeData).primaryLirPassed)) bucket.pass += 1;
    cohortBuckets.set(monthKey, bucket);
  }

  return {
    generatedAt: new Date().toISOString(),
    lirDefinition: DEFAULT_RETENTION_LIR_BY_PHASE.MATURE,
    totals: {
      tenants: rows.length,
      activeTenants: rows.filter((row) => row.status !== "Billing Risk").length,
      lirPassingTenants: rows.filter((row) => row.primaryLirPassed).length,
      atRiskTenants: rows.filter((row) => row.status === "At Risk").length,
      onboardingRiskTenants: rows.filter((row) => row.status === "Onboarding Risk").length,
      billingRiskTenants: rows.filter((row) => row.status === "Billing Risk").length,
    },
    kpis: [
      {
        label: "LIR attainment",
        value: rows.length > 0 ? Math.round((rows.filter((row) => row.primaryLirPassed).length / rows.length) * 1000) / 10 : 0,
        helpText: "Percent of current tenants meeting the primary leading indicator of retention.",
      },
      {
        label: "Mature tenant LIR attainment",
        value:
          matureRows.length > 0
            ? Math.round((matureRows.filter((row) => row.primaryLirPassed).length / matureRows.length) * 1000) / 10
            : 0,
        helpText: "Percent of mature tenants meeting the current-month operational habit threshold.",
      },
      {
        label: "Onboarding risk rate",
        value:
          onboardingRows.length > 0
            ? Math.round((onboardingRows.filter((row) => row.status === "Onboarding Risk").length / onboardingRows.length) * 1000) / 10
            : 0,
        helpText: "Percent of onboarding tenants missing first-value or habit milestones.",
      },
      {
        label: "Billing risk rate",
        value:
          rows.length > 0
            ? Math.round((rows.filter((row) => row.billingRisk).length / rows.length) * 1000) / 10
            : 0,
        helpText: "Percent of tenants with past due, delinquency, or recent contraction signals.",
      },
    ],
    byIcp: buildRollups(rows, (row) => (row.icp ? "ICP" : "Non-ICP")),
    byPlan: buildRollups(rows, (row) => row.plan ?? "Unknown"),
    byAgeBucket: buildRollups(rows, (row) => row.ageBucket ?? "Unknown"),
    sharpDeclines: rows.filter((row) => (row.trendVsPriorPct ?? 0) <= -30).slice(0, 10),
    onboardingMisses: rows.filter((row) => row.status === "Onboarding Risk").slice(0, 10),
    supportHeavyHighUsage: rows.filter((row) => row.supportRisk && row.primaryLirPassed).slice(0, 10),
    billingRiskAccounts: rows.filter((row) => row.billingRisk).slice(0, 10),
    cohorts: [...cohortBuckets.entries()].map(([cohortMonth, bucket]) => ({
      cohortMonth,
      tenants: bucket.tenants,
      lirPassRate: bucket.tenants > 0 ? Math.round((bucket.pass / bucket.tenants) * 1000) / 10 : 0,
      activeAfter180dRate: bucket.tenants > 0 ? Math.round((bucket.active / bucket.tenants) * 1000) / 10 : null,
    })),
    dataCoverage: await buildCoverage(actor.organizationId),
  };
}

async function buildCoverage(organizationId: string): Promise<RetentionSummary["dataCoverage"]> {
  const [tenantCount, sourceCounts] = await Promise.all([
    prisma.retentionTenantCurrent.count({ where: { organizationId } }),
    prisma.retentionSourceRecord.groupBy({
      by: ["source"],
      where: {
        organizationId,
        customerRecordId: { not: null },
      },
      _count: {
        customerRecordId: true,
      },
    }),
  ]);

  return sourceCounts.map((entry) => ({
    source: entry.source,
    tenantsCovered: entry._count.customerRecordId,
    totalTenants: tenantCount,
    coveragePct: tenantCount > 0 ? Math.round((entry._count.customerRecordId / tenantCount) * 1000) / 10 : 0,
  }));
}

export async function getRetentionTenantDetail(
  actor: RetentionActor,
  customerRecordId: string
): Promise<RetentionTenantDetail | null> {
  const current = await prisma.retentionTenantCurrent.findFirst({
    where: {
      organizationId: actor.organizationId,
      customerRecordId,
    },
    include: {
      customerRecord: {
        select: {
          name: true,
        },
      },
      monthFact: true,
    },
  });

  if (!current) return null;

  const history = await prisma.retentionTenantMonth.findMany({
    where: {
      customerRecordId,
      organizationId: actor.organizationId,
    },
    orderBy: [{ monthStart: "asc" }],
  });

  const row = mapCurrentToRow(current);
  const detailData = asRecord(current.detailData);
  const featureData = asRecord(current.monthFact.featureData);
  const coverage = asRecord(current.monthFact.coverageData) as unknown as RetentionCoveragePayload;
  const overlays = asRecord(featureData.overlays);
  const commercial = asRecord(featureData.commercial);
  const support = asRecord(featureData.support);
  const billing = asRecord(featureData.billing);
  const usage = asRecord(featureData.usage);
  const adoption = asRecord(featureData.adoption);

  const timeline: RetentionTimelinePoint[] = history.map((month) => {
    const monthFeatures = asRecord(month.featureData);
    const monthUsage = asRecord(monthFeatures.usage);
    const monthSupport = asRecord(monthFeatures.support);
    const monthCommercial = asRecord(monthFeatures.commercial);
    const candidateMetrics = asRecord(monthFeatures.candidateMetrics);

    return {
      monthStart: month.monthStart.toISOString(),
      primaryLirPassed: month.primaryLirPassed,
      primaryLirValue: month.primaryLirValue,
      currentMonthActivity: asNumber(monthUsage.currentMonthActivity),
      orderCount: asNumber(monthUsage.ordersPerMonth),
      cardTouches: asNumber(monthUsage.cardTouchesLast30),
      itemTouches: asNumber(monthUsage.itemTouchesLast30),
      activeWeeksTrailing8: asNumber(candidateMetrics.activeWeeksTrailing8),
      recentBaselineRatio: asNumber(candidateMetrics.recentBaselineRatio),
      supportTickets30d: asNumber(monthSupport.ticketsLast30),
      mrr: asNumber(monthCommercial.mrr),
      status: retentionStatusFromDb(month.status),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    lirDefinition: DEFAULT_RETENTION_LIR_BY_PHASE[row.lifecyclePhase],
    tenant: {
      ...row,
      goLiveDate: asString(detailData.goLiveDate) ?? asString(overlays.goLiveDate),
      subscriptionStartDate: asString(detailData.subscriptionStartDate) ?? asString(commercial.subscriptionStartDate),
      firstOrderDate: asString(detailData.firstOrderDate) ?? asString(usage.firstOrderDate),
      implementationStage: asString(detailData.implementationStage) ?? asString(overlays.implementationStage),
      commercial,
      supportSummary: support,
      billingSummary: billing,
      usageSummary: usage,
      adoptionSummary: adoption,
      coverage,
      explanation: asString(detailData.explanation) ?? buildExplanation(row),
    },
    timeline,
  };
}

export function normalizeRetentionFilters(searchParams: URLSearchParams): RetentionTenantFilterInput {
  return {
    status: searchParams.get("status"),
    plan: searchParams.get("plan"),
    icp: searchParams.get("icp"),
    owner: searchParams.get("owner"),
    segment: searchParams.get("segment"),
    lifecyclePhase: searchParams.get("lifecyclePhase"),
    ageBucket: searchParams.get("ageBucket"),
    search: searchParams.get("search"),
  };
}
