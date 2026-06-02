import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";
import { pruneAnalyticsSnapshots } from "@/lib/analytics/snapshots";
import { materializeImladrisCanonicalMetrics } from "@/lib/imladris/materialization";
import { runAnalyticsSync } from "@/lib/sync/analytics";
import { discoverConnectedUserIds } from "@/lib/sync/users";

vi.mock("@/lib/analytics/refresh-runner", () => ({
  runAnalyticsRefresh: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  pruneAnalyticsSnapshots: vi.fn(),
}));

vi.mock("@/lib/imladris/materialization", () => ({
  materializeImladrisCanonicalMetrics: vi.fn(),
}));

vi.mock("@/lib/sync/users", () => ({
  discoverConnectedUserIds: vi.fn(),
}));

function createPrismaMock() {
  return {
    user: {
      findMany: vi.fn(async () => [
        { id: "user_1", organizationId: "org_1" },
        { id: "user_2", organizationId: null },
      ]),
    },
    integrationConnection: {
      findMany: vi.fn(async () => []),
    },
  };
}

describe("runAnalyticsSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    vi.clearAllMocks();
    vi.mocked(runAnalyticsRefresh).mockResolvedValue({ refreshed: true } as never);
    vi.mocked(pruneAnalyticsSnapshots).mockResolvedValue({ deleted: 0 } as never);
    vi.mocked(materializeImladrisCanonicalMetrics).mockResolvedValue([
      {
        metricKey: "development.delivery_health",
        metricValueId: "metric_1",
        status: "READY",
        rawRecordCount: 3,
        value: { score: 91 },
      },
    ] as never);
    vi.mocked(discoverConnectedUserIds).mockResolvedValue(["user_1", "user_2"]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("materializes Imladris canonical metrics for every synced user", async () => {
    const prisma = createPrismaMock();

    const result = await runAnalyticsSync({
      prisma: prisma as never,
    });

    expect(discoverConnectedUserIds).toHaveBeenCalledWith(prisma);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["user_1", "user_2"],
        },
      },
      select: {
        id: true,
        organizationId: true,
      },
    });
    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledTimes(2);
    expect(materializeImladrisCanonicalMetrics).toHaveBeenNthCalledWith(1, {
      prisma,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      periodStart: new Date("2026-05-02T12:00:00.000Z"),
      periodEnd: new Date("2026-06-01T12:00:00.000Z"),
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(materializeImladrisCanonicalMetrics).toHaveBeenNthCalledWith(2, {
      prisma,
      context: {
        userId: "user_2",
        organizationId: null,
      },
      periodStart: new Date("2026-05-02T12:00:00.000Z"),
      periodEnd: new Date("2026-06-01T12:00:00.000Z"),
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(result.imladris).toEqual([
      {
        userId: "user_1",
        organizationId: "org_1",
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metrics: [
          expect.objectContaining({
            metricKey: "development.delivery_health",
            rawRecordCount: 3,
          }),
        ],
      },
      {
        userId: "user_2",
        organizationId: null,
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metrics: [
          expect.objectContaining({
            metricKey: "development.delivery_health",
            rawRecordCount: 3,
          }),
        ],
      },
    ]);
  });

  it("falls back to scoped integration connection organizations when materializing metrics", async () => {
    const prisma = {
      user: {
        findMany: vi.fn(async () => [
          { id: "user_1", organizationId: null },
        ]),
      },
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            userId: "user_1",
            organizationId: "org_from_connection",
          },
        ]),
      },
    };

    await runAnalyticsSync({
      prisma: prisma as never,
      userIds: ["user_1"],
    });

    expect(prisma.integrationConnection.findMany).toHaveBeenCalledWith({
      where: {
        userId: {
          in: ["user_1"],
        },
        organizationId: {
          not: null,
        },
        status: {
          in: ["CONNECTED", "ERROR"],
        },
      },
      select: {
        userId: true,
        organizationId: true,
      },
      orderBy: [
        { lastSyncedAt: "desc" },
        { updatedAt: "desc" },
      ],
    });
    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          userId: "user_1",
          organizationId: "org_from_connection",
        },
      }),
    );
  });

  it("waits for provider refresh to finish before materializing canonical metrics", async () => {
    const prisma = createPrismaMock();
    let refreshResolved = false;
    let resolveRefresh: (value: unknown) => void = () => {};
    vi.mocked(runAnalyticsRefresh).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = (value) => {
          refreshResolved = true;
          resolve(value);
        };
      }) as never,
    );
    vi.mocked(materializeImladrisCanonicalMetrics).mockImplementation(async () => {
      if (!refreshResolved) {
        throw new Error("Materialized before provider refresh completed");
      }
      return [
        {
          metricKey: "development.delivery_health",
          metricValueId: "metric_1",
          status: "READY",
          rawRecordCount: 3,
          value: { score: 91 },
        },
      ] as never;
    });

    const syncPromise = runAnalyticsSync({
      prisma: prisma as never,
      userIds: ["user_1"],
    });

    await Promise.resolve();
    expect(materializeImladrisCanonicalMetrics).not.toHaveBeenCalled();

    resolveRefresh({
      usersProcessed: 1,
      refreshCount: 1,
      failureCount: 0,
      completedAt: "2026-06-01T12:00:00.000Z",
    });

    await expect(syncPromise).resolves.toEqual(expect.objectContaining({
      refresh: expect.objectContaining({
        usersProcessed: 1,
        refreshCount: 1,
      }),
      imladris: expect.arrayContaining([
        expect.objectContaining({
          userId: "user_1",
          metrics: expect.arrayContaining([
            expect.objectContaining({ metricKey: "development.delivery_health" }),
          ]),
        }),
      ]),
    }));
    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledTimes(1);
  });

  it("skips canonical materialization when provider refresh reports failures", async () => {
    const prisma = createPrismaMock();
    vi.mocked(runAnalyticsRefresh).mockResolvedValue({
      usersProcessed: 2,
      refreshCount: 7,
      failureCount: 2,
      completedAt: "2026-06-01T12:00:00.000Z",
    } as never);

    const result = await runAnalyticsSync({
      prisma: prisma as never,
    });

    expect(materializeImladrisCanonicalMetrics).not.toHaveBeenCalled();
    expect(pruneAnalyticsSnapshots).toHaveBeenCalledOnce();
    expect(result.imladris).toEqual([
      {
        userId: "user_1",
        organizationId: "org_1",
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metrics: [],
        error:
          "Skipped canonical materialization because analytics refresh had 2 provider failures.",
      },
      {
        userId: "user_2",
        organizationId: null,
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metrics: [],
        error:
          "Skipped canonical materialization because analytics refresh had 2 provider failures.",
      },
    ]);
  });

  it("keeps materializing other users when one Imladris context fails", async () => {
    const prisma = createPrismaMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(materializeImladrisCanonicalMetrics).mockImplementation(async ({ context }) => {
      if (context.userId === "user_2") {
        throw new Error("canonical write failed");
      }
      return [
        {
          metricKey: "development.delivery_health",
          metricValueId: "metric_1",
          status: "READY",
          rawRecordCount: 3,
          value: { score: 91 },
        },
      ] as never;
    });

    const result = await runAnalyticsSync({
      prisma: prisma as never,
    });

    expect(result.imladris).toEqual([
      expect.objectContaining({
        userId: "user_1",
        metrics: [
          expect.objectContaining({
            metricKey: "development.delivery_health",
          }),
        ],
      }),
      expect.objectContaining({
        userId: "user_2",
        organizationId: null,
        metrics: [],
        error: "canonical write failed",
      }),
    ]);
    expect(pruneAnalyticsSnapshots).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "analytics_sync.imladris_materialization_failed",
      expect.objectContaining({
        userId: "user_2",
        organizationId: null,
        error: "canonical write failed",
      }),
    );
    consoleError.mockRestore();
  });
});
