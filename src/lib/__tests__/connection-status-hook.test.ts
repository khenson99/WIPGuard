import { beforeEach, describe, expect, it } from "vitest";
import {
  mapFreshnessToStatus,
  populateConnectionStatus,
  useConnectionStatus,
} from "@/hooks/use-connection-status";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

describe("mapFreshnessToStatus", () => {
  beforeEach(() => {
    useConnectionStatus.getState().setEntries([]);
  });

  it("returns connected for CONNECTED non-stale provider", () => {
    expect(
      mapFreshnessToStatus({ status: "CONNECTED", stale: false })
    ).toBe("connected");
  });

  it("returns stale for CONNECTED but stale provider", () => {
    expect(
      mapFreshnessToStatus({ status: "CONNECTED", stale: true })
    ).toBe("stale");
  });

  it("returns disconnected for DISCONNECTED", () => {
    expect(
      mapFreshnessToStatus({ status: "DISCONNECTED", stale: false })
    ).toBe("disconnected");
  });

  it("returns disconnected for null status", () => {
    expect(
      mapFreshnessToStatus({ status: null, stale: false })
    ).toBe("disconnected");
  });

  it("hydrates status from dashboard payload presence/staleness", () => {
    const dashboard = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });
    dashboard.googleAnalytics = { _meta: { source: "live" } } as unknown as typeof dashboard.googleAnalytics;
    dashboard.staleDomains = ["googleAnalytics"];

    populateConnectionStatus({}, dashboard);

    expect(useConnectionStatus.getState().getStatus("googleAnalytics")).toBe("stale");
    expect(useConnectionStatus.getState().getStatus("webflow")).toBe("disconnected");
  });

  it("uses provider freshness for mapped connection-backed domains", () => {
    populateConnectionStatus({
      hubspot: {
        provider: "hubspot",
        source: "connection",
        status: "CONNECTED",
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
    });

    expect(useConnectionStatus.getState().getStatus("hubspot")).toBe("connected");
  });

  it("does not override disconnected provider status from dashboard payload", () => {
    const dashboard = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });
    dashboard.hubspot = { _meta: { source: "live" } } as unknown as typeof dashboard.hubspot;

    populateConnectionStatus(
      {
        hubspot: {
          provider: "hubspot",
          source: "connection",
          status: "DISCONNECTED",
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
          stale: false,
          lastSnapshotAt: null,
        },
      },
      dashboard,
    );

    expect(useConnectionStatus.getState().getStatus("hubspot")).toBe("disconnected");
  });

  it("handles legacy dashboards without staleDomains", () => {
    const dashboard = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });
    dashboard.googleAnalytics = { _meta: { source: "live" } } as unknown as typeof dashboard.googleAnalytics;
    delete (dashboard as { staleDomains?: string[] }).staleDomains;

    expect(() => populateConnectionStatus({}, dashboard)).not.toThrow();
    expect(useConnectionStatus.getState().getStatus("googleAnalytics")).toBe("connected");
  });
});
