import { IntegrationProvider } from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
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
import { snapshotExpiryFromNow, storeAnalyticsSnapshot, storeAnalyticsSnapshotFailure } from "@/lib/analytics/snapshots";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
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

async function refreshForUserAndRange(input: {
  userId: string;
  rangePreset: "7d" | "30d" | "90d";
}): Promise<{ refreshed: number; failures: number }> {
  const params = new URLSearchParams();
  params.set("range", input.rangePreset);
  const range = parseAnalyticsTimeRange(params);
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  const creds = await getCredentials(input.userId);
  const expiresAt = snapshotExpiryFromNow(1);

  const jobs: Array<{ providerKey: string; run: () => Promise<unknown> }> = [];

  if (creds.hubspotToken) {
    jobs.push({ providerKey: "hubspot", run: () => fetchHubSpotData(creds.hubspotToken!) });
  }
  if (creds.stripeKey) {
    jobs.push({ providerKey: "stripe", run: () => fetchStripeData(creds.stripeKey!) });
  }
  if (creds.mercuryKey) {
    jobs.push({ providerKey: "mercury", run: () => fetchMercuryData(creds.mercuryKey!) });
  }
  if (creds.gaPropertyId && creds.gaClientEmail && creds.gaPrivateKey) {
    jobs.push({
      providerKey: "googleAnalytics",
      run: () => fetchGAData(creds.gaPropertyId!, creds.gaClientEmail!, creds.gaPrivateKey!),
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
          creds.googleAdsClientSecret!
        ),
    });
  }
  if (creds.metaAccessToken && creds.metaAdAccountId) {
    jobs.push({ providerKey: "metaAds", run: () => fetchMetaAdsData(creds.metaAccessToken!, creds.metaAdAccountId!) });
  }
  if (creds.metaAccessToken && creds.metaPageId) {
    jobs.push({ providerKey: "metaPage", run: () => fetchMetaPageData(creds.metaAccessToken!, creds.metaPageId!) });
  }
  if (creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId) {
    jobs.push({
      providerKey: "redditAds",
      run: () =>
        fetchRedditAdsData(
          creds.redditClientId!,
          creds.redditClientSecret!,
          creds.redditRefreshToken!,
          creds.redditAdAccountId!
        ),
    });
  }
  if (creds.webflowApiToken && creds.webflowSiteId) {
    jobs.push({ providerKey: "webflow", run: () => fetchWebflowData(creds.webflowApiToken!, creds.webflowSiteId!) });
  }
  if (creds.codaApiToken && creds.codaDocId) {
    jobs.push({ providerKey: "coda", run: () => fetchCodaData(creds.codaApiToken!, creds.codaDocId!) });
  }
  if (creds.semrushApiToken) {
    jobs.push({ providerKey: "semrush", run: () => fetchSemrushData(creds.semrushApiToken!) });
  }
  if (creds.pylonApiKey) {
    jobs.push({ providerKey: "pylon", run: () => fetchPylonData({ apiKey: creds.pylonApiKey!, from: range.from, to: range.to }) });
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

  for (const job of jobs) {
    try {
      const payload = await timeout(job.run(), 10_000);
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
    } catch (error) {
      failures += 1;
      await storeAnalyticsSnapshotFailure({
        userId: input.userId,
        providerKey: job.providerKey,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
        error: error instanceof Error ? error.message : "refresh failed",
        expiresAt,
      });
    }
  }

  return { refreshed, failures };
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
    for (const rangePreset of rangePresets) {
      const result = await refreshForUserAndRange({ userId, rangePreset });
      refreshCount += result.refreshed;
      failureCount += result.failures;
    }

    await prisma.integrationConnection.updateMany({
      where: { userId },
      data: { lastSyncedAt: new Date() },
    });
  }

  return {
    usersProcessed: userIds.length,
    refreshCount,
    failureCount,
    completedAt: new Date().toISOString(),
  };
}
