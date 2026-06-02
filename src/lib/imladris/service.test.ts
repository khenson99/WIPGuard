import { describe, expect, it, vi } from "vitest";
import {
  buildImladrisDashboard,
  buildImladrisMetrics,
  buildImladrisSources,
} from "@/lib/imladris/service";

function createPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    integrationConnection: {
      findMany: vi.fn(async () => []),
    },
    analyticsSnapshot: {
      findMany: vi.fn(async () => []),
    },
    imladrisSourceSyncRun: {
      findMany: vi.fn(async () => []),
    },
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => []),
    },
    ...overrides,
  } as never;
}

const CONTEXT = {
  userId: "user_1",
  organizationId: "org_1",
};

describe("Imladris service", () => {
  it("uses latest Imladris source sync runs for source readiness", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-28T10:00:00.000Z"),
            completedAt: new Date("2026-05-28T10:02:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-28T10:02:00.000Z"),
            checkpoint: { cursor: "lin_42" },
            recordCount: 42,
            acceptedCount: 42,
            errorCount: 0,
            lastError: null,
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const linear = sources.find((source) => source.key === "linear");
    expect(linear).toMatchObject({
      key: "linear",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-28T10:02:00.000Z",
      freshness: {
        slaHours: 24,
        lastSyncedAt: "2026-05-28T10:02:00.000Z",
        staleAfter: "2026-05-29T10:02:00.000Z",
        ageHours: 23.966666666666665,
      },
      historicalCoverage: {
        requiredLookbackMonths: 13,
        expectedWindowStart: "2025-04-29T10:00:00.000Z",
        expectedWindowEnd: "2026-05-29T10:00:00.000Z",
        latestWindowStart: "2025-04-29T10:00:00.000Z",
        latestWindowEnd: "2026-05-28T10:02:00.000Z",
        hasRequiredLookback: true,
      },
        latestSyncRun: {
          status: "SUCCESS",
          recordCount: 42,
          acceptedCount: 42,
          errorCount: 0,
        windowStart: "2025-04-29T10:00:00.000Z",
        windowEnd: "2026-05-28T10:02:00.000Z",
        checkpoint: { cursor: "lin_42" },
      },
    });
  });

  it("marks provider sync runs stale after their freshness SLA", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-28T08:00:00.000Z"),
            completedAt: new Date("2026-05-28T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-28T08:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: null,
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const github = sources.find((source) => source.key === "github");
    expect(github).toMatchObject({
      key: "github",
      status: "stale",
      connected: false,
      freshness: {
        slaHours: 24,
        lastSyncedAt: "2026-05-28T08:03:00.000Z",
        staleAfter: "2026-05-29T08:03:00.000Z",
        ageHours: 25.95,
      },
    });
  });

  it("marks partial provider sync runs as partial even when they are fresh", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "REDDIT",
            status: "PARTIAL",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: { cursor: "reddit_42" },
            recordCount: 10,
            acceptedCount: 7,
            errorCount: 3,
            lastError: "3 Reddit campaign records failed validation",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const reddit = sources.find((source) => source.key === "reddit");
    expect(reddit).toMatchObject({
      key: "reddit",
      status: "partial",
      connected: false,
      lastError: "3 Reddit campaign records failed validation",
      latestSyncRun: {
        status: "PARTIAL",
        recordCount: 10,
        acceptedCount: 7,
        errorCount: 3,
      },
    });
  });

  it("marks metrics partial when required sources only have partial sync coverage", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "REDDIT",
            status: "PARTIAL",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: null,
            recordCount: 10,
            acceptedCount: 7,
            errorCount: 3,
            lastError: "3 Reddit campaign records failed validation",
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const marketing = metrics.find(
      (metric) => metric.key === "marketing.pipeline_efficiency",
    );
    expect(marketing).toMatchObject({
      key: "marketing.pipeline_efficiency",
      status: "partial",
    });
    expect(marketing?.sourceLineage).toContainEqual({
      sourceKey: "reddit",
      status: "partial",
    });
    expect(marketing?.warnings).toEqual([
      "Canonical provider materialization is required before this metric is board-ready.",
    ]);
  });

  it("hydrates canonical metrics from latest Imladris metric values and lineage", async () => {
    const prisma = createPrismaMock({
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "development.delivery_health",
            department: "development",
            unit: "score",
            value: 91,
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.92,
            warnings: ["Linear cycle time and GitHub merge activity agree."],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [
              {
                sourceKey: "linear",
                sourceType: "issue",
                sourceId: "LIN-42",
                rawRecordId: "raw_linear_1",
                capturedAt: new Date("2026-05-29T08:00:00.000Z"),
                metadata: { cycleTimeDays: 3.4 },
              },
              {
                sourceKey: "github",
                sourceType: "pull_request",
                sourceId: "repo/pull/7",
                rawRecordId: "raw_github_1",
                capturedAt: new Date("2026-05-29T08:05:00.000Z"),
                metadata: { mergedCount: 7 },
              },
              {
                sourceKey: "posthog",
                sourceType: "event",
                sourceId: "activation_completed",
                rawRecordId: "raw_posthog_1",
                capturedAt: new Date("2026-05-29T08:10:00.000Z"),
                metadata: { activationRate: 0.64 },
              },
            ],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const deliveryHealth = metrics.find(
      (metric) => metric.key === "development.delivery_health",
    );
    expect(deliveryHealth).toMatchObject({
      key: "development.delivery_health",
      value: 91,
      status: "ready",
      confidence: 0.92,
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-05-29T00:00:00.000Z",
      calculationVersion: "development-delivery-health-v1",
    });
    expect(deliveryHealth?.sourceLineage).toEqual([
      expect.objectContaining({
        sourceKey: "linear",
        sourceType: "issue",
        sourceId: "LIN-42",
        rawRecordId: "raw_linear_1",
      }),
      expect.objectContaining({
        sourceKey: "github",
        sourceType: "pull_request",
        sourceId: "repo/pull/7",
        rawRecordId: "raw_github_1",
      }),
      expect.objectContaining({
        sourceKey: "posthog",
        sourceType: "event",
        sourceId: "activation_completed",
        rawRecordId: "raw_posthog_1",
      }),
    ]);
  });

  it("renders dashboards from canonical metric values", async () => {
    const prisma = createPrismaMock({
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 125000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.88,
            warnings: [],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const dashboard = await buildImladrisDashboard({
      prisma,
      context: CONTEXT,
      dashboardId: "finance",
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(dashboard?.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      status: "ready",
    });
  });
});
