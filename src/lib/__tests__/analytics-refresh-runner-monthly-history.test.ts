import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";
import { fetchMercuryData, fetchStripeData } from "@/lib/analytics/fetchers";
import { getCredentials } from "@/lib/analytics/credentials";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";
import { storeAnalyticsSnapshot } from "@/lib/analytics/snapshots";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/request-context";

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(),
    },
    analyticsSnapshot: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    task: {
      count: vi.fn(),
    },
    statusHistory: {
      findMany: vi.fn(),
    },
  },
}));

describe("analytics monthly financial history refresh", () => {
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
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    vi.mocked(prisma.task.count).mockResolvedValue(0);
    vi.mocked(prisma.statusHistory.findMany).mockResolvedValue([]);
    vi.mocked(storeAnalyticsSnapshot).mockResolvedValue(undefined);
  });

  afterEach(() => {
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
    vi.mocked(prisma.task.count).mockImplementation(async () => {
      if (getRequestContext()?.organizationId !== "org-1") {
        throw new Error("Missing tenant context");
      }
      return 0 as never;
    });

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
});
