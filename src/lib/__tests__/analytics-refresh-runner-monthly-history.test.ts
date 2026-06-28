import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  runAnalyticsRefresh,
  shouldPersistImladrisRawSnapshot,
} from "@/lib/analytics/refresh-runner";
import { fetchMercuryData, fetchStripeData } from "@/lib/analytics/fetchers";
import { getCredentials } from "@/lib/analytics/credentials";
import { fetchMetaInstagramData } from "@/lib/analytics/fetchers-ads";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchGoogleSearchConsoleData } from "@/lib/analytics/fetchers-google-search-console";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";
import { storeAnalyticsSnapshot, storeAnalyticsSnapshotFailure } from "@/lib/analytics/snapshots";
import { ingestImladrisRawRecords } from "@/lib/imladris/ingestion";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/request-context";
import { buildImladrisMetrics } from "@/lib/imladris/service";

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers", () => ({
  fetchHubSpotData: vi.fn(),
  fetchMercuryData: vi.fn(),
  fetchStripeData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ads", () => ({
  fetchGoogleAdsData: vi.fn(),
  fetchMetaAdsData: vi.fn(),
  fetchMetaInstagramData: vi.fn(),
  fetchMetaPageData: vi.fn(),
  fetchRedditAdsData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-coda", () => ({
  fetchCodaData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ga-webflow", () => ({
  fetchGAData: vi.fn(),
  fetchWebflowData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-google-search-console", () => ({
  fetchGoogleSearchConsoleData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-integrations", () => ({
  fetchIntegrationTelemetryData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-pylon", () => ({
  fetchPylonData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-semrush", () => ({
  fetchSemrushData: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  snapshotExpiryFromNow: vi.fn(() => new Date("2025-03-15T13:00:00.000Z")),
  storeAnalyticsSnapshot: vi.fn(),
  storeAnalyticsSnapshotFailure: vi.fn(),
}));

vi.mock("@/lib/imladris/ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imladris/ingestion")>();
  return {
    ...actual,
    ingestImladrisRawRecords: vi.fn(),
  };
});

vi.mock("@/lib/imladris/service", () => ({
  buildImladrisMetrics: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    integrationRule: {
      findUnique: vi.fn(),
    },
    analyticsSnapshot: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    imladrisSourceSyncRun: {
      findMany: vi.fn(),
    },
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(),
    },
  },
}));

describe("analytics monthly financial history refresh", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15T12:00:00.000Z"));
    vi.mocked(getCredentials).mockResolvedValue({
      stripeKey: "stripe-key",
      mercuryKey: "mercury-key",
    } as never);
    vi.mocked(fetchStripeData).mockResolvedValue({ provider: "stripe" } as never);
    vi.mocked(fetchMercuryData).mockResolvedValue({ provider: "mercury" } as never);
    vi.mocked(fetchIntegrationTelemetryData).mockResolvedValue({ provider: "telemetry" } as never);
    vi.mocked(buildImladrisMetrics).mockResolvedValue([
      {
        key: "development.delivery_health",
        value: {
          completedLinearIssues: 3,
          mergedPullRequests: 4,
          productEvents: 12,
          averageLinearCycleTimeDays: 6,
        },
      },
    ] as never);
    vi.mocked(prisma.integrationRule.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    vi.mocked(prisma.imladrisSourceSyncRun.findMany).mockResolvedValue([]);
    vi.mocked(prisma.imladrisCanonicalMetricValue.findMany).mockResolvedValue([]);
    vi.mocked(storeAnalyticsSnapshot).mockResolvedValue(undefined);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync-1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("pulls and stores one finance snapshot per month starting January 2025", async () => {
    await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: [],
      includeRollingRanges: false,
      includeMonthlyFinancialHistory: true,
    });

    expect(fetchStripeData).toHaveBeenCalledTimes(3);
    expect(fetchMercuryData).toHaveBeenCalledTimes(3);
    expect(fetchStripeData).toHaveBeenNthCalledWith(1, "stripe-key", {
      fromDate: new Date("2025-01-01T00:00:00.000Z"),
      toDate: new Date("2025-01-31T23:59:59.999Z"),
    });
    expect(fetchStripeData).toHaveBeenNthCalledWith(2, "stripe-key", {
      fromDate: new Date("2025-02-01T00:00:00.000Z"),
      toDate: new Date("2025-02-28T23:59:59.999Z"),
    });
    expect(fetchStripeData).toHaveBeenNthCalledWith(3, "stripe-key", {
      fromDate: new Date("2025-03-01T00:00:00.000Z"),
      toDate: new Date("2025-03-31T23:59:59.999Z"),
    });

    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "stripe",
        contextKey: "financial-planning",
        rangePreset: "monthly",
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
      }),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "mercury",
        contextKey: "financial-planning",
        rangePreset: "monthly",
        fromDate: new Date("2025-03-01T00:00:00.000Z"),
        toDate: new Date("2025-03-31T23:59:59.999Z"),
      }),
    );
  });

  it("skips already-stored closed months and refreshes the current month", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "stripe",
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        providerKey: "mercury",
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        providerKey: "stripe",
        fromDate: new Date("2025-02-01T00:00:00.000Z"),
      },
      {
        providerKey: "mercury",
        fromDate: new Date("2025-02-01T00:00:00.000Z"),
      },
      {
        providerKey: "stripe",
        fromDate: new Date("2025-03-01T00:00:00.000Z"),
      },
      {
        providerKey: "mercury",
        fromDate: new Date("2025-03-01T00:00:00.000Z"),
      },
    ] as never);

    await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: [],
      includeRollingRanges: false,
      includeMonthlyFinancialHistory: true,
    });

    expect(fetchStripeData).toHaveBeenCalledOnce();
    expect(fetchMercuryData).toHaveBeenCalledOnce();
    expect(fetchStripeData).toHaveBeenCalledWith("stripe-key", {
      fromDate: new Date("2025-03-01T00:00:00.000Z"),
      toDate: new Date("2025-03-31T23:59:59.999Z"),
    });
    expect(fetchMercuryData).toHaveBeenCalledWith("mercury-key", {
      fromDate: new Date("2025-03-01T00:00:00.000Z"),
      toDate: new Date("2025-03-31T23:59:59.999Z"),
    });
  });

  it("marks successful rolling provider refreshes as fresh connection syncs", async () => {
    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: IntegrationProvider.STRIPE,
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
    });
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: IntegrationProvider.MERCURY,
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
    });
  });

  it("creates missing connection rows when provider refresh state has no existing row", async () => {
    vi.mocked(prisma.integrationConnection.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user-1",
          provider: IntegrationProvider.STRIPE,
        },
      },
      update: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
      create: {
        userId: "user-1",
        provider: IntegrationProvider.STRIPE,
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
    });
  });

  it("does not mark telemetry-only snapshots as fresh external connection syncs", async () => {
    await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(prisma.integrationConnection.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: IntegrationProvider.HUBSPOT,
        }),
      }),
    );
    expect(prisma.integrationConnection.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: IntegrationProvider.SLACK,
        }),
      }),
    );
    expect(prisma.integrationConnection.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
        }),
      }),
    );
  });

  it("marks failed rolling provider refreshes as integration connection errors", async () => {
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe auth token revoked"),
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(1);
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: IntegrationProvider.STRIPE,
      },
      data: {
        status: "ERROR",
        lastError: "Stripe auth token revoked",
      },
    });
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: IntegrationProvider.MERCURY,
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
    });
  });

  it("creates missing connection rows when provider refresh failure has no existing row", async () => {
    vi.mocked(prisma.integrationConnection.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe auth token revoked"),
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(1);
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user-1",
          provider: IntegrationProvider.STRIPE,
        },
      },
      update: {
        status: "ERROR",
        lastError: "Stripe auth token revoked",
      },
      create: {
        userId: "user-1",
        provider: IntegrationProvider.STRIPE,
        status: "ERROR",
        lastError: "Stripe auth token revoked",
      },
    });
  });

  it("preserves degradation details when a provider has both failed and successful refreshes", async () => {
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe January export failed"),
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: [],
      includeRollingRanges: false,
      includeMonthlyFinancialHistory: true,
    });

    expect(result.failureCount).toBe(1);
    expect(fetchStripeData).toHaveBeenCalledTimes(3);
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: IntegrationProvider.STRIPE,
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: "Stripe January export failed",
      },
    });
  });

  it("keeps empty rangePresets compatible with the default rolling refresh", async () => {
    vi.mocked(getCredentials).mockResolvedValue({} as never);

    await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: [],
    });

    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "product",
        contextKey: "default",
        rangePreset: "30d",
      }),
    );
  });

  it("runs rolling product snapshots inside the user's organization context", async () => {
    vi.mocked(getCredentials).mockResolvedValue({} as never);
    vi.mocked(buildImladrisMetrics).mockImplementation((async () => {
      if (getRequestContext()?.organizationId !== "org-1") {
        throw new Error("Missing tenant context");
      }
      return [
        {
          key: "development.delivery_health",
          value: {
            completedLinearIssues: 1,
            mergedPullRequests: 1,
            productEvents: 1,
            averageLinearCycleTimeDays: 3,
          },
        },
      ] as never;
    }) as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { organizationId: true },
    });
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "product",
        contextKey: "default",
        rangePreset: "7d",
      }),
    );
  });

  it("stores rolling provider snapshots in the Imladris raw layer", async () => {
    await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user-1",
        organizationId: "org-1",
      },
      mode: "incremental",
      windowStart: expect.any(Date),
      windowEnd: expect.any(Date),
      checkpoint: expect.objectContaining({
        providerKey: "stripe",
        contextKey: "default",
        rangePreset: "7d",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
          externalId: "stripe:snapshot:2025-03-09:2025-03-15",
          payload: expect.objectContaining({
            snapshotKey: "stripe",
            provider: IntegrationProvider.STRIPE,
          }),
        }),
      ]),
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.MERCURY,
      checkpoint: expect.objectContaining({
        providerKey: "mercury",
      }),
    }));
  });

  it("accepts registry snapshot-key variants for Imladris raw persistence", () => {
    expect(shouldPersistImladrisRawSnapshot("google_analytics")).toBe(true);
    expect(shouldPersistImladrisRawSnapshot("google-search-console")).toBe(true);
    expect(shouldPersistImladrisRawSnapshot("google_ads")).toBe(true);
    expect(shouldPersistImladrisRawSnapshot("unknownProvider")).toBe(false);
  });

  it("retries transient rolling provider fetch failures before recording a snapshot failure", async () => {
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe 503 temporarily unavailable"),
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(fetchStripeData).toHaveBeenCalledTimes(2);
    expect(result.failureCount).toBe(0);
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "stripe",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(storeAnalyticsSnapshotFailure).not.toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "stripe",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.STRIPE,
      checkpoint: expect.objectContaining({
        providerKey: "stripe",
      }),
    }));
  });

  it("records a refresh failure when Imladris raw ingestion only partially accepts provider records", async () => {
    vi.mocked(ingestImladrisRawRecords).mockResolvedValueOnce({
      syncRunId: "sync-partial",
      status: "PARTIAL",
      recordCount: 4,
      acceptedCount: 2,
      errorCount: 2,
    });

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(1);
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "stripe",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "stripe",
        contextKey: "default",
        rangePreset: "7d",
        error: "Imladris raw ingestion partially succeeded for stripe: 2/4 records accepted.",
      }),
    );
  });

  it("passes the rolling date window to scheduled Webflow refreshes", async () => {
    vi.mocked(getCredentials).mockResolvedValue({
      webflowApiToken: "webflow-token",
      webflowSiteId: "site_1",
    } as never);
    vi.mocked(fetchWebflowData).mockResolvedValue({ provider: "webflow" } as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(fetchWebflowData).toHaveBeenCalledWith(
      "webflow-token",
      "site_1",
      new Date("2025-03-09T00:00:00.000Z"),
      new Date("2025-03-15T23:59:59.999Z"),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "webflow",
      contextKey: "default",
      rangePreset: "7d",
      fromDate: new Date("2025-03-09T00:00:00.000Z"),
      toDate: new Date("2025-03-15T23:59:59.999Z"),
    }));
  });

  it("pulls scheduled Coda snapshots into analytics and Imladris raw storage", async () => {
    vi.mocked(getCredentials).mockResolvedValue({
      codaApiToken: "coda-token",
      codaDocId: "doc_1",
    } as never);
    vi.mocked(fetchCodaData).mockResolvedValue({ provider: "coda" } as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(fetchCodaData).toHaveBeenCalledWith("coda-token", "doc_1", {
      fromDate: new Date("2025-03-09T00:00:00.000Z"),
      toDate: new Date("2025-03-15T23:59:59.999Z"),
    });
    expect(fetchIntegrationTelemetryData).toHaveBeenCalledWith({
      userId: "user-1",
      provider: IntegrationProvider.CODA,
      from: new Date("2025-03-09T00:00:00.000Z"),
      to: new Date("2025-03-15T23:59:59.999Z"),
    });
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "coda",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "codaOps",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.CODA,
      checkpoint: expect.objectContaining({
        providerKey: "coda",
        contextKey: "default",
        rangePreset: "7d",
      }),
    }));
  });

  it("pulls scheduled Google Search Console snapshots into analytics and Imladris raw storage", async () => {
    vi.mocked(getCredentials).mockResolvedValue({
      searchConsoleAccessToken: "gsc-token",
      searchConsoleSiteUrl: "https://example.com/",
    } as never);
    vi.mocked(fetchGoogleSearchConsoleData).mockResolvedValue({
      provider: "googleSearchConsole",
    } as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(fetchGoogleSearchConsoleData).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: new Date("2025-03-09T00:00:00.000Z"),
      toDate: new Date("2025-03-15T23:59:59.999Z"),
    }));
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "googleSearchConsole",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      checkpoint: expect.objectContaining({
        providerKey: "googleSearchConsole",
        contextKey: "default",
        rangePreset: "7d",
      }),
    }));
  });

  it("refuses to store rolling provider snapshots when the fetched payload is truncated", async () => {
    vi.mocked(fetchStripeData).mockResolvedValueOnce({
      provider: "stripe",
      _meta: {
        fetchedAt: "2025-03-15T12:00:00.000Z",
        source: "live",
        truncated: true,
        truncatedResources: ["chargesInRange"],
      },
    } as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(1);
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "stripe",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(ingestImladrisRawRecords).not.toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.STRIPE,
      checkpoint: expect.objectContaining({
        providerKey: "stripe",
      }),
    }));
    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "stripe",
        contextKey: "default",
        rangePreset: "7d",
        error:
          "Provider payload for stripe is truncated; refusing to persist partial analytics refresh data",
      }),
    );
  });

  it("keeps rolling refresh running when failed-snapshot persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe auth token revoked"),
    );
    vi.mocked(storeAnalyticsSnapshotFailure).mockRejectedValueOnce(
      new Error("snapshot write failed"),
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(1);
    expect(result.refreshCount).toBeGreaterThan(0);
    expect(consoleError).toHaveBeenCalledWith(
      "analytics_refresh.failure_snapshot_failed",
      expect.objectContaining({
        providerKey: "stripe",
        contextKey: "default",
        rangePreset: "7d",
        originalError: "Stripe auth token revoked",
        failureSnapshotError: "snapshot write failed",
      }),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "mercury",
      contextKey: "default",
      rangePreset: "7d",
    }));
    consoleError.mockRestore();
  });

  it("keeps monthly history refresh running when failed-snapshot persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe monthly export failed"),
    );
    vi.mocked(storeAnalyticsSnapshotFailure).mockRejectedValueOnce(
      new Error("snapshot write failed"),
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: [],
      includeRollingRanges: false,
      includeMonthlyFinancialHistory: true,
    });

    expect(result.failureCount).toBe(1);
    expect(fetchStripeData).toHaveBeenCalledTimes(3);
    expect(fetchMercuryData).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledWith(
      "analytics_refresh.failure_snapshot_failed",
      expect.objectContaining({
        providerKey: "stripe",
        contextKey: "financial-planning",
        rangePreset: "monthly",
        originalError: "Stripe monthly export failed",
        failureSnapshotError: "snapshot write failed",
      }),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "mercury",
      contextKey: "financial-planning",
      rangePreset: "monthly",
    }));
    consoleError.mockRestore();
  });

  it("does not store a monthly financial snapshot when raw ingestion partially accepts its records", async () => {
    vi.mocked(ingestImladrisRawRecords).mockResolvedValueOnce({
      syncRunId: "sync-monthly-partial",
      status: "PARTIAL",
      recordCount: 5,
      acceptedCount: 4,
      errorCount: 1,
    });

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: [],
      includeRollingRanges: false,
      includeMonthlyFinancialHistory: true,
    });

    expect(result.failureCount).toBe(1);
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "stripe",
      contextKey: "financial-planning",
      rangePreset: "monthly",
      fromDate: new Date("2025-01-01T00:00:00.000Z"),
    }));
    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: "stripe",
        contextKey: "financial-planning",
        rangePreset: "monthly",
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        error: "Imladris raw ingestion partially succeeded for stripe: 4/5 records accepted.",
      }),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "mercury",
      contextKey: "financial-planning",
      rangePreset: "monthly",
      fromDate: new Date("2025-01-01T00:00:00.000Z"),
    }));
  });

  it("pulls configured PostHog, Linear, and GitHub source records into snapshots and raw ingestion", async () => {
    vi.mocked(getCredentials).mockResolvedValue({
      posthogApiKey: "phx_test",
      posthogProjectId: "12345",
      posthogHost: "https://us.posthog.com",
      linearApiKey: "lin_test",
      githubToken: "ghp_test",
      githubOwner: "example",
      githubRepo: "imladris",
    } as never);
    const fetchMock = vi.fn(async (url: string | URL | Request, req?: RequestInit) => {
      const href = String(url);
      if (href.includes("posthog.com")) {
        const body = typeof req?.body === "string" ? req.body : "";
        if (body.includes("GROUP BY event")) {
          return new Response(JSON.stringify({
            columns: ["event", "count"],
            results: [["activation_completed", 1]],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          columns: ["uuid", "event", "timestamp", "distinct_id"],
          results: [["evt_1", "activation_completed", "2025-03-14 10:00:00", "acct_1"]],
        }), { status: 200 });
      }
      if (href.includes("linear.app")) {
        return new Response(JSON.stringify({
          data: {
            issues: {
              nodes: [
                {
                  id: "lin_1",
                  identifier: "IML-1",
                  title: "Ship source sync",
                  createdAt: "2025-03-10T00:00:00.000Z",
                  completedAt: "2025-03-14T00:00:00.000Z",
                  state: { name: "Done", type: "completed" },
                },
              ],
            },
          },
        }), { status: 200 });
      }
      if (href.includes("api.github.com")) {
        return new Response(JSON.stringify({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              id: 1001,
              number: 42,
              title: "Merge source sync",
              state: "closed",
              created_at: "2025-03-12T00:00:00.000Z",
              updated_at: "2025-03-14T00:00:00.000Z",
              pull_request: {
                merged_at: "2025-03-14T00:00:00.000Z",
              },
            },
          ],
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    global.fetch = fetchMock as never;

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/12345/query/"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer phx_test",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.linear.app/graphql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "lin_test",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/search/issues"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test",
        }),
      }),
    );
    expect(
      new URL(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/search/issues"))?.[0])).searchParams.get("q"),
    ).toBe("repo:example/imladris is:pr updated:2025-03-09..2025-03-15");
    for (const providerKey of ["posthog", "linear", "github"]) {
      expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-1",
        providerKey,
        contextKey: "default",
        rangePreset: "7d",
      }));
      expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
        provider:
          providerKey === "posthog"
            ? IntegrationProvider.POSTHOG
            : providerKey === "linear"
              ? IntegrationProvider.LINEAR
              : IntegrationProvider.GITHUB,
        checkpoint: expect.objectContaining({ providerKey }),
      }));
    }
  });

  it("refreshes Instagram snapshots when only Meta Instagram credentials are configured", async () => {
    vi.mocked(getCredentials).mockResolvedValue({
      metaPageAccessToken: "meta-page-token",
      metaPageId: null,
      metaInstagramAccountId: "ig_123",
    } as never);
    vi.mocked(fetchMetaInstagramData).mockResolvedValue({
      followers: 42,
      media: [],
      _meta: { fetchedAt: "2025-03-15T12:00:00.000Z" },
    } as never);

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(fetchMetaInstagramData).toHaveBeenCalledWith(
      "meta-page-token",
      "ig_123",
      { pageId: undefined },
      new Date("2025-03-09T00:00:00.000Z"),
      new Date("2025-03-15T23:59:59.999Z"),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      providerKey: "instagram",
      contextKey: "default",
      rangePreset: "7d",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.META_PAGE,
      checkpoint: expect.objectContaining({ providerKey: "instagram" }),
    }));
  });

  it("stores SEMrush exhausted API unit errors without counting cron failure", async () => {
    vi.mocked(getCredentials).mockResolvedValue({
      semrushApiToken: "semrush-token",
      semrushDomain: "example.com",
    } as never);
    vi.mocked(fetchSemrushData).mockRejectedValue(
      new Error("SEMrush API error (403): ERROR 403 :: ERROR 132 :: API UNITS BALANCE IS ZERO\n")
    );

    const result = await runAnalyticsRefresh({
      userIds: ["user-1"],
      rangePresets: ["7d"],
      includeMonthlyFinancialHistory: false,
    });

    expect(result.failureCount).toBe(0);
    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerKey: "semrush",
        contextKey: "default",
        rangePreset: "7d",
        error: "SEMrush API error (403): ERROR 403 :: ERROR 132 :: API UNITS BALANCE IS ZERO\n",
      }),
    );
  });
});
