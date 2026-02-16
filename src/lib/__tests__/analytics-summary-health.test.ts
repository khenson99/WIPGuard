import { deriveDomainSectionStatus } from "@/lib/analytics/summary-health";

describe("analytics summary health", () => {
  it("is partial when configured but latest snapshot is error", () => {
    expect(
      deriveDomainSectionStatus({
        configured: true,
        requiresSnapshot: true,
        snapshotStatus: "ERROR",
        snapshotStale: false,
      })
    ).toBe("degraded");
  });

  it("is connected when configured and latest snapshot is healthy success", () => {
    expect(
      deriveDomainSectionStatus({
        configured: true,
        requiresSnapshot: true,
        snapshotStatus: "SUCCESS",
        snapshotStale: false,
      })
    ).toBe("connected");
  });

  it("is missing when credentials are absent", () => {
    expect(
      deriveDomainSectionStatus({
        configured: false,
        requiresSnapshot: true,
        snapshotStatus: null,
        snapshotStale: false,
      })
    ).toBe("missing");
  });
});
