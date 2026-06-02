import { beforeEach, describe, expect, it, vi } from "vitest";
import { runIntegrationHealthChecks } from "@/lib/integrations/health-checks";
import { runHealthChecksSync } from "@/lib/sync/health-checks";
import { discoverConnectedUserIds } from "@/lib/sync/users";

vi.mock("@/lib/integrations/health-checks", () => ({
  runIntegrationHealthChecks: vi.fn(),
}));

vi.mock("@/lib/sync/users", () => ({
  discoverConnectedUserIds: vi.fn(),
}));

function createPrismaMock() {
  return {
    integrationConnection: {
      findMany: vi.fn(),
    },
  };
}

describe("runHealthChecksSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discoverConnectedUserIds).mockResolvedValue(["user_1", "user_2"]);
  });

  it("keeps checking later users when one user's health checks fail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(runIntegrationHealthChecks)
      .mockRejectedValueOnce(new Error("health database write failed"))
      .mockResolvedValueOnce({
        checked: 1,
        ok: 1,
        failed: 0,
        results: [],
      });

    const result = await runHealthChecksSync({
      prisma: createPrismaMock() as never,
    });

    expect(result).toEqual([
      expect.objectContaining({
        userId: "user_1",
        checked: 0,
        ok: 0,
        failed: 1,
        error: "health database write failed",
        results: [],
      }),
      expect.objectContaining({
        userId: "user_2",
        checked: 1,
        ok: 1,
        failed: 0,
        results: [],
      }),
    ]);
    expect(runIntegrationHealthChecks).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      "health_checks_sync.user_failed",
      expect.objectContaining({
        userId: "user_1",
        error: "health database write failed",
      }),
    );
    consoleError.mockRestore();
  });

  it("uses explicit user ids without rediscovering connected users", async () => {
    vi.mocked(runIntegrationHealthChecks).mockResolvedValue({
      checked: 1,
      ok: 1,
      failed: 0,
      results: [],
    });

    await runHealthChecksSync({
      prisma: createPrismaMock() as never,
      userIds: ["owner_1"],
    });

    expect(discoverConnectedUserIds).not.toHaveBeenCalled();
    expect(runIntegrationHealthChecks).toHaveBeenCalledWith({ userId: "owner_1" });
  });
});
