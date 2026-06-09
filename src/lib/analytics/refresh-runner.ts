import {
  AnalyticsSnapshotStatus,
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
import { normalizeMercuryExpenseMappings } from "@/lib/analytics/mercury-expense-mappings";
import {
  fetchHubSpotData,
  fetchMercuryData,
  fetchStripeData,
} from "@/lib/analytics/fetchers";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaInstagramData,
  fetchMetaPageData,
  fetchRedditAdsData,
} from "@/lib/analytics/fetchers-ads";
import {
  fetchGitHubData,
  fetchLinearData,
  fetchPostHogData,
} from "@/lib/analytics/fetchers-development";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchGoogleSearchConsoleData } from "@/lib/analytics/fetchers-google-search-console";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import { providerForSnapshotKey } from "@/lib/analytics/provider-health";
import { snapshotExpiryFromNow, storeAnalyticsSnapshot, storeAnalyticsSnapshotFailure } from "@/lib/analytics/snapshots";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { runWithContextAsync } from "@/lib/request-context";
import { REQUIRED_IMLADRIS_PROVIDERS } from "@/lib/imladris/catalog";
import { ingestImladrisRawRecords } from "@/lib/imladris/ingestion";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";
import { snapshotKeyQueryVariants } from "@/lib/integrations/provider-registry";
import { MERCURY_CASHFLOW_SYNC_RULE_KEY } from "@/lib/integrations/provider-metrics-sync";
import {
  MONTHLY_HISTORY_CONTEXT_KEY,
  MONTHLY_HISTORY_RANGE_PRESET,
  MONTHLY_HISTORY_START_DATE,
} from "@/lib/analytics/monthly-pnl-history";
import { buildImladrisMetrics } from "@/lib/imladris/service";
import { prisma } from "@/lib/prisma";

type RollingRangePreset = "7d" | "30d" | "90d";

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function timeoutMsForRefreshJob(providerKey: string): number {
  if (providerKey === "stripe") return 25_000;
  return 10_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertRefreshPayloadComplete(providerKey: string, payload: unknown): void {
  const meta = isRecord(payload) && isRecord(payload._meta) ? payload._meta : null;
  if (meta?.truncated === true) {
    throw new Error(
      `Provider payload for ${providerKey} is truncated; refusing to persist partial analytics refresh data`
    );
  }
}

function numericErrorField(error: unknown, field: string): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAuthRefreshError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("token") ||
    message.includes("credential") ||
    message.includes("auth")
  );
}

function isRetryableRefreshError(error: unknown): boolean {
  if (isAuthRefreshError(error)) return false;

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

function analyticsRefreshRetryBaseMs(): number {
  const raw =
    process.env.ANALYTICS_REFRESH_RETRY_BASE_MS ??
    process.env.PROVIDER_SYNC_RETRY_BASE_MS ??
    (process.env.NODE_ENV === "test" ? "0" : "250");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
}

async function waitForRefreshRetry(attempt: number): Promise<void> {
  const delayMs = analyticsRefreshRetryBaseMs() * 2 ** (attempt - 1);
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function runRefreshJobWithRetry(input: {
  providerKey: string;
  run: () => Promise<unknown>;
}): Promise<unknown> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await timeout(input.run(), timeoutMsForRefreshJob(input.providerKey));
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableRefreshError(error)) {
        throw error;
      }
      await waitForRefreshRetry(attempt);
    }
  }

  throw new Error("analytics refresh failed");
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function buildMonthlyHistoryPeriods(input: {
  startDate?: Date;
  asOf?: Date;
} = {}): Array<{ fromDate: Date; toDate: Date }> {
  const startDate = startOfUtcMonth(input.startDate ?? MONTHLY_HISTORY_START_DATE);
  const endDate = startOfUtcMonth(input.asOf ?? new Date());
  const periods: Array<{ fromDate: Date; toDate: Date }> = [];

  for (let cursor = startDate; cursor <= endDate; cursor = addUtcMonths(cursor, 1)) {
    periods.push({
      fromDate: cursor,
      toDate: endOfUtcMonth(cursor),
    });
  }

  return periods;
}

function monthlySnapshotKey(input: { providerKey: string; fromDate: Date }): string {
  return `${input.providerKey}:${input.fromDate.toISOString()}`;
}

async function loadExistingMonthlyFinancialSnapshotKeys(input: {
  userId: string;
  fromDate: Date;
}): Promise<Set<string>> {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: {
      userId: input.userId,
      providerKey: { in: ["stripe", "mercury"] },
      contextKey: MONTHLY_HISTORY_CONTEXT_KEY,
      rangePreset: MONTHLY_HISTORY_RANGE_PRESET,
      status: AnalyticsSnapshotStatus.SUCCESS,
      fromDate: { gte: input.fromDate },
    },
    select: {
      providerKey: true,
      fromDate: true,
    },
  }) as Array<{ providerKey: string; fromDate: Date }>;

  return new Set(
    snapshots.map((snapshot) =>
      monthlySnapshotKey({
        providerKey: snapshot.providerKey,
        fromDate: snapshot.fromDate,
      }),
    ),
  );
}

async function resolveUserOrganizationId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  }) as { organizationId: string | null } | null;

  return user?.organizationId ?? null;
}

async function resolveRefreshUserIds(inputUserIds: string[] | undefined): Promise<string[]> {
  if (inputUserIds && inputUserIds.length > 0) {
    return inputUserIds;
  }

  const connections = await prisma.integrationConnection.findMany({
    distinct: ["userId"],
    select: { userId: true },
  }) as Array<{ userId: string }>;

  return connections.map((entry) => entry.userId);
}

const IMLADRIS_SNAPSHOT_KEYS = new Set(
  snapshotKeyQueryVariants(
    REQUIRED_IMLADRIS_PROVIDERS.flatMap((provider) => provider.snapshotKeys)
  )
);

export function shouldPersistImladrisRawSnapshot(providerKey: string): boolean {
  return IMLADRIS_SNAPSHOT_KEYS.has(providerKey);
}

async function persistImladrisRawSnapshot(input: {
  userId: string;
  organizationId: string | null;
  provider: IntegrationProvider | null;
  providerKey: string;
  payload: unknown;
  contextKey: string;
  rangePreset: string;
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  mode: "incremental" | "historical";
  capturedAt: Date;
}): Promise<void> {
  if (!input.provider || !shouldPersistImladrisRawSnapshot(input.providerKey)) {
    return;
  }

  const rawRecords = buildImladrisRawRecordsFromPayload({
    provider: input.provider,
    snapshotKey: input.providerKey,
    payload: input.payload,
    from: input.from,
    to: input.to,
    capturedAt: input.capturedAt,
  });
  const result = await ingestImladrisRawRecords({
    prisma,
    provider: input.provider,
    context: {
      userId: input.userId,
      organizationId: input.organizationId,
    },
    records: rawRecords,
    mode: input.mode,
    windowStart: input.fromDate,
    windowEnd: input.toDate,
    checkpoint: {
      providerKey: input.providerKey,
      contextKey: input.contextKey,
      rangePreset: input.rangePreset,
      from: input.from,
      to: input.to,
    },
    now: input.capturedAt,
  });

  if (result.status === "ERROR") {
    throw new Error(
      `Imladris raw ingestion failed for ${input.providerKey}: ${result.acceptedCount}/${result.recordCount} records accepted.`,
    );
  }

  if (result.status === "PARTIAL") {
    throw new Error(
      `Imladris raw ingestion partially succeeded for ${input.providerKey}: ${result.acceptedCount}/${result.recordCount} records accepted.`,
    );
  }
}

async function computeProductSnapshot(input: {
  userId: string;
  organizationId: string | null;
  fromDate: Date;
  toDate: Date;
}) {
  const run = async () => {
    const metrics = await buildImladrisMetrics({
      prisma,
      context: {
        userId: input.userId,
        organizationId: input.organizationId,
      },
    });
    const deliveryHealth = metrics.find((metric) => metric.key === "development.delivery_health");
    const value =
      deliveryHealth?.value && typeof deliveryHealth.value === "object"
        ? (deliveryHealth.value as Record<string, unknown>)
        : {};
    const completedLinearIssuesInRange =
      typeof value.completedLinearIssues === "number" ? value.completedLinearIssues : 0;
    const mergedPullRequestsInRange =
      typeof value.mergedPullRequests === "number" ? value.mergedPullRequests : 0;
    const activeContributors =
      typeof value.productEvents === "number" ? value.productEvents : 0;
    const cycleTimeRiskSignals =
      typeof value.averageLinearCycleTimeDays === "number" && value.averageLinearCycleTimeDays > 14
        ? 1
        : 0;
    const deliveryBalance = mergedPullRequestsInRange - completedLinearIssuesInRange;
    const deliveryRate =
      mergedPullRequestsInRange > 0 ? Math.round((completedLinearIssuesInRange / mergedPullRequestsInRange) * 10000) / 100 : null;

    return {
      activeContributors,
      mergedPullRequestsInRange,
      completedLinearIssuesInRange,
      cycleTimeRiskSignals,
      deliveryBalance,
      deliveryRate,
      _meta: {
        fetchedAt: new Date().toISOString(),
        nextRefresh: snapshotExpiryFromNow(1).toISOString(),
        source: "imladris" as const,
      },
    };
  };

  if (!input.organizationId) {
    return run();
  }

  return runWithContextAsync(
    { organizationId: input.organizationId, userId: input.userId },
    run,
  );
}

interface ProviderRefreshOutcome {
  succeeded: boolean;
  failed: boolean;
  lastError: string | null;
}

function recordProviderOutcome(
  outcomes: Map<IntegrationProvider, ProviderRefreshOutcome>,
  provider: IntegrationProvider | null,
  input: { success: boolean; error?: string | null }
) {
  if (!provider) return;

  const current = outcomes.get(provider) ?? {
    succeeded: false,
    failed: false,
    lastError: null,
  };

  if (input.success) {
    current.succeeded = true;
  } else {
    current.failed = true;
    current.lastError = input.error ?? current.lastError ?? "refresh failed";
  }

  outcomes.set(provider, current);
}

async function persistProviderRefreshOutcomes(input: {
  userId: string;
  outcomes: Map<IntegrationProvider, ProviderRefreshOutcome>;
  syncedAt: Date;
}): Promise<void> {
  for (const [provider, outcome] of input.outcomes.entries()) {
    if (outcome.succeeded) {
      const data = {
        status: IntegrationConnectionStatus.CONNECTED,
        lastSyncedAt: input.syncedAt,
        lastError: outcome.failed ? outcome.lastError ?? "refresh failed" : null,
      };
      try {
        const updateResult = await prisma.integrationConnection.updateMany({
          where: {
            userId: input.userId,
            provider,
          },
          data,
        });
        if (updateResult?.count === 0) {
          await prisma.integrationConnection.upsert({
            where: {
              userId_provider: {
                userId: input.userId,
                provider,
              },
            },
            update: data,
            create: {
              userId: input.userId,
              provider,
              ...data,
            },
          });
        }
      } catch (error) {
        console.error("analytics_refresh.connection_status_persist_failed", {
          userId: input.userId,
          provider,
          intendedStatus: IntegrationConnectionStatus.CONNECTED,
          persistenceError: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    if (outcome.failed) {
      const data = {
        status: IntegrationConnectionStatus.ERROR,
        lastError: outcome.lastError ?? "refresh failed",
      };
      try {
        const updateResult = await prisma.integrationConnection.updateMany({
          where: {
            userId: input.userId,
            provider,
          },
          data,
        });
        if (updateResult?.count === 0) {
          await prisma.integrationConnection.upsert({
            where: {
              userId_provider: {
                userId: input.userId,
                provider,
              },
            },
            update: data,
            create: {
              userId: input.userId,
              provider,
              ...data,
            },
          });
        }
      } catch (error) {
        console.error("analytics_refresh.connection_status_persist_failed", {
          userId: input.userId,
          provider,
          intendedStatus: IntegrationConnectionStatus.ERROR,
          originalError: outcome.lastError,
          persistenceError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function isSemrushApiUnitsExhausted(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("semrush api error") &&
    normalized.includes("api units balance is zero")
  );
}

function shouldCountRefreshFailure(input: {
  providerKey: string;
  errorMessage: string;
}): boolean {
  if (input.providerKey === "semrush" && isSemrushApiUnitsExhausted(input.errorMessage)) {
    return false;
  }

  return true;
}

async function storeRefreshFailureSnapshot(input: {
  userId: string;
  providerKey: string;
  contextKey: string;
  rangePreset: string;
  fromDate: Date;
  toDate: Date;
  error: string;
  expiresAt: Date;
}): Promise<void> {
  await Promise.resolve(storeAnalyticsSnapshotFailure(input)).catch((failureError) => {
    console.error("analytics_refresh.failure_snapshot_failed", {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey: input.contextKey,
      rangePreset: input.rangePreset,
      originalError: input.error,
      failureSnapshotError:
        failureError instanceof Error ? failureError.message : String(failureError),
    });
  });
}

async function refreshForUserAndRange(input: {
  userId: string;
  rangePreset: RollingRangePreset;
}): Promise<{ refreshed: number; failures: number; providerOutcomes: Map<IntegrationProvider, ProviderRefreshOutcome> }> {
  const params = new URLSearchParams();
  params.set("range", input.rangePreset);
  const range = parseAnalyticsTimeRange(params);
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  const creds = await getCredentials(input.userId);
  const organizationId = await resolveUserOrganizationId(input.userId);
  const expiresAt = snapshotExpiryFromNow(1);

  const jobs: Array<{
    providerKey: string;
    run: () => Promise<unknown>;
    tracksConnectionFreshness?: boolean;
  }> = [];

  if (creds.hubspotToken) {
    jobs.push({
      providerKey: "hubspot",
      run: () => fetchHubSpotData(creds.hubspotToken!, { fromDate, toDate }),
    });
  }
  if (creds.stripeKey) {
    jobs.push({
      providerKey: "stripe",
      run: () => fetchStripeData(creds.stripeKey!, { fromDate, toDate }),
    });
  }
  if (creds.mercuryKey) {
    const mercuryRule = await prisma.integrationRule.findUnique({
      where: {
        userId_provider_key: {
          userId: input.userId,
          provider: IntegrationProvider.MERCURY,
          key: MERCURY_CASHFLOW_SYNC_RULE_KEY,
        },
      },
      select: { config: true },
    });
    const expenseMappings = normalizeMercuryExpenseMappings(mercuryRule?.config ?? null);
    jobs.push({
      providerKey: "mercury",
      run: () => fetchMercuryData(creds.mercuryKey!, { fromDate, toDate, expenseMappings }),
    });
  }
  const hasGAServiceAccount = Boolean(
    creds.gaClientEmail && creds.gaPrivateKey
  );
  const hasGAOAuth = Boolean(
    process.env.GA_REFRESH_TOKEN?.trim() &&
      process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );

  if (creds.gaPropertyId && (hasGAServiceAccount || hasGAOAuth)) {
    jobs.push({
      providerKey: "googleAnalytics",
      run: () =>
        fetchGAData(
          creds.gaPropertyId!,
          creds.gaClientEmail ?? "",
          creds.gaPrivateKey ?? "",
          { fromDate, toDate }
        ),
    });
  }
  if (
    creds.searchConsoleSiteUrl &&
    (creds.searchConsoleAccessToken || hasGAServiceAccount || hasGAOAuth)
  ) {
    jobs.push({
      providerKey: "googleSearchConsole",
      run: () =>
        fetchGoogleSearchConsoleData({
          accessToken: creds.searchConsoleAccessToken,
          siteUrl: creds.searchConsoleSiteUrl!,
          clientEmail: creds.gaClientEmail,
          privateKey: creds.gaPrivateKey,
          refreshToken: process.env.GA_REFRESH_TOKEN?.trim() || null,
          googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || null,
          fromDate,
          toDate,
        }),
    });
  }
  if (
    creds.googleAdsDevToken &&
    creds.googleAdsCustomerId &&
    creds.googleAdsRefreshToken &&
    creds.googleAdsClientId &&
    creds.googleAdsClientSecret
  ) {
    jobs.push({
      providerKey: "googleAds",
      run: () =>
        fetchGoogleAdsData(
          creds.googleAdsDevToken!,
          creds.googleAdsCustomerId!,
          creds.googleAdsRefreshToken!,
          creds.googleAdsClientId!,
          creds.googleAdsClientSecret!,
          creds.googleAdsLoginCustomerId,
          { fromDate, toDate }
        ),
    });
  }
  if (creds.metaAdsAccessToken && creds.metaAdAccountId) {
    jobs.push({
      providerKey: "metaAds",
      run: () => fetchMetaAdsData(creds.metaAdsAccessToken!, creds.metaAdAccountId!, { fromDate, toDate }),
    });
  }
  if (creds.metaPageAccessToken && creds.metaPageId) {
    jobs.push({
      providerKey: "metaPage",
      run: () => fetchMetaPageData(creds.metaPageAccessToken!, creds.metaPageId!, { fromDate, toDate }),
    });
  }
  if (creds.metaPageAccessToken && creds.metaInstagramAccountId) {
    jobs.push({
      providerKey: "instagram",
      run: () =>
        fetchMetaInstagramData(
          creds.metaPageAccessToken!,
          creds.metaInstagramAccountId!,
          { pageId: creds.metaPageId ?? undefined },
          fromDate,
          toDate,
        ),
    });
  }
  if (creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId) {
    jobs.push({
      providerKey: "redditAds",
      run: () =>
        fetchRedditAdsData(
          creds.redditClientId!,
          creds.redditClientSecret!,
          creds.redditRefreshToken!,
          creds.redditAdAccountId!,
          creds.redditUserAgent,
          { fromDate, toDate }
        ),
    });
  }
  if (creds.webflowApiToken && creds.webflowSiteId) {
    jobs.push({
      providerKey: "webflow",
      run: () =>
        fetchWebflowData(
          creds.webflowApiToken!,
          creds.webflowSiteId!,
          fromDate,
          toDate,
        ),
    });
  }
  if (creds.semrushApiToken && creds.semrushDomain) {
    jobs.push({
      providerKey: "semrush",
      run: () => fetchSemrushData(creds.semrushApiToken!, creds.semrushDomain!),
    });
  }
  if (creds.codaApiToken && creds.codaDocId) {
    jobs.push({
      providerKey: "coda",
      run: () =>
        fetchCodaData(creds.codaApiToken!, creds.codaDocId!, {
          fromDate,
          toDate,
        }),
    });
  }
  if (creds.pylonApiKey) {
    jobs.push({
      providerKey: "pylon",
      run: () =>
        fetchPylonData({
          apiKey: creds.pylonApiKey!,
          from: range.from,
          to: range.to,
          baseUrl: creds.pylonBaseUrl ?? undefined,
        }),
    });
  }
  if (creds.posthogApiKey && creds.posthogProjectId) {
    jobs.push({
      providerKey: "posthog",
      run: () =>
        fetchPostHogData({
          apiKey: creds.posthogApiKey!,
          projectId: creds.posthogProjectId!,
          host: creds.posthogHost,
          fromDate,
          toDate,
        }),
    });
  }
  if (creds.linearApiKey) {
    jobs.push({
      providerKey: "linear",
      run: () =>
        fetchLinearData({
          apiKey: creds.linearApiKey!,
          fromDate,
          toDate,
        }),
    });
  }
  if (creds.githubToken && creds.githubOwner && creds.githubRepo) {
    jobs.push({
      providerKey: "github",
      run: () =>
        fetchGitHubData({
          token: creds.githubToken!,
          owner: creds.githubOwner!,
          repo: creds.githubRepo!,
          fromDate,
          toDate,
        }),
    });
  }

  jobs.push({
    providerKey: "product",
    tracksConnectionFreshness: false,
    run: () =>
      computeProductSnapshot({
        userId: input.userId,
        organizationId,
        fromDate,
        toDate,
      }),
  });

  jobs.push({
    providerKey: "googleWorkspace",
    tracksConnectionFreshness: false,
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "hubspotOps",
    tracksConnectionFreshness: false,
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.HUBSPOT,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "codaOps",
    tracksConnectionFreshness: false,
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.CODA,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "slack",
    tracksConnectionFreshness: false,
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "redditOps",
    tracksConnectionFreshness: false,
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.REDDIT,
        from: fromDate,
        to: toDate,
      }),
  });

  let refreshed = 0;
  let failures = 0;
  const providerOutcomes = new Map<IntegrationProvider, ProviderRefreshOutcome>();

  for (const job of jobs) {
    const provider = providerForSnapshotKey(job.providerKey);

    try {
      const memBefore = process.memoryUsage();
      let payload = await runRefreshJobWithRetry(job);
      const payloadSize = JSON.stringify(payload).length;
      const memAfterFetch = process.memoryUsage();
      console.error(`[refresh:mem] ${job.providerKey} range=${input.rangePreset}`, {
        payloadSizeKB: Math.round(payloadSize / 1024),
        heapBeforeMB: Math.round(memBefore.heapUsed / 1024 / 1024),
        heapAfterFetchMB: Math.round(memAfterFetch.heapUsed / 1024 / 1024),
        rssMB: Math.round(memAfterFetch.rss / 1024 / 1024),
      });
      assertRefreshPayloadComplete(job.providerKey, payload);
      const capturedAt = new Date();
      await persistImladrisRawSnapshot({
        userId: input.userId,
        organizationId,
        provider,
        providerKey: job.providerKey,
        payload,
        contextKey: "default",
        rangePreset: range.preset,
        from: range.from,
        to: range.to,
        fromDate,
        toDate,
        mode: "incremental",
        capturedAt,
      });
      await storeAnalyticsSnapshot({
        userId: input.userId,
        providerKey: job.providerKey,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
        payload,
        expiresAt,
      });
      // Explicitly release the payload reference so V8 can GC it
      // before the next provider iteration.
      payload = null as unknown as typeof payload;
      refreshed += 1;
      if (job.tracksConnectionFreshness !== false) {
        recordProviderOutcome(providerOutcomes, provider, { success: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "refresh failed";
      if (shouldCountRefreshFailure({ providerKey: job.providerKey, errorMessage: message })) {
        failures += 1;
      }
      await storeRefreshFailureSnapshot({
        userId: input.userId,
        providerKey: job.providerKey,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
        error: message,
        expiresAt,
      });
      if (job.tracksConnectionFreshness !== false) {
        recordProviderOutcome(providerOutcomes, provider, { success: false, error: message });
      }
    }
  }

  return { refreshed, failures, providerOutcomes };
}

async function refreshMonthlyFinancialHistoryForUser(input: {
  userId: string;
}): Promise<{ refreshed: number; failures: number; providerOutcomes: Map<IntegrationProvider, ProviderRefreshOutcome> }> {
  const creds = await getCredentials(input.userId);
  const organizationId = await resolveUserOrganizationId(input.userId);
  const expiresAt = snapshotExpiryFromNow(24);
  const periods = buildMonthlyHistoryPeriods();
  const currentMonthStart = startOfUtcMonth(new Date());
  const existingSnapshotKeys =
    periods.length > 0
      ? await loadExistingMonthlyFinancialSnapshotKeys({
          userId: input.userId,
          fromDate: periods[0].fromDate,
        })
      : new Set<string>();
  let refreshed = 0;
  let failures = 0;
  const providerOutcomes = new Map<IntegrationProvider, ProviderRefreshOutcome>();

  for (const period of periods) {
    const jobs: Array<{ providerKey: "stripe" | "mercury"; run: () => Promise<unknown> }> = [];
    if (creds.stripeKey) {
      const providerKey = "stripe";
      const isCurrentMonth = period.fromDate.getTime() === currentMonthStart.getTime();
      if (isCurrentMonth || !existingSnapshotKeys.has(monthlySnapshotKey({ providerKey, fromDate: period.fromDate }))) {
        jobs.push({
          providerKey,
          run: () => fetchStripeData(creds.stripeKey!, period),
        });
      }
    }
    if (creds.mercuryKey) {
      const providerKey = "mercury";
      const isCurrentMonth = period.fromDate.getTime() === currentMonthStart.getTime();
      if (isCurrentMonth || !existingSnapshotKeys.has(monthlySnapshotKey({ providerKey, fromDate: period.fromDate }))) {
        jobs.push({
          providerKey,
          run: () => fetchMercuryData(creds.mercuryKey!, period),
        });
      }
    }

    for (const job of jobs) {
      const provider = providerForSnapshotKey(job.providerKey);
      try {
        const payload = await runRefreshJobWithRetry(job);
        assertRefreshPayloadComplete(job.providerKey, payload);
        const capturedAt = new Date();
        await persistImladrisRawSnapshot({
          userId: input.userId,
          organizationId,
          provider,
          providerKey: job.providerKey,
          payload,
          contextKey: MONTHLY_HISTORY_CONTEXT_KEY,
          rangePreset: MONTHLY_HISTORY_RANGE_PRESET,
          from: toDateKey(period.fromDate),
          to: toDateKey(period.toDate),
          fromDate: period.fromDate,
          toDate: period.toDate,
          mode: "historical",
          capturedAt,
        });
        await storeAnalyticsSnapshot({
          userId: input.userId,
          providerKey: job.providerKey,
          contextKey: MONTHLY_HISTORY_CONTEXT_KEY,
          rangePreset: MONTHLY_HISTORY_RANGE_PRESET,
          fromDate: period.fromDate,
          toDate: period.toDate,
          payload,
          expiresAt,
        });
        refreshed += 1;
        recordProviderOutcome(providerOutcomes, provider, { success: true });
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : "monthly refresh failed";
        await storeRefreshFailureSnapshot({
          userId: input.userId,
          providerKey: job.providerKey,
          contextKey: MONTHLY_HISTORY_CONTEXT_KEY,
          rangePreset: MONTHLY_HISTORY_RANGE_PRESET,
          fromDate: period.fromDate,
          toDate: period.toDate,
          error: message,
          expiresAt,
        });
        recordProviderOutcome(providerOutcomes, provider, { success: false, error: message });
      }
    }
  }

  return { refreshed, failures, providerOutcomes };
}

export async function runAnalyticsRefresh(input: {
  userIds?: string[];
  rangePresets?: RollingRangePreset[];
  includeRollingRanges?: boolean;
  includeMonthlyFinancialHistory?: boolean;
} = {}): Promise<{
  usersProcessed: number;
  refreshCount: number;
  failureCount: number;
  completedAt: string;
}> {
  const includeRollingRanges = input.includeRollingRanges ?? true;
  const rangePresets: RollingRangePreset[] = includeRollingRanges
    ? input.rangePresets && input.rangePresets.length > 0
      ? input.rangePresets
      : ["30d"]
    : [];

  const userIds = await resolveRefreshUserIds(input.userIds);

  let refreshCount = 0;
  let failureCount = 0;

  for (const userId of userIds) {
    const providerOutcomes = new Map<IntegrationProvider, ProviderRefreshOutcome>();

    for (const rangePreset of rangePresets) {
      const result = await refreshForUserAndRange({ userId, rangePreset });
      refreshCount += result.refreshed;
      failureCount += result.failures;

      for (const [provider, outcome] of result.providerOutcomes.entries()) {
        const existing = providerOutcomes.get(provider) ?? {
          succeeded: false,
          failed: false,
          lastError: null,
        };
        existing.succeeded = existing.succeeded || outcome.succeeded;
        existing.failed = existing.failed || outcome.failed;
        if (outcome.lastError) {
          existing.lastError = outcome.lastError;
        }
        providerOutcomes.set(provider, existing);
      }
    }

    if (input.includeMonthlyFinancialHistory) {
      const result = await refreshMonthlyFinancialHistoryForUser({ userId });
      refreshCount += result.refreshed;
      failureCount += result.failures;

      for (const [provider, outcome] of result.providerOutcomes.entries()) {
        const existing = providerOutcomes.get(provider) ?? {
          succeeded: false,
          failed: false,
          lastError: null,
        };
        existing.succeeded = existing.succeeded || outcome.succeeded;
        existing.failed = existing.failed || outcome.failed;
        if (outcome.lastError) {
          existing.lastError = outcome.lastError;
        }
        providerOutcomes.set(provider, existing);
      }
    }

    await persistProviderRefreshOutcomes({
      userId,
      outcomes: providerOutcomes,
      syncedAt: new Date(),
    });
  }

  return {
    usersProcessed: userIds.length,
    refreshCount,
    failureCount,
    completedAt: new Date().toISOString(),
  };
}
