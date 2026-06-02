import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { PrismaEnrichmentProvider } from "@/lib/analytics/prisma-funnel-enums";
import {
  pullUnifySignalsFromApi,
  type UnifyPullRequest,
  type UnifyPullResult,
} from "@/lib/analytics/provider-enrichment-adapters";
import {
  ingestVisitorEnrichmentSignals,
  type VisitorEnrichmentSignalInput,
} from "@/lib/analytics/visitor-funnel";
import {
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
  getVisitorFunnelPrisma,
  type VisitorFunnelPrismaClient,
} from "@/lib/analytics/visitor-funnel-availability";
import {
  ingestImladrisRawRecords,
  type IngestImladrisRawRecordsInput,
} from "@/lib/imladris/ingestion";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";
import type { PrismaClientType } from "@/lib/prisma";

export type ProviderEnrichmentSyncResult = {
  provider: "unify" | "clay" | "rb2b";
  mode: "pull" | "push_only";
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  pulled: number;
  stored: number;
  accepted: number;
  updatedAfter: string | null;
  statusPersistenceErrors?: string[];
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const trimmed = trimOrNull(value);
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnabled(value: string | null | undefined, fallback: boolean): boolean {
  const trimmed = trimOrNull(value)?.toLowerCase();
  if (!trimmed) return fallback;
  if (["1", "true", "yes", "on"].includes(trimmed)) return true;
  if (["0", "false", "no", "off"].includes(trimmed)) return false;
  return fallback;
}

function isoOrNull(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function requireConnectionStatusUserId(userId: string | null | undefined): string {
  const trimmed = userId?.trim();
  if (!trimmed) {
    throw new Error("missing userId for Unify connection status update");
  }
  return trimmed;
}

async function persistUnifyConnectionFreshness(input: {
  prisma: PrismaClientType;
  userId: string | null | undefined;
  syncedAt: Date;
}): Promise<void> {
  const userId = requireConnectionStatusUserId(input.userId);
  const data = {
    status: IntegrationConnectionStatus.CONNECTED,
    lastSyncedAt: input.syncedAt,
    lastError: null,
  };
  const updateResult = await input.prisma.integrationConnection.updateMany({
    where: {
      provider: IntegrationProvider.UNIFY,
      userId,
    },
    data,
  });
  if (updateResult?.count === 0) {
    await input.prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: IntegrationProvider.UNIFY,
        },
      },
      update: data,
      create: {
        userId,
        provider: IntegrationProvider.UNIFY,
        ...data,
      },
    });
  }
}

async function persistUnifyConnectionFailure(input: {
  prisma: PrismaClientType;
  userId: string | null | undefined;
  error: string;
}): Promise<void> {
  const userId = requireConnectionStatusUserId(input.userId);
  const data = {
    status: IntegrationConnectionStatus.ERROR,
    lastSyncedAt: null,
    lastError: input.error,
  };
  const updateResult = await input.prisma.integrationConnection.updateMany({
    where: {
      provider: IntegrationProvider.UNIFY,
      userId,
    },
    data,
  });
  if (updateResult?.count === 0) {
    await input.prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: IntegrationProvider.UNIFY,
        },
      },
      update: data,
      create: {
        userId,
        provider: IntegrationProvider.UNIFY,
        ...data,
      },
    });
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function captureStatusPersistenceError(
  persistenceTarget: string,
  fn: () => Promise<void>,
): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return `${persistenceTarget} status persistence failed: ${errorMessage(
      error,
      "unknown persistence failure",
    )}`;
  }
}

function numericErrorField(error: unknown, field: string): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRetryableUnifyPullError(error: unknown): boolean {
  const status =
    numericErrorField(error, "status") ??
    numericErrorField(error, "statusCode") ??
    numericErrorField(error, "code");
  if (status === 429 || (status !== null && status >= 500 && status < 600)) {
    return true;
  }

  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("rate limit") ||
    message.includes("temporarily") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

function unifyRetryBaseMs(): number {
  const raw =
    process.env.UNIFY_FUNNEL_RETRY_BASE_MS ??
    process.env.PROVIDER_SYNC_RETRY_BASE_MS ??
    (process.env.NODE_ENV === "test" ? "0" : "250");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
}

async function waitForUnifyRetry(attempt: number): Promise<void> {
  const delayMs = unifyRetryBaseMs() * 2 ** (attempt - 1);
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function pullUnifyWithRetry(input: {
  pull: typeof pullUnifySignalsFromApi;
  request: UnifyPullRequest & {
    apiKey: string;
    objectName: string;
  };
}): Promise<UnifyPullResult | VisitorEnrichmentSignalInput[]> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await input.pull(input.request);
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableUnifyPullError(error)) {
        throw error;
      }
      await waitForUnifyRetry(attempt);
    }
  }

  throw new Error("Unify pull failed");
}

function normalizeUnifyPullResult(
  result: UnifyPullResult | VisitorEnrichmentSignalInput[],
): UnifyPullResult {
  if (Array.isArray(result)) {
    return {
      signals: result,
      truncated: false,
      totalFiltered: result.length,
      returned: result.length,
      maxRecords: result.length,
    };
  }

  return result;
}

export function computeInitialLookbackCursor(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export function computeIncrementalCursor(
  latestSeenAt: Date | null,
  now: Date,
  initialLookbackHours: number,
  overlapMinutes: number,
): string {
  if (!latestSeenAt) {
    return computeInitialLookbackCursor(now, initialLookbackHours);
  }

  return new Date(latestSeenAt.getTime() - overlapMinutes * 60 * 1000).toISOString();
}

export function resolveUnifyPullRequest(now: Date): (UnifyPullRequest & {
  apiKey: string | null;
  objectName: string | null;
  enabled: boolean;
}) {
  const apiKey =
    trimOrNull(process.env.UNIFY_DATA_API_KEY) ??
    trimOrNull(process.env.UNIFY_API_KEY);
  const objectName = trimOrNull(process.env.UNIFY_FUNNEL_OBJECT_NAME);
  const enabled = parseEnabled(process.env.UNIFY_FUNNEL_SYNC_ENABLED, Boolean(apiKey && objectName));

  return {
    mode: "pull",
    apiKey,
    objectName,
    updatedAfter: computeInitialLookbackCursor(
      now,
      parsePositiveInt(process.env.UNIFY_FUNNEL_INITIAL_LOOKBACK_HOURS, 24 * 7),
    ),
    maxRecords: parsePositiveInt(process.env.UNIFY_FUNNEL_MAX_RECORDS, 500),
    enabled,
  };
}

async function latestUnifySignalCursor(prisma: PrismaClientType): Promise<Date | null> {
  const funnelPrisma = getVisitorFunnelPrisma(prisma);
  if (!funnelPrisma) {
    return null;
  }

  const latest = await funnelPrisma.funnelEnrichmentSignal.findFirst({
    where: {
      provider: PrismaEnrichmentProvider.UNIFY,
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: {
      occurredAt: true,
      createdAt: true,
    },
  });

  return latest?.occurredAt ?? latest?.createdAt ?? null;
}

export async function runVisitorFunnelEnrichmentSyncs(input: {
  prisma: PrismaClientType;
  imladrisContext?: {
    userId: string | null;
    organizationId: string | null;
  };
  now?: Date;
  pullUnify?: typeof pullUnifySignalsFromApi;
  ingestSignals?: (
    prisma: VisitorFunnelPrismaClient,
    provider: "unify",
    signals: VisitorEnrichmentSignalInput[],
  ) => Promise<{ accepted: number; stored: number }>;
  ingestRawRecords?: (
    input: IngestImladrisRawRecordsInput,
  ) => Promise<{
    status: string;
    recordCount: number;
    acceptedCount: number;
    errorCount: number;
    statusPersistenceErrors?: string[];
  }>;
}): Promise<ProviderEnrichmentSyncResult[]> {
  const results: ProviderEnrichmentSyncResult[] = [
    {
      provider: "clay",
      mode: "push_only",
      ok: true,
      skipped: true,
      reason: "Push-only provider; send payloads to /api/v1/analytics/funnel/enrich/clay.",
      pulled: 0,
      stored: 0,
      accepted: 0,
      updatedAfter: null,
    },
    {
      provider: "rb2b",
      mode: "push_only",
      ok: true,
      skipped: true,
      reason: "Push-only provider; send payloads to /api/v1/analytics/funnel/enrich/rb2b.",
      pulled: 0,
      stored: 0,
      accepted: 0,
      updatedAfter: null,
    },
  ];

  const now = input.now ?? new Date();
  const config = resolveUnifyPullRequest(now);
  if (!config.enabled) {
    return [
      {
        provider: "unify",
        mode: "pull",
        ok: true,
        skipped: true,
        reason: "UNIFY_FUNNEL_SYNC_ENABLED is disabled or missing required configuration.",
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: null,
      },
      ...results,
    ];
  }

  if (!config.apiKey || !config.objectName) {
    return [
      {
        provider: "unify",
        mode: "pull",
        ok: false,
        skipped: true,
        reason: "Missing UNIFY_DATA_API_KEY/UNIFY_API_KEY or UNIFY_FUNNEL_OBJECT_NAME.",
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: null,
      },
      ...results,
    ];
  }

  const overlapMinutes = parsePositiveInt(process.env.UNIFY_FUNNEL_CURSOR_OVERLAP_MINUTES, 60);
  const initialLookbackHours = parsePositiveInt(
    process.env.UNIFY_FUNNEL_INITIAL_LOOKBACK_HOURS,
    24 * 7,
  );
  const funnelPrisma = getVisitorFunnelPrisma(input.prisma);
  if (!funnelPrisma) {
    return [
      {
        provider: "unify",
        mode: "pull",
        ok: false,
        skipped: true,
        reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: null,
      },
      ...results,
    ];
  }

  try {
    const latestCursor = await latestUnifySignalCursor(input.prisma);
    const updatedAfter = computeIncrementalCursor(
      latestCursor,
      now,
      initialLookbackHours,
      overlapMinutes,
    );
    const pullImpl = input.pullUnify ?? pullUnifySignalsFromApi;
    const pullResult = normalizeUnifyPullResult(await pullUnifyWithRetry({
      pull: pullImpl,
      request: {
        mode: "pull",
        apiKey: config.apiKey,
        objectName: config.objectName,
        updatedAfter,
        maxRecords: config.maxRecords,
      },
    }));
    if (pullResult.truncated) {
      throw new Error(
        `Unify pull returned ${pullResult.returned}/${pullResult.totalFiltered} filtered records; refusing to persist truncated enrichment data.`,
      );
    }

    const { signals } = pullResult;
    const rawIngestImpl = input.ingestRawRecords ?? ingestImladrisRawRecords;
    const rawRecords = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.UNIFY,
      snapshotKey: "unify",
      payload: {
        signals,
        objectName: config.objectName,
        pulled: signals.length,
      },
      from: updatedAfter,
      to: now.toISOString(),
      capturedAt: now,
    });
    const rawResult = await rawIngestImpl({
      prisma: input.prisma,
      provider: IntegrationProvider.UNIFY,
      context: input.imladrisContext ?? {
        userId: null,
        organizationId: null,
      },
      records: rawRecords,
      mode: "incremental",
      windowStart: new Date(updatedAfter),
      windowEnd: now,
      checkpoint: {
        providerKey: "unify",
        objectName: config.objectName,
        updatedAfter,
      },
      now,
    });
    const rawStatusPersistenceErrors = Array.isArray(rawResult.statusPersistenceErrors)
      ? rawResult.statusPersistenceErrors.filter((error) => error.trim().length > 0)
      : [];
    if (rawResult.status === "ERROR") {
      throw new Error(
        `Imladris raw ingestion failed for Unify: ${rawResult.acceptedCount}/${rawResult.recordCount} records accepted.`,
      );
    }
    if (rawResult.status === "PARTIAL") {
      throw new Error(
        `Imladris raw ingestion partially succeeded for Unify: ${rawResult.acceptedCount}/${rawResult.recordCount} records accepted.`,
      );
    }

    const ingestImpl = input.ingestSignals ?? ingestVisitorEnrichmentSignals;
    const outcome = signals.length > 0
      ? await ingestImpl(funnelPrisma, "unify", signals)
      : { accepted: 0, stored: 0 };
    const statusPersistenceError = await captureStatusPersistenceError(
      "integrationConnection",
      () => persistUnifyConnectionFreshness({
        prisma: input.prisma,
        userId: input.imladrisContext?.userId,
        syncedAt: now,
      }),
    );
    const statusPersistenceErrors = [
      ...rawStatusPersistenceErrors,
      ...(statusPersistenceError ? [statusPersistenceError] : []),
    ];

    return [
      {
        provider: "unify",
        mode: "pull",
        ok: statusPersistenceErrors.length === 0,
        skipped: false,
        reason: statusPersistenceErrors[0] ?? null,
        pulled: signals.length,
        stored: outcome.stored,
        accepted: outcome.accepted,
        updatedAfter,
        statusPersistenceErrors,
      },
      ...results,
    ];
  } catch (error) {
    const reason =
      errorMessage(error, "Failed to sync Unify enrichment signals.");
    const statusPersistenceError = await captureStatusPersistenceError(
      "integrationConnection",
      () => persistUnifyConnectionFailure({
        prisma: input.prisma,
        userId: input.imladrisContext?.userId,
        error: reason,
      }),
    );
    const statusPersistenceErrors = statusPersistenceError ? [statusPersistenceError] : [];
    const resultReason = statusPersistenceErrors.length > 0
      ? `${reason}; ${statusPersistenceErrors.join("; ")}`
      : reason;

    return [
      {
        provider: "unify",
        mode: "pull",
        ok: false,
        skipped: false,
        reason: resultReason,
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: isoOrNull(now),
        statusPersistenceErrors,
      },
      ...results,
    ];
  }
}
