import { REQUIRED_IMLADRIS_PROVIDERS, IMLADRIS_METRIC_DEFINITIONS, getImladrisDashboardDefinition } from "@/lib/imladris/catalog";
import type { ImladrisProviderKey } from "@/lib/imladris/catalog";
import { getImladrisHistoricalWindow } from "@/lib/imladris/ingestion";
import type { IntegrationProvider } from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

type SourceStatus = "connected" | "missing" | "partial" | "stale" | "error";
type MetricStatus = "ready" | "missing" | "partial" | "stale" | "error";

interface UserContext {
  userId: string;
  organizationId: string | null;
}

interface SourceRow {
  provider: unknown;
  status: string;
  connectedAt: Date | string | null;
  lastSyncedAt: Date | string | null;
  lastError: string | null;
}

interface SnapshotRow {
  providerKey: string;
  status: string;
  capturedAt: Date | string;
  expiresAt: Date | string;
  lastError: string | null;
}

interface SourceSyncRunRow {
  provider: unknown;
  status: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  windowStart: Date | string | null;
  windowEnd: Date | string | null;
  checkpoint: unknown;
  recordCount: number;
  acceptedCount: number;
  errorCount: number;
  lastError: string | null;
}

interface MetricLineageRow {
  sourceKey: string;
  sourceType: string;
  sourceId: string | null;
  rawRecordId: string | null;
  capturedAt: Date | string | null;
  metadata: unknown;
}

interface CanonicalMetricRow {
  metricKey: string;
  department: string;
  unit: string;
  value: unknown;
  periodStart: Date | string;
  periodEnd: Date | string;
  status: string;
  confidence: number;
  warnings: string[];
  calculationVersion: string;
  computedAt: Date | string;
  lineage: MetricLineageRow[];
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function ageHours(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * 60 * 1000);
}

function sourceStatus(input: {
  connection: SourceRow | null;
  snapshot: SnapshotRow | null;
  syncRun: SourceSyncRunRow | null;
  now: Date;
  freshnessSlaHours: number;
  lastSyncedAt: Date | null;
}): SourceStatus {
  if (
    input.connection?.status === "ERROR" ||
    input.snapshot?.status === "ERROR" ||
    input.syncRun?.status === "ERROR"
  ) {
    return "error";
  }
  if (!input.connection && !input.snapshot && !input.syncRun) return "missing";
  if (
    input.syncRun?.status === "PARTIAL" ||
    (input.syncRun && input.syncRun.acceptedCount < input.syncRun.recordCount) ||
    (input.syncRun?.errorCount ?? 0) > 0
  ) {
    return "partial";
  }
  if (
    input.lastSyncedAt &&
    addHours(input.lastSyncedAt, input.freshnessSlaHours).getTime() < input.now.getTime()
  ) {
    return "stale";
  }
  if (
    !input.syncRun &&
    input.snapshot &&
    new Date(input.snapshot.expiresAt).getTime() < input.now.getTime()
  ) {
    return "stale";
  }
  return "connected";
}

function canonicalMetricStatus(sourceKeys: ImladrisProviderKey[], sourceStatuses: Map<ImladrisProviderKey, SourceStatus>) {
  if (sourceKeys.every((sourceKey) => sourceStatuses.get(sourceKey) === "connected")) return "ready";
  if (sourceKeys.some((sourceKey) => sourceStatuses.get(sourceKey) === "error")) return "error";
  if (sourceKeys.some((sourceKey) => sourceStatuses.get(sourceKey) === "partial")) return "partial";
  if (sourceKeys.some((sourceKey) => sourceStatuses.get(sourceKey) === "stale")) return "stale";
  return "missing";
}

function canonicalStatus(status: string): MetricStatus {
  switch (status) {
    case "READY":
      return "ready";
    case "STALE":
      return "stale";
    case "ERROR":
      return "error";
    default:
      return "missing";
  }
}

export async function buildImladrisSources(input: {
  prisma: PrismaClientType;
  context: UserContext;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const providerAliases = REQUIRED_IMLADRIS_PROVIDERS.flatMap(
    (provider) => provider.providerAliases,
  ) as IntegrationProvider[];
  const [connections, snapshots, syncRuns] = await Promise.all([
    input.prisma.integrationConnection.findMany({
      where: {
        OR: [
          { userId: input.context.userId },
          ...(input.context.organizationId ? [{ organizationId: input.context.organizationId }] : []),
        ],
      },
      select: {
        provider: true,
        status: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastError: true,
      },
    }),
    input.prisma.analyticsSnapshot.findMany({
      where: {
        userId: input.context.userId,
        providerKey: {
          in: REQUIRED_IMLADRIS_PROVIDERS.flatMap((provider) => provider.snapshotKeys),
        },
      },
      select: {
        providerKey: true,
        status: true,
        capturedAt: true,
        expiresAt: true,
        lastError: true,
      },
      orderBy: [{ capturedAt: "desc" }],
    }),
    input.prisma.imladrisSourceSyncRun.findMany({
      where: {
        provider: {
          in: providerAliases,
        },
        OR: [
          { userId: input.context.userId },
          ...(input.context.organizationId ? [{ organizationId: input.context.organizationId }] : []),
        ],
      },
      select: {
        provider: true,
        status: true,
        startedAt: true,
        completedAt: true,
        windowStart: true,
        windowEnd: true,
        checkpoint: true,
        recordCount: true,
        acceptedCount: true,
        errorCount: true,
        lastError: true,
      },
      orderBy: [{ startedAt: "desc" }],
    }),
  ]);

  const typedConnections = connections as SourceRow[];
  const typedSnapshots = snapshots as SnapshotRow[];
  const typedSyncRuns = syncRuns as SourceSyncRunRow[];

  const snapshotByKey = new Map<string, SnapshotRow>();
  for (const snapshot of typedSnapshots) {
    if (!snapshotByKey.has(snapshot.providerKey)) {
      snapshotByKey.set(snapshot.providerKey, snapshot);
    }
  }

  const syncRunByProvider = new Map<string, SourceSyncRunRow>();
  for (const syncRun of typedSyncRuns) {
    const provider = String(syncRun.provider);
    if (!syncRunByProvider.has(provider)) {
      syncRunByProvider.set(provider, syncRun);
    }
  }

  return REQUIRED_IMLADRIS_PROVIDERS.map((provider) => {
    const connection =
      typedConnections.find((candidate) =>
        provider.providerAliases.includes(String(candidate.provider)),
      ) ?? null;
    const snapshot =
      provider.snapshotKeys.map((key) => snapshotByKey.get(key)).find(Boolean) ?? null;
    const syncRun =
      provider.providerAliases.map((alias) => syncRunByProvider.get(alias)).find(Boolean) ??
      null;
    const lastSyncedAt =
      toDate(syncRun?.completedAt) ??
      toDate(syncRun?.startedAt) ??
      toDate(snapshot?.capturedAt) ??
      toDate(connection?.lastSyncedAt);
    const staleAfter = lastSyncedAt
      ? addHours(lastSyncedAt, provider.freshnessSlaHours)
      : null;
    const expectedWindow = getImladrisHistoricalWindow(now);
    const latestWindowStart = toDate(syncRun?.windowStart);
    const latestWindowEnd = toDate(syncRun?.windowEnd);
    const status = sourceStatus({
      connection,
      snapshot,
      syncRun,
      now,
      freshnessSlaHours: provider.freshnessSlaHours,
      lastSyncedAt,
    });

    return {
      key: provider.key,
      label: provider.label,
      status,
      connected: status === "connected",
      lastSyncedAt: toIso(lastSyncedAt),
      lastSnapshotAt: toIso(snapshot?.capturedAt),
      lastError: connection?.lastError ?? syncRun?.lastError ?? snapshot?.lastError ?? null,
      snapshotKeys: provider.snapshotKeys,
      freshness: {
        slaHours: provider.freshnessSlaHours,
        lastSyncedAt: toIso(lastSyncedAt),
        staleAfter: toIso(staleAfter),
        ageHours: lastSyncedAt ? ageHours(lastSyncedAt, now) : null,
      },
      historicalCoverage: {
        requiredLookbackMonths: provider.historicalLookbackMonths,
        expectedWindowStart: toIso(expectedWindow.windowStart),
        expectedWindowEnd: toIso(expectedWindow.windowEnd),
        latestWindowStart: toIso(latestWindowStart),
        latestWindowEnd: toIso(latestWindowEnd),
        hasRequiredLookback:
          latestWindowStart != null &&
          latestWindowStart.getTime() <= expectedWindow.windowStart.getTime(),
      },
      latestSyncRun: syncRun
        ? {
            status: syncRun.status,
            startedAt: toIso(syncRun.startedAt),
            completedAt: toIso(syncRun.completedAt),
            windowStart: toIso(syncRun.windowStart),
            windowEnd: toIso(syncRun.windowEnd),
            checkpoint: syncRun.checkpoint,
            recordCount: syncRun.recordCount,
            acceptedCount: syncRun.acceptedCount,
            errorCount: syncRun.errorCount,
            lastError: syncRun.lastError,
          }
        : null,
    };
  });
}

export async function buildImladrisMetrics(input: {
  prisma: PrismaClientType;
  context: UserContext;
  now?: Date;
}) {
  const [sources, canonicalRows] = await Promise.all([
    buildImladrisSources(input),
    input.prisma.imladrisCanonicalMetricValue.findMany({
      where: {
        metricKey: {
          in: IMLADRIS_METRIC_DEFINITIONS.map((definition) => definition.key),
        },
        OR: [
          { userId: input.context.userId },
          ...(input.context.organizationId ? [{ organizationId: input.context.organizationId }] : []),
        ],
      },
      include: {
        lineage: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
      orderBy: [{ periodEnd: "desc" }, { computedAt: "desc" }],
    }),
  ]);
  const sourceStatuses = new Map(
    sources.map((source) => [source.key, source.status] as const),
  );
  const canonicalByMetricKey = new Map<string, CanonicalMetricRow>();
  for (const row of canonicalRows as CanonicalMetricRow[]) {
    if (!canonicalByMetricKey.has(row.metricKey)) {
      canonicalByMetricKey.set(row.metricKey, row);
    }
  }

  return IMLADRIS_METRIC_DEFINITIONS.map((definition) => {
    const canonicalRow = canonicalByMetricKey.get(definition.key);
    const status = canonicalRow
      ? canonicalStatus(canonicalRow.status)
      : canonicalMetricStatus(definition.sourceKeys, sourceStatuses);
    return {
      key: definition.key,
      label: definition.label,
      department: definition.department,
      unit: definition.unit,
      value: canonicalRow?.value ?? null,
      periodStart: toIso(canonicalRow?.periodStart),
      periodEnd: toIso(canonicalRow?.periodEnd),
      status,
      confidence: canonicalRow?.confidence ?? (status === "ready" ? 0.8 : 0),
      calculationVersion: canonicalRow?.calculationVersion ?? null,
      computedAt: toIso(canonicalRow?.computedAt),
      sourceLineage: canonicalRow?.lineage?.length
        ? canonicalRow.lineage.map((lineage) => ({
            sourceKey: lineage.sourceKey,
            sourceType: lineage.sourceType,
            sourceId: lineage.sourceId,
            rawRecordId: lineage.rawRecordId,
            capturedAt: toIso(lineage.capturedAt),
            metadata: lineage.metadata,
            status: sourceStatuses.get(lineage.sourceKey as ImladrisProviderKey) ?? "missing",
          }))
        : definition.sourceKeys.map((sourceKey) => ({
            sourceKey,
            status: sourceStatuses.get(sourceKey) ?? "missing",
          })),
      warnings:
        canonicalRow?.warnings ??
        (status === "ready"
          ? []
          : ["Canonical provider materialization is required before this metric is board-ready."]),
    };
  });
}

export async function buildImladrisDashboard(input: {
  prisma: PrismaClientType;
  context: UserContext;
  dashboardId: string;
  now?: Date;
}) {
  const dashboard = getImladrisDashboardDefinition(input.dashboardId);
  if (!dashboard) return null;
  const metrics = await buildImladrisMetrics(input);
  const metricSet = new Set(dashboard.metricKeys);
  return {
    dashboard,
    metrics: metrics.filter((metric) => metricSet.has(metric.key)),
  };
}
