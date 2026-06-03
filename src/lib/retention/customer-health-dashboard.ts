import { prisma } from "@/lib/prisma";
import { retentionStatusFromDb } from "@/lib/retention/status";
import type {
  RetentionCoveragePayload,
  RetentionLifecyclePhase,
  RetentionReasonCode,
  RetentionStatus,
} from "@/lib/retention/types";
import type { RetentionActor } from "@/lib/retention/service";

const HEALTH_SOURCES = ["ARDA", "CODA", "STRIPE", "HUBSPOT", "PYLON"] as const;
const HEALTH_STATUSES: RetentionStatus[] = [
  "Healthy",
  "Watch",
  "At Risk",
  "Onboarding Risk",
  "Billing Risk",
];

type HealthSource = (typeof HEALTH_SOURCES)[number];

interface CurrentHealthRow {
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
  ownerName: string | null;
  segment: string | null;
  plan: string | null;
  ageBucket: string | null;
  reasonCodes: unknown;
  detailData: unknown;
  lastMaterializedAt: Date | string;
  customerRecord: {
    name: string;
  };
}

export interface CustomerHealthAccountRow {
  accountId: string;
  name: string;
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
  ownerName: string | null;
  segment: string | null;
  plan: string | null;
  ageBucket: string | null;
  reasonCodes: RetentionReasonCode[];
  coverage: RetentionCoveragePayload;
  lastMaterializedAt: string;
}

export interface CustomerHealthSourceCoverage {
  source: HealthSource;
  tenantsCovered: number;
  totalTenants: number;
  coveragePct: number;
}

export interface CustomerHealthArdaDataQuality {
  latestSync: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    recordCount: number;
    mappedCount: number;
    errorCount: number;
    lastError: string | null;
  } | null;
  tenantRecords: number;
  orderRecords: number;
  cardRecords: number;
  itemRecords: number;
  activityRecords: number;
  adoptionBreadthSource: "ARDA_ACTIVITY" | "ARDA_USER_DETAILS" | "NONE";
  note: string;
}

export interface CustomerHealthDashboardData {
  generatedAt: string;
  totals: {
    totalAccounts: number;
    healthyAccounts: number;
    watchAccounts: number;
    atRiskAccounts: number;
    onboardingRiskAccounts: number;
    billingRiskAccounts: number;
    lirPassingAccounts: number;
    avgCurrentMonthActivity: number;
  };
  healthStatusBreakdown: Array<{
    status: RetentionStatus;
    count: number;
  }>;
  sourceCoverage: CustomerHealthSourceCoverage[];
  ardaDataQuality: CustomerHealthArdaDataQuality;
  riskQueues: {
    atRisk: CustomerHealthAccountRow[];
    onboardingRisk: CustomerHealthAccountRow[];
    billingRisk: CustomerHealthAccountRow[];
    sharpDeclines: CustomerHealthAccountRow[];
  };
  accounts: CustomerHealthAccountRow[];
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
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  return "";
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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

function defaultCoverage(): RetentionCoveragePayload {
  return {
    arda: false,
    coda: false,
    stripe: false,
    hubspot: false,
    pylon: false,
    missingSources: ["arda", "coda", "stripe", "hubspot", "pylon"],
  };
}

function parseCoverage(value: unknown): RetentionCoveragePayload {
  const detail = asRecord(value);
  const coverage = asRecord(detail.coverage);
  if (Object.keys(coverage).length === 0) return defaultCoverage();
  return {
    arda: Boolean(coverage.arda),
    coda: Boolean(coverage.coda),
    stripe: Boolean(coverage.stripe),
    hubspot: Boolean(coverage.hubspot),
    pylon: Boolean(coverage.pylon),
    ardaActivityCollectionAvailable:
      typeof coverage.ardaActivityCollectionAvailable === "boolean"
        ? coverage.ardaActivityCollectionAvailable
        : undefined,
    ardaUserDetailsFallback:
      typeof coverage.ardaUserDetailsFallback === "boolean"
        ? coverage.ardaUserDetailsFallback
        : undefined,
    missingSources: asArray<string>(coverage.missingSources),
  };
}

function statusFromRow(status: string): RetentionStatus {
  return retentionStatusFromDb(status) ?? "Watch";
}

function lifecycleFromRow(value: string): RetentionLifecyclePhase {
  return value === "ONBOARDING" ? "ONBOARDING" : "MATURE";
}

function accountRiskRank(account: CustomerHealthAccountRow): number {
  const ranks: Record<RetentionStatus, number> = {
    "At Risk": 0,
    "Onboarding Risk": 1,
    "Billing Risk": 2,
    Watch: 3,
    Healthy: 4,
  };
  return ranks[account.status];
}

function compareAccountsByAttention(
  left: CustomerHealthAccountRow,
  right: CustomerHealthAccountRow,
): number {
  const rankDelta = accountRiskRank(left) - accountRiskRank(right);
  if (rankDelta !== 0) return rankDelta;
  return (left.trendVsPriorPct ?? 0) - (right.trendVsPriorPct ?? 0);
}

function mapAccount(row: CurrentHealthRow): CustomerHealthAccountRow {
  return {
    accountId: row.customerRecordId,
    name: row.customerRecord.name,
    status: statusFromRow(row.status),
    lifecyclePhase: lifecycleFromRow(row.lifecyclePhase),
    primaryLirPassed: row.primaryLirPassed,
    primaryLirLabel: row.primaryLirLabel,
    primaryLirValue: row.primaryLirValue,
    primaryLirThreshold: row.primaryLirThreshold,
    currentMonthActivity: row.currentMonthActivity,
    trendVsPriorPct: row.activityTrendPct,
    supportRisk: row.supportRisk,
    billingRisk: row.billingRisk,
    onboardingRisk: row.onboardingRisk,
    ownerName: row.ownerName,
    segment: row.segment,
    plan: row.plan,
    ageBucket: row.ageBucket,
    reasonCodes: parseReasonCodes(row.reasonCodes),
    coverage: parseCoverage(row.detailData),
    lastMaterializedAt: toIso(row.lastMaterializedAt),
  };
}

function buildTotals(accounts: CustomerHealthAccountRow[]): CustomerHealthDashboardData["totals"] {
  const totalAccounts = accounts.length;
  const activityValues = accounts
    .map((account) => account.currentMonthActivity)
    .filter((value): value is number => value !== null);
  return {
    totalAccounts,
    healthyAccounts: accounts.filter((account) => account.status === "Healthy").length,
    watchAccounts: accounts.filter((account) => account.status === "Watch").length,
    atRiskAccounts: accounts.filter((account) => account.status === "At Risk").length,
    onboardingRiskAccounts: accounts.filter((account) => account.status === "Onboarding Risk").length,
    billingRiskAccounts: accounts.filter((account) => account.status === "Billing Risk").length,
    lirPassingAccounts: accounts.filter((account) => account.primaryLirPassed).length,
    avgCurrentMonthActivity:
      activityValues.length > 0
        ? round(activityValues.reduce((sum, value) => sum + value, 0) / activityValues.length)
        : 0,
  };
}

function buildStatusBreakdown(accounts: CustomerHealthAccountRow[]) {
  return HEALTH_STATUSES
    .map((status) => ({
      status,
      count: accounts.filter((account) => account.status === status).length,
    }))
    .filter((entry) => entry.count > 0);
}

function buildSourceCoverage(input: {
  totalTenants: number;
  sourceRecords: Array<{ source: string; customerRecordId: string | null }>;
}): CustomerHealthSourceCoverage[] {
  const pairs = new Set<string>();
  const sourceCounts = new Map<HealthSource, number>();
  for (const record of input.sourceRecords) {
    if (!record.customerRecordId) continue;
    if (!HEALTH_SOURCES.includes(record.source as HealthSource)) continue;
    const source = record.source as HealthSource;
    const pairKey = `${source}:${record.customerRecordId}`;
    if (pairs.has(pairKey)) continue;
    pairs.add(pairKey);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  return HEALTH_SOURCES.map((source) => {
    const tenantsCovered = sourceCounts.get(source) ?? 0;
    return {
      source,
      tenantsCovered,
      totalTenants: input.totalTenants,
      coveragePct:
        input.totalTenants > 0 ? round((tenantsCovered / input.totalTenants) * 100) : 0,
    };
  });
}

function ardaQualityNote(input: {
  activityRecords: number;
  tenantsWithUserDetailsBreadth: number;
}): string {
  if (input.activityRecords > 0) {
    return "Arda direct item/card/order history is available in the retention source records.";
  }
  if (input.tenantsWithUserDetailsBreadth > 0) {
    return "Arda direct item/card/order history is unavailable; current adoption breadth falls back to User Details snapshot counts.";
  }
  return "No Arda activity history or User Details fallback breadth counts are currently available.";
}

function buildArdaDataQuality(input: {
  latestSync: {
    status: string;
    startedAt: Date | string;
    completedAt: Date | string | null;
    recordCount: number;
    mappedCount: number;
    errorCount: number;
    lastError: string | null;
  } | null;
  ardaGroups: Array<{ objectType: string; _count: { _all: number } }>;
  sourceRecords: Array<{ source: string; customerRecordId: string | null; payload?: unknown }>;
}): CustomerHealthArdaDataQuality {
  const counts = new Map(input.ardaGroups.map((group) => [group.objectType, group._count._all]));
  const orderRecords = counts.get("order") ?? 0;
  const cardRecords = counts.get("card") ?? 0;
  const itemRecords = counts.get("item") ?? 0;
  const activityRecords = orderRecords + cardRecords + itemRecords;
  const tenantsWithUserDetailsBreadth = input.sourceRecords.reduce((count, record) => {
    if (record.source !== "ARDA") return count;
    const payload = asRecord(record.payload);
    const cards = asNumber(payload.userDetailsCardCount) ?? 0;
    const items = asNumber(payload.userDetailsItemCount) ?? 0;
    const orders = asNumber(payload.userDetailsOrderCount) ?? 0;
    return cards > 0 || items > 0 || orders > 0 ? count + 1 : count;
  }, 0);

  return {
    latestSync: input.latestSync
      ? {
          status: input.latestSync.status,
          startedAt: toIso(input.latestSync.startedAt),
          completedAt: input.latestSync.completedAt ? toIso(input.latestSync.completedAt) : null,
          recordCount: input.latestSync.recordCount,
          mappedCount: input.latestSync.mappedCount,
          errorCount: input.latestSync.errorCount,
          lastError: input.latestSync.lastError,
        }
      : null,
    tenantRecords: counts.get("tenant") ?? 0,
    orderRecords,
    cardRecords,
    itemRecords,
    activityRecords,
    adoptionBreadthSource:
      activityRecords > 0
        ? "ARDA_ACTIVITY"
        : tenantsWithUserDetailsBreadth > 0
          ? "ARDA_USER_DETAILS"
          : "NONE",
    note: ardaQualityNote({ activityRecords, tenantsWithUserDetailsBreadth }),
  };
}

export async function buildCustomerHealthDashboard(
  actor: RetentionActor,
): Promise<CustomerHealthDashboardData> {
  const [currentRows, sourceRecords, ardaGroups, latestArdaSync] = await Promise.all([
    prisma.retentionTenantCurrent.findMany({
      where: { organizationId: actor.organizationId },
      include: {
        customerRecord: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }) as Promise<CurrentHealthRow[]>,
    prisma.retentionSourceRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        customerRecordId: { not: null },
      },
      select: {
        source: true,
        customerRecordId: true,
        payload: true,
      },
    }) as Promise<Array<{ source: string; customerRecordId: string | null; payload: unknown }>>,
    prisma.retentionSourceRecord.groupBy({
      by: ["objectType"],
      where: {
        organizationId: actor.organizationId,
        source: "ARDA",
      },
      _count: {
        _all: true,
      },
    }) as Promise<Array<{ objectType: string; _count: { _all: number } }>>,
    prisma.retentionSyncRun.findFirst({
      where: {
        organizationId: actor.organizationId,
        source: "ARDA",
      },
      orderBy: [{ startedAt: "desc" }],
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        recordCount: true,
        mappedCount: true,
        errorCount: true,
        lastError: true,
      },
    }) as Promise<CustomerHealthArdaDataQuality["latestSync"]>,
  ]);

  const accounts = currentRows.map(mapAccount).sort(compareAccountsByAttention);
  const totals = buildTotals(accounts);

  return {
    generatedAt: new Date().toISOString(),
    totals,
    healthStatusBreakdown: buildStatusBreakdown(accounts),
    sourceCoverage: buildSourceCoverage({
      totalTenants: totals.totalAccounts,
      sourceRecords,
    }),
    ardaDataQuality: buildArdaDataQuality({
      latestSync: latestArdaSync,
      ardaGroups,
      sourceRecords,
    }),
    riskQueues: {
      atRisk: accounts.filter((account) => account.status === "At Risk").slice(0, 10),
      onboardingRisk: accounts.filter((account) => account.status === "Onboarding Risk").slice(0, 10),
      billingRisk: accounts.filter((account) => account.status === "Billing Risk").slice(0, 10),
      sharpDeclines: accounts.filter((account) => (account.trendVsPriorPct ?? 0) <= -30).slice(0, 10),
    },
    accounts,
  };
}
