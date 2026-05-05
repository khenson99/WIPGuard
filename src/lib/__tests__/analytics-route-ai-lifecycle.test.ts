import { describe, expect, it } from "vitest";
import { createEmptyAiInsightsBundle, createEmptyAnalyticsDashboardData, patchFreshnessWithStale } from "@/lib/analytics/response-shape";

describe("analytics API response shape helpers", () => {
  it("creates backward-compatible analytics payload with lifecycle + AI sections", () => {
    const payload = createEmptyAnalyticsDashboardData({
      freshness: {
        google_workspace: {
          provider: "google_workspace",
          source: "connection",
          status: "CONNECTED",
          connectedAt: "2026-01-01T00:00:00.000Z",
          lastSyncedAt: "2026-01-01T00:00:00.000Z",
          lastError: null,
          stale: false,
          lastSnapshotAt: null,
        },
      },
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
      lastFullRefresh: "2026-01-30T00:00:00.000Z",
    });

    expect(payload.lifecycleFunnel).toBeNull();
    expect(payload.aiInsights).toBeTruthy();
    expect(Array.isArray(payload.aiInsights.global)).toBe(true);
    expect(payload.aiInsights.bySection.finance).toEqual([]);
    expect(Array.isArray(payload.recommendations)).toBe(true);
    expect(Array.isArray(payload.distilledInsights)).toBe(true);
  });

  it("updates provider freshness with stale snapshot metadata", () => {
    const patched = patchFreshnessWithStale(
      {
        provider: "hubspot",
        source: "connection",
        status: "CONNECTED",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
      {
        stale: true,
        capturedAt: "2026-01-20T00:00:00.000Z",
      }
    );

    expect(patched.stale).toBe(true);
    expect(patched.source).toBe("snapshot");
    expect(patched.lastSnapshotAt).toBe("2026-01-20T00:00:00.000Z");
  });

  it("initializes empty AI insights bundle with all sections", () => {
    const bundle = createEmptyAiInsightsBundle("2026-01-31T00:00:00.000Z");
    expect(bundle.generatedAt).toBe("2026-01-31T00:00:00.000Z");
    expect(bundle.bySection["website-traffic"]).toEqual([]);
    expect(bundle.bySection["social-media"]).toEqual([]);
    expect(bundle.bySection["sales-pipeline"]).toEqual([]);
  });
});
