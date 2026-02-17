import { describe, expect, it } from "vitest";
import { buildAnalyticsRouteMeta, buildSummaryChildDiagnostics } from "@/lib/analytics/route-meta";

describe("analytics route meta helpers", () => {
  it("builds non-breaking meta with partial status based on stale/errors", () => {
    const meta = buildAnalyticsRouteMeta({
      servedAt: "2026-02-17T00:00:00.000Z",
      section: "finance",
      forceRefresh: true,
      staleDomains: ["stripe"],
      erroredDomains: ["mercury"],
    });

    expect(meta.servedAt).toBe("2026-02-17T00:00:00.000Z");
    expect(meta.section).toBe("finance");
    expect(meta.forceRefresh).toBe(true);
    expect(meta.isPartial).toBe(true);
    expect(meta.staleDomains).toEqual(["stripe"]);
    expect(meta.erroredDomains).toEqual(["mercury"]);
  });

  it("includes optional child diagnostics for error snapshots", () => {
    const diagnostics = buildSummaryChildDiagnostics({
      snapshotStatus: "ERROR",
      capturedAt: "2026-02-17T00:00:00.000Z",
      lastError: "Provider timeout",
    });

    expect(diagnostics.lastSnapshotAt).toBe("2026-02-17T00:00:00.000Z");
    expect(diagnostics.lastError).toBe("Provider timeout");
  });

  it("clears child lastError for successful snapshots", () => {
    const diagnostics = buildSummaryChildDiagnostics({
      snapshotStatus: "SUCCESS",
      capturedAt: "2026-02-17T00:00:00.000Z",
      lastError: "Old error",
    });

    expect(diagnostics.lastSnapshotAt).toBe("2026-02-17T00:00:00.000Z");
    expect(diagnostics.lastError).toBeNull();
  });
});
