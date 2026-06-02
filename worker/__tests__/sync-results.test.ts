import { describe, expect, it } from "vitest";
import { assertSyncResultsHealthy } from "../sync-results";

describe("assertSyncResultsHealthy", () => {
  it("accepts void results from legacy orchestrators", () => {
    expect(() => assertSyncResultsHealthy(undefined)).not.toThrow();
  });

  it("accepts all-success module results", () => {
    expect(() =>
      assertSyncResultsHealthy([
        { module: "analytics", success: true, durationMs: 25 },
        { module: "healthChecks", success: true, durationMs: 10 },
      ]),
    ).not.toThrow();
  });

  it("throws when returned module results include failures", () => {
    expect(() =>
      assertSyncResultsHealthy([
        { module: "analytics", success: false, durationMs: 25, error: "analytics: 2 provider refresh failures" },
        { module: "healthChecks", success: false, durationMs: 10, error: "health: 1 user health check failed" },
      ]),
    ).toThrow(
      "Sync cycle completed with failed modules: analytics: analytics: 2 provider refresh failures; healthChecks: health: 1 user health check failed",
    );
  });
});
