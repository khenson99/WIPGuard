import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers", () => ({
  fetchHubSpotData: vi.fn(),
  fetchMercuryData: vi.fn(),
  fetchStripeData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ga-webflow", () => ({
  fetchGAData: vi.fn(),
  fetchWebflowData: vi.fn(),
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

vi.mock("@/lib/analytics/fetchers-semrush", () => ({
  fetchSemrushData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-pylon", () => ({
  fetchPylonData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-integrations", () => ({
  fetchIntegrationTelemetryData: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  readLatestSnapshot: vi.fn(),
  readLatestSuccessfulSnapshot: vi.fn(),
  storeAnalyticsSnapshot: vi.fn(),
  storeAnalyticsSnapshotFailure: vi.fn(),
  snapshotExpiryFromNow: vi.fn(() => new Date("2026-02-10T00:00:00.000Z")),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { count: vi.fn() },
    statusHistory: { findMany: vi.fn() },
    vi.mocked(prisma.stripeCustomerLink.findMany).mockResolvedValue([
      {
        id: "link-1",
        userId: "user-1",
        stripeCustomerId: "cus_123",
        hubspotDealId: "deal-1",
        hubspotDealName: "Acme Corp",
      },
    ] as never);
  });

  it("returns customer journey domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=customer-journey"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customerJourney).toBeTruthy();
    expect(body.customerJourney.journeys.length).toBeGreaterThan(0);
  });

  it("returns demo analytics domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=demo-analytics"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.demoAnalytics).toBeTruthy();
    expect(body.demoAnalytics.totalScheduled).toBeGreaterThan(0);
  });


  it("does not time out stripe at the default 8.5s budget", async () => {
    vi.useFakeTimers();

    try {
      const { fetchStripeData } = await import("@/lib/analytics/fetchers");
      vi.mocked(fetchStripeData).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(STRIPE_DATA as never), 9_000);
          }) as never
      );

      const { GET } = await import("@/app/api/analytics/route");
      const responsePromise = GET(
        new Request("http://localhost/api/analytics?section=finance-stripe")
      );

      await vi.advanceTimersByTimeAsync(9_000);

      const response = await responsePromise;
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.stripe).toBeTruthy();
      expect(
        body.errors.some((entry: { source: string }) => entry.source === "stripe")
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
