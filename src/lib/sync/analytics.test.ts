import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";
import { pruneAnalyticsSnapshots } from "@/lib/analytics/snapshots";
import { pruneOutboxEvents } from "@/lib/events/outbox-retention";
import { pruneImladrisMetricLineage } from "@/lib/imladris/lineage-retention";
import { pruneImladrisMetricValues } from "@/lib/imladris/metric-value-retention";
import { materializeImladrisCanonicalMetrics } from "@/lib/imladris/materialization";
import { runAnalyticsSync } from "@/lib/sync/analytics";
import { discoverConnectedUserIds } from "@/lib/sync/users";

vi.mock("@/lib/analytics/refresh-runner", () => ({
  runAnalyticsRefresh: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  pruneAnalyticsSnapshots: vi.fn(),
}));

vi.mock("@/lib/events/outbox-retention", () => ({
  pruneOutboxEvents: vi.fn(),
}));

vi.mock("@/lib/imladris/lineage-retention", () => ({
  pruneImladrisMetricLineage: vi.fn(),
}));

vi.mock("@/lib/imladris/metric-value-retention", () => ({
  pruneImladrisMetricValues: vi.fn(),
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
    vi.mocked(pruneImladrisMetricLineage).mockResolvedValue({
      deletedRows: 0,
      prunedMetricValues: 0,
      batches: 0,
      cutoff: "2026-05-18T12:00:00.000Z",
      completed: true,
      durationMs: 1,
    } as never);
    vi.mocked(pruneImladrisMetricValues).mockResolvedValue({
      deletedRows: 0,
      batches: 0,
      cutoff: "2026-05-18T12:00:00.000Z",
      completed: true,
      durationMs: 1,
    } as never);
    vi.mocked(pruneOutboxEvents).mockResolvedValue({
      deletedDispatched: 0,
      deletedDeadLetter: 0,
      batches: 0,
      dispatchedCutoff: "2026-05-18T12:00:00.000Z",
      deadLetterCutoff: "2026-05-02T12:00:00.000Z",
      completed: true,
      durationMs: 1,
    } as never);
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
        metricsCount: 1,
        metricKeys: ["development.delivery_health"],
      },
      {
        userId: "user_2",
        organizationId: null,
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metricsCount: 1,
        metricKeys: ["development.delivery_health"],
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
          metricKeys: expect.arrayContaining(["development.delivery_health"]),
        }),
      ]),
    }));
    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledTimes(1);
  });

  it("continues canonical materialization when provider refresh reports failures and surfaces a warning", async () => {
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

    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledTimes(2);
    expect(pruneAnalyticsSnapshots).toHaveBeenCalledOnce();
    expect(result.imladris).toEqual([
      {
        userId: "user_1",
        organizationId: "org_1",
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metricsCount: 1,
        metricKeys: ["development.delivery_health"],
        warning:
          "Analytics refresh reported 2 provider failures; canonical materialization used available raw records.",
      },
      {
        userId: "user_2",
        organizationId: null,
        periodStart: "2026-05-02T12:00:00.000Z",
        periodEnd: "2026-06-01T12:00:00.000Z",
        metricsCount: 1,
        metricKeys: ["development.delivery_health"],
        warning:
          "Analytics refresh reported 2 provider failures; canonical materialization used available raw records.",
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
        metricsCount: 1,
        metricKeys: ["development.delivery_health"],
      }),
      expect.objectContaining({
        userId: "user_2",
        organizationId: null,
        metricsCount: 0,
        metricKeys: [],
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

  it("runs growth-control pruning after materialization and surfaces the results", async () => {
    const prisma = createPrismaMock();
    const lineageResult = {
      deletedRows: 12,
      prunedMetricValues: 3,
      batches: 2,
      cutoff: "2026-05-18T12:00:00.000Z",
      completed: true,
      durationMs: 5,
    };
    const metricValueResult = {
      deletedRows: 30,
      batches: 1,
      cutoff: "2026-05-18T12:00:00.000Z",
      completed: true,
      durationMs: 2,
    };
    const outboxResult = {
      deletedDispatched: 7,
      deletedDeadLetter: 1,
      batches: 2,
      dispatchedCutoff: "2026-05-18T12:00:00.000Z",
      deadLetterCutoff: "2026-05-02T12:00:00.000Z",
      completed: false,
      durationMs: 3,
    };
    vi.mocked(pruneImladrisMetricLineage).mockResolvedValueOnce(lineageResult as never);
    vi.mocked(pruneImladrisMetricValues).mockResolvedValueOnce(metricValueResult as never);
    vi.mocked(pruneOutboxEvents).mockResolvedValueOnce(outboxResult as never);

    const result = await runAnalyticsSync({
      prisma: prisma as never,
    });

    expect(result.lineagePruning).toEqual(lineageResult);
    expect(result.metricValuePruning).toEqual(metricValueResult);
    expect(result.outboxPruning).toEqual(outboxResult);
    expect(pruneImladrisMetricLineage).toHaveBeenCalledWith({
      prisma,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(pruneImladrisMetricValues).toHaveBeenCalledWith({
      prisma,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(pruneOutboxEvents).toHaveBeenCalledWith({
      prisma,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    // Pruning must run after materialization so it never contends with the
    // cycle's own lineage writes, and metric value thinning must run after
    // lineage pruning (it only deletes lineage-free rows).
    const lastMaterializeOrder = vi
      .mocked(materializeImladrisCanonicalMetrics)
      .mock.invocationCallOrder.at(-1);
    const lineageOrder = vi.mocked(pruneImladrisMetricLineage).mock.invocationCallOrder[0];
    const metricValueOrder = vi.mocked(pruneImladrisMetricValues).mock.invocationCallOrder[0];
    expect(lastMaterializeOrder).toBeDefined();
    expect(lineageOrder).toBeGreaterThan(lastMaterializeOrder as number);
    expect(metricValueOrder).toBeGreaterThan(lineageOrder);
  });

  it("captures growth-control pruning failures without failing the sync", async () => {
    const prisma = createPrismaMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(pruneImladrisMetricLineage).mockRejectedValueOnce(
      new Error("lineage prune exploded"),
    );
    vi.mocked(pruneImladrisMetricValues).mockRejectedValueOnce(
      new Error("metric value prune exploded"),
    );
    vi.mocked(pruneOutboxEvents).mockRejectedValueOnce(new Error("outbox prune exploded"));

    const result = await runAnalyticsSync({
      prisma: prisma as never,
    });

    expect(result.lineagePruning).toEqual({ error: "lineage prune exploded" });
    expect(result.metricValuePruning).toEqual({ error: "metric value prune exploded" });
    expect(result.outboxPruning).toEqual({ error: "outbox prune exploded" });
    // The sync itself still succeeds end-to-end.
    expect(result.refresh).toEqual({ refreshed: true });
    expect(result.imladris).toHaveLength(2);
    expect(consoleError).toHaveBeenCalledWith("analytics_sync.lineage_pruning_failed", {
      error: "lineage prune exploded",
    });
    expect(consoleError).toHaveBeenCalledWith("analytics_sync.metric_value_pruning_failed", {
      error: "metric value prune exploded",
    });
    expect(consoleError).toHaveBeenCalledWith("analytics_sync.outbox_pruning_failed", {
      error: "outbox prune exploded",
    });
    consoleError.mockRestore();
  });
});
