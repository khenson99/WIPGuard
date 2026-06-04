import { IntegrationProvider } from "@/generated/prisma/client";
import {
  evaluateProviderSyncHealth,
  providerForSnapshotKey,
  snapshotKeysForIntegrationProvider,
  snapshotsForProvider,
} from "@/lib/analytics/provider-health";

describe("provider health", () => {
  it("returns missing without connection or credentials", () => {
    const result = evaluateProviderSyncHealth({
      connected: false,
      hasCredential: false,
      snapshots: [],
    });

    expect(result.syncHealth).toBe("missing");
    expect(result.lastSnapshotStatus).toBeNull();
  });

  it("returns healthy for fresh success snapshot", () => {
    const now = new Date("2026-02-16T12:00:00.000Z");
    const result = evaluateProviderSyncHealth({
      connected: true,
      hasCredential: true,
      now,
      snapshots: [
        {
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt: "2026-02-16T11:59:00.000Z",
          expiresAt: "2026-02-16T13:00:00.000Z",
          lastError: null,
        },
      ],
    });

    expect(result.syncHealth).toBe("healthy");
    expect(result.syncHealthReason).toBeNull();
  });

  it("returns degraded when latest snapshot is stale", () => {
    const now = new Date("2026-02-16T12:00:00.000Z");
    const result = evaluateProviderSyncHealth({
      connected: true,
      hasCredential: true,
      now,
      snapshots: [
        {
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt: "2026-02-16T10:00:00.000Z",
          expiresAt: "2026-02-16T11:00:00.000Z",
          lastError: null,
        },
      ],
    });

    expect(result.syncHealth).toBe("degraded");
    expect(result.syncHealthReason).toContain("stale");
  });

  it("returns error when latest snapshot failed without fresh fallback", () => {
    const now = new Date("2026-02-16T12:00:00.000Z");
    const result = evaluateProviderSyncHealth({
      connected: true,
      hasCredential: true,
      now,
      snapshots: [
        {
          providerKey: "stripe",
          status: "ERROR",
          capturedAt: "2026-02-16T11:59:00.000Z",
          expiresAt: "2026-02-16T13:00:00.000Z",
          lastError: "Stripe 401",
        },
      ],
    });

    expect(result.syncHealth).toBe("error");
    expect(result.syncHealthReason).toContain("Stripe 401");
  });

  it("returns degraded when latest snapshot failed but has fresh success fallback", () => {
    const now = new Date("2026-02-16T12:00:00.000Z");
    const result = evaluateProviderSyncHealth({
      connected: true,
      hasCredential: true,
      now,
      snapshots: [
        {
          providerKey: "hubspot",
          status: "ERROR",
          capturedAt: "2026-02-16T11:59:00.000Z",
          expiresAt: "2026-02-16T13:00:00.000Z",
          lastError: "HubSpot timeout",
        },
        {
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt: "2026-02-16T11:30:00.000Z",
          expiresAt: "2026-02-16T13:30:00.000Z",
          lastError: null,
        },
      ],
    });

    expect(result.syncHealth).toBe("degraded");
    expect(result.syncHealthReason).toContain("HubSpot timeout");
  });

  it("maps integration providers to relevant snapshot keys", () => {
    expect(snapshotKeysForIntegrationProvider(IntegrationProvider.HUBSPOT)).toEqual([
      "hubspot",
      "hubspotOps",
      "hubspotops",
      "hubspot_ops",
      "hubspot-ops",
      "salesPerformance",
      "salesperformance",
      "sales_performance",
      "sales-performance",
    ]);
    expect(snapshotKeysForIntegrationProvider(IntegrationProvider.STRIPE)).toEqual([
      "stripe",
    ]);
    expect(snapshotKeysForIntegrationProvider(IntegrationProvider.WEBFLOW)).toEqual([
      "webflow",
    ]);
    expect(snapshotKeysForIntegrationProvider(IntegrationProvider.GOOGLE_ANALYTICS)).toEqual([
      "googleAnalytics",
      "googleanalytics",
      "google_analytics",
      "google-analytics",
    ]);
  });

  it("maps snapshot keys back to integration providers", () => {
    expect(providerForSnapshotKey("hubspotOps")).toBe(IntegrationProvider.HUBSPOT);
    expect(providerForSnapshotKey("sales-performance")).toBe(IntegrationProvider.HUBSPOT);
    expect(providerForSnapshotKey("stripe")).toBe(IntegrationProvider.STRIPE);
    expect(providerForSnapshotKey("webflow")).toBe(IntegrationProvider.WEBFLOW);
    expect(providerForSnapshotKey("unknown")).toBeNull();
  });

  it("matches delimiter-formatted stored snapshots to their integration provider", () => {
    const snapshots = snapshotsForProvider(IntegrationProvider.GOOGLE_ANALYTICS, [
      {
        providerKey: "google_analytics",
        status: "SUCCESS",
        capturedAt: "2026-02-16T11:59:00.000Z",
        expiresAt: "2026-02-16T13:00:00.000Z",
        lastError: null,
      },
      {
        providerKey: "google-ads",
        status: "SUCCESS",
        capturedAt: "2026-02-16T11:59:00.000Z",
        expiresAt: "2026-02-16T13:00:00.000Z",
        lastError: null,
      },
    ]);

    expect(snapshots).toEqual([
      expect.objectContaining({ providerKey: "google_analytics" }),
    ]);
  });
});
