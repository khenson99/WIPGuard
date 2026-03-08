import { beforeEach, describe, expect, it } from "vitest";
import type { AnalyticsDashboardData, ProviderFreshness } from "@/lib/analytics/types";
import { populateConnectionStatus, useConnectionStatus } from "../use-connection-status";

describe("use-connection-status", () => {
  beforeEach(() => {
    useConnectionStatus.getState().setEntries([]);
  });

  it("downgrades provider freshness when the dashboard payload is missing", () => {
    const freshness: Record<string, ProviderFreshness> = {
      reddit: {
        provider: "reddit",
        source: "connection",
        status: "CONNECTED",
        connectedAt: "2026-03-01T00:00:00.000Z",
        lastSyncedAt: "2026-03-03T00:00:00.000Z",
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
    };

    const dashboard = {
      redditAds: null,
      staleDomains: [],
      freshness: {},
    } as unknown as AnalyticsDashboardData;

    populateConnectionStatus(freshness as unknown as AnalyticsDashboardData["freshness"], dashboard);
    expect(useConnectionStatus.getState().getStatus("redditAds")).toBe("disconnected");
  });
});

