import { describe, expect, it } from "vitest";
import { mapFreshnessToStatus } from "@/hooks/use-connection-status";

describe("mapFreshnessToStatus", () => {
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
});
