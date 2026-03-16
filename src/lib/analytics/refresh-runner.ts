import { IntegrationProvider } from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
import { normalizeMercuryExpenseMappings } from "@/lib/analytics/mercury-expense-mappings";
import {
  fetchHubSpotData,
  fetchMercuryData,
  fetchStripeData,
} from "@/lib/analytics/fetchers";
import { fetchGoogleAdsData, fetchMetaAdsData, fetchMetaPageData, fetchRedditAdsData } from "@/lib/analytics/fetchers-ads";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import { providerForSnapshotKey } from "@/lib/analytics/provider-health";
import { snapshotExpiryFromNow, storeAnalyticsSnapshot, storeAnalyticsSnapshotFailure } from "@/lib/analytics/snapshots";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { MERCURY_CASHFLOW_SYNC_RULE_KEY } from "@/lib/integrations/provider-metrics-sync";
import { prisma } from "@/lib/prisma";

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

async function computeProductSnapshot(userId: string, fromDate: Date, toDate: Date) {
  const [createdTasksInRange, completedTasksInRange, overdueOpenTasks, contributors] = await Promise.all([
    prisma.task.count({ where: { createdAt: { gte: fromDate, lte: toDate } } }),
    prisma.task.count({ where: { completedOn: { gte: fromDate, lte: toDate } } }),
    prisma.task.count({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: toDate },
      },
    }),
    prisma.statusHistory.findMany({
      where: {
        changedAt: { gte: fromDate, lte: toDate },
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
      nextRefresh: snapshotExpiryFromNow(1).toISOString(),
      source: "live" as const,
    },
  };
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

async function refreshForUserAndRange(input: {
  userId: string;
  rangePreset: "7d" | "30d" | "90d";
}): Promise<{ refreshed: number; failures: number; providerOutcomes: Map<IntegrationProvider, ProviderRefreshOutcome> }> {
  const params = new URLSearchParams();
  params.set("range", input.rangePreset);
  const range = parseAnalyticsTimeRange(params);
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  const creds = await getCredentials(input.userId);
  const expiresAt = snapshotExpiryFromNow(1);

  const jobs: Array<{ providerKey: string; run: () => Promise<unknown> }> = [];

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
  if (creds.metaAccessToken && creds.metaAdAccountId) {
    jobs.push({
      providerKey: "metaAds",
      run: () => fetchMetaAdsData(creds.metaAccessToken!, creds.metaAdAccountId!, { fromDate, toDate }),
    });
  }
  if (creds.metaAccessToken && creds.metaPageId) {
    jobs.push({
      providerKey: "metaPage",
      run: () => fetchMetaPageData(creds.metaAccessToken!, creds.metaPageId!, { fromDate, toDate }),
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
    jobs.push({ providerKey: "webflow", run: () => fetchWebflowData(creds.webflowApiToken!, creds.webflowSiteId!) });
  }
  if (creds.codaApiToken && creds.codaDocId) {
    jobs.push({
      providerKey: "coda",
      run: () => fetchCodaData(creds.codaApiToken!, creds.codaDocId!, { fromDate, toDate }),
    });
  }
  if (creds.semrushApiToken && creds.semrushDomain) {
    jobs.push({
      providerKey: "semrush",
      run: () => fetchSemrushData(creds.semrushApiToken!, creds.semrushDomain!),
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

  jobs.push({ providerKey: "product", run: () => computeProductSnapshot(input.userId, fromDate, toDate) });

  jobs.push({
    providerKey: "googleWorkspace",
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
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.HUBSPOT,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "slack",
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "codaOps",
    run: () =>
      fetchIntegrationTelemetryData({
        userId: input.userId,
        provider: IntegrationProvider.CODA,
        from: fromDate,
        to: toDate,
      }),
  });
  jobs.push({
    providerKey: "redditOps",
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
      const payload = await timeout(job.run(), timeoutMsForRefreshJob(job.providerKey));
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
      refreshed += 1;
      recordProviderOutcome(providerOutcomes, provider, { success: true });
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : "refresh failed";
      await storeAnalyticsSnapshotFailure({
        userId: input.userId,
        providerKey: job.providerKey,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
        error: message,
        expiresAt,
      });
      recordProviderOutcome(providerOutcomes, provider, { success: false, error: message });
    }
  }

  return { refreshed, failures, providerOutcomes };
}

export async function runAnalyticsRefresh(input: {
  userIds?: string[];
  rangePresets?: Array<"7d" | "30d" | "90d">;
} = {}): Promise<{
  usersProcessed: number;
  refreshCount: number;
  failureCount: number;
  completedAt: string;
}> {
  const rangePresets: Array<"7d" | "30d" | "90d"> =
    input.rangePresets && input.rangePresets.length > 0 ? input.rangePresets : ["30d"];

  const userIds =
    input.userIds && input.userIds.length > 0
      ? input.userIds
      : (
          await prisma.integrationConnection.findMany({
            distinct: ["userId"],
            select: { userId: true },
          })
        ).map((entry) => entry.userId);

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

    // Analytics refresh failures are surfaced via AnalyticsSnapshot status/error.
    // Avoid overwriting connection-level state (status/lastError/lastSyncedAt),
    // which is reserved for credential/auth health and rule execution.
    void providerOutcomes;
  }

  return {
    usersProcessed: userIds.length,
    refreshCount,
    failureCount,
    completedAt: new Date().toISOString(),
  };
}
