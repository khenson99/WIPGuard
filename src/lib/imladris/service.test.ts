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

function successfulSyncRun(provider: string, startedAt: string) {
  const started = new Date(startedAt);
  return {
    provider,
    status: "SUCCESS",
    startedAt: started,
    completedAt: new Date(started.getTime() + 3 * 60 * 1000),
    windowStart: new Date("2025-04-29T10:00:00.000Z"),
    windowEnd: new Date("2026-05-29T08:00:00.000Z"),
    checkpoint: null,
    recordCount: 10,
    acceptedCount: 10,
    errorCount: 0,
    lastError: null,
  };
}

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

  it("normalizes Unix timestamp sync-run metadata before source readiness analysis", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: "1780041600",
            completedAt: "1780041780000",
            windowStart: "1745920800",
            windowEnd: "1780041780",
            checkpoint: { cursor: "unix" },
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
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      historicalCoverage: {
        latestWindowStart: "2025-04-29T10:00:00.000Z",
        latestWindowEnd: "2026-05-29T08:03:00.000Z",
        hasRequiredLookback: true,
      },
      latestSyncRun: {
        startedAt: "2026-05-29T08:00:00.000Z",
        completedAt: "2026-05-29T08:03:00.000Z",
        windowStart: "2025-04-29T10:00:00.000Z",
        windowEnd: "2026-05-29T08:03:00.000Z",
        checkpoint: { cursor: "unix" },
      },
    });
  });

  it("normalizes decimal Unix timestamp sync-run metadata before source readiness analysis", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: "1780041600.25",
            completedAt: "1780041780.5",
            windowStart: "1745920799.75",
            windowEnd: "1780041780.75",
            checkpoint: { cursor: "decimal-unix" },
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
      lastSyncedAt: "2026-05-29T08:03:00.500Z",
      historicalCoverage: {
        latestWindowStart: "2025-04-29T09:59:59.750Z",
        latestWindowEnd: "2026-05-29T08:03:00.750Z",
        hasRequiredLookback: true,
      },
      latestSyncRun: {
        startedAt: "2026-05-29T08:00:00.250Z",
        completedAt: "2026-05-29T08:03:00.500Z",
        windowStart: "2025-04-29T09:59:59.750Z",
        windowEnd: "2026-05-29T08:03:00.750Z",
        checkpoint: { cursor: "decimal-unix" },
      },
    });
  });

  it("unwraps provider timestamp envelopes before source readiness analysis", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: { value: "2026-05-29T08:00:00.000Z" },
            completedAt: { data: { value: "2026-05-29T08:03:00.000Z" } },
            windowStart: { attributes: { value: "2025-04-29T10:00:00.000Z" } },
            windowEnd: { values: { value: "2026-05-29T08:03:00.000Z" } },
            checkpoint: { cursor: "wrapped-timestamps" },
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
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      freshness: {
        lastSyncedAt: "2026-05-29T08:03:00.000Z",
        staleAfter: "2026-05-30T08:03:00.000Z",
      },
      historicalCoverage: {
        latestWindowStart: "2025-04-29T10:00:00.000Z",
        latestWindowEnd: "2026-05-29T08:03:00.000Z",
        hasRequiredLookback: true,
      },
      latestSyncRun: {
        startedAt: "2026-05-29T08:00:00.000Z",
        completedAt: "2026-05-29T08:03:00.000Z",
        windowStart: "2025-04-29T10:00:00.000Z",
        windowEnd: "2026-05-29T08:03:00.000Z",
        checkpoint: { cursor: "wrapped-timestamps" },
      },
    });
  });

  it("unwraps provider count envelopes before source readiness accounting", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: { cursor: "wrapped-counts" },
            recordCount: { data: { attributes: { value: "42" } } },
            acceptedCount: { value: "42" },
            errorCount: { count: "0" },
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
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
        recordCount: 42,
        acceptedCount: 42,
        errorCount: 0,
      },
    });
  });

  it("ignores future-dated source sync runs when selecting source readiness evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-30T09:00:00.000Z"),
            completedAt: new Date("2026-05-30T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-30T09:03:00.000Z"),
            checkpoint: { cursor: "future" },
            recordCount: 999,
            acceptedCount: 999,
            errorCount: 0,
            lastError: null,
          },
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: { cursor: "current" },
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
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      freshness: {
        ageHours: 1.95,
      },
      latestSyncRun: {
        recordCount: 42,
        checkpoint: { cursor: "current" },
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

  it("marks provider sync runs stale when historical lookback is incomplete", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2026-05-01T00:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: null,
            recordCount: 45,
            acceptedCount: 45,
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
      status: "stale",
      connected: false,
      historicalCoverage: {
        expectedWindowStart: "2025-04-29T10:00:00.000Z",
        latestWindowStart: "2026-05-01T00:00:00.000Z",
        hasRequiredLookback: false,
      },
    });
  });

  it("marks provider sync runs stale when their data window is not current", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-02-01T00:00:00.000Z"),
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
      lastSyncedAt: "2026-05-29T09:03:00.000Z",
      historicalCoverage: {
        expectedWindowEnd: "2026-05-29T10:00:00.000Z",
        latestWindowEnd: "2026-02-01T00:00:00.000Z",
        hasFreshWindowEnd: false,
      },
    });
  });

  it("marks provider sync runs partial when their data window ends in the future", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-30T00:00:00.000Z"),
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
      status: "partial",
      connected: false,
      lastError: "Sync run data window ends in the future.",
      historicalCoverage: {
        latestWindowEnd: "2026-05-30T00:00:00.000Z",
        hasFreshWindowEnd: false,
      },
      latestSyncRun: {
        status: "SUCCESS",
        windowEnd: "2026-05-30T00:00:00.000Z",
      },
    });
  });

  it("surfaces sync-run errors when invalid data windows make source readiness partial", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-01T00:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-20T00:00:00.000Z"),
            lastError: "old connection warning",
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-30T00:00:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: "sync window cannot end in the future",
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
      status: "partial",
      lastError: "sync window cannot end in the future",
    });
  });

  it("does not treat unfinished source sync runs as connected evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: null,
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:00:00.000Z"),
            checkpoint: null,
            recordCount: 100,
            acceptedCount: 100,
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
      status: "partial",
      connected: false,
      lastSyncedAt: null,
      latestSyncRun: {
        status: "SUCCESS",
        startedAt: "2026-05-29T09:00:00.000Z",
        completedAt: null,
      },
    });
  });

  it("keeps malformed completion metadata visible as partial sync evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: "not-a-date",
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:00:00.000Z"),
            checkpoint: null,
            recordCount: 100,
            acceptedCount: 100,
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
      status: "partial",
      connected: false,
      lastSyncedAt: null,
      lastError: "Sync run has not completed.",
      latestSyncRun: {
        status: "SUCCESS",
        startedAt: "2026-05-29T09:00:00.000Z",
        completedAt: null,
      },
    });
  });

  it("keeps fresh completed sync evidence when a newer same-scope run is unfinished", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: null,
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:30:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 0,
            lastError: null,
          },
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: { cursor: "completed" },
            recordCount: 100,
            acceptedCount: 100,
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
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
        checkpoint: { cursor: "completed" },
      },
    });
  });

  it("keeps fresh completed sync evidence when a newer same-scope completed run has invalid coverage", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-30T00:00:00.000Z"),
            checkpoint: { cursor: "invalid_completed" },
            recordCount: 100,
            acceptedCount: 100,
            errorCount: 0,
            lastError: "sync window cannot end in the future",
          },
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: { cursor: "fresh_completed" },
            recordCount: 100,
            acceptedCount: 100,
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
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
        windowEnd: "2026-05-29T08:03:00.000Z",
        checkpoint: { cursor: "fresh_completed" },
      },
    });
  });

  it("marks source sync runs partial when accepted and error counts exceed record count", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: null,
            recordCount: 10,
            acceptedCount: 11,
            errorCount: 0,
            lastError: "Stripe sync accounting was inconsistent",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "partial",
      connected: false,
      lastError: "Stripe sync accounting was inconsistent",
      latestSyncRun: {
        status: "SUCCESS",
        recordCount: 10,
        acceptedCount: 11,
        errorCount: 0,
      },
    });
  });

  it("marks source sync runs partial when record counts are fractional", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: null,
            recordCount: 10.5,
            acceptedCount: 10.5,
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

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "partial",
      connected: false,
      lastError: "Sync run record counts are invalid.",
      latestSyncRun: {
        status: "SUCCESS",
        recordCount: 10.5,
        acceptedCount: 10.5,
        errorCount: 0,
      },
    });
  });

  it("normalizes provider sync-run statuses before calculating source readiness", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: " error ",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: "GitHub sync failed after provider returned mixed-case status",
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
      status: "error",
      connected: false,
      lastError: "GitHub sync failed after provider returned mixed-case status",
      latestSyncRun: {
        status: "ERROR",
      },
    });
  });

  it("unwraps object-shaped source statuses before calculating source readiness", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: { value: { status: "disabled" } },
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:15:00.000Z"),
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: {
              data: {
                attributes: {
                  state: "completed",
                },
              },
            },
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
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

    expect(sources.find((source) => source.key === "hubspot")).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastSyncedAt: "2026-05-29T09:15:00.000Z",
    });
    expect(sources.find((source) => source.key === "github")).toMatchObject({
      key: "github",
      status: "connected",
      connected: true,
      latestSyncRun: {
        status: "SUCCESS",
      },
    });
  });

  it("unwraps direct data value source statuses before calculating source readiness", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: {
              data: {
                value: {
                  status: "active",
                },
              },
            },
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: null,
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: {
              data: {
                value: {
                  state: "completed",
                },
              },
            },
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
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

    expect(sources.find((source) => source.key === "hubspot")).toMatchObject({
      key: "hubspot",
      status: "partial",
      connected: false,
      lastError: "HubSpot is connected but no raw sync has completed yet.",
    });
    expect(sources.find((source) => source.key === "github")).toMatchObject({
      key: "github",
      status: "connected",
      connected: true,
      latestSyncRun: {
        status: "SUCCESS",
      },
    });
  });

  it("unwraps direct data source statuses before calculating source readiness", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: {
              data: {
                status: "active",
              },
            },
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: null,
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: {
              data: {
                status: "completed",
              },
            },
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
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

    expect(sources.find((source) => source.key === "hubspot")).toMatchObject({
      key: "hubspot",
      status: "partial",
      connected: false,
      lastError: "HubSpot is connected but no raw sync has completed yet.",
    });
    expect(sources.find((source) => source.key === "github")).toMatchObject({
      key: "github",
      status: "connected",
      connected: true,
      latestSyncRun: {
        status: "SUCCESS",
      },
    });
  });

  it("unwraps explicit connection and sync status envelopes before calculating source readiness", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: { connectionStatus: { value: "active" } },
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: null,
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: { syncStatus: { value: "completed" } },
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
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

    expect(sources.find((source) => source.key === "hubspot")).toMatchObject({
      key: "hubspot",
      status: "partial",
      connected: false,
      lastError: "HubSpot is connected but no raw sync has completed yet.",
    });
    expect(sources.find((source) => source.key === "github")).toMatchObject({
      key: "github",
      status: "connected",
      connected: true,
      latestSyncRun: {
        status: "SUCCESS",
      },
    });
  });

  it("treats completed provider sync-run status aliases as successful readiness evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "completed",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
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
      status: "connected",
      connected: true,
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
      },
    });
  });

  it("treats completed-with-errors sync-run status aliases as partial readiness evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "completed-with-errors",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: "GitHub completed with recoverable errors",
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
      status: "partial",
      connected: false,
      lastError: "GitHub completed with recoverable errors",
      latestSyncRun: {
        status: "PARTIAL",
        recordCount: 120,
        acceptedCount: 120,
        errorCount: 0,
      },
    });
  });

  it("treats terminal timed-out sync-run status aliases as errored readiness evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "timed-out",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 118,
            errorCount: 2,
            lastError: "Stripe sync timed out while fetching invoices",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "error",
      connected: false,
      lastError: "Stripe sync timed out while fetching invoices",
      latestSyncRun: {
        status: "ERROR",
        recordCount: 120,
        acceptedCount: 118,
        errorCount: 2,
      },
    });
  });

  it("treats in-progress sync-run status aliases as partial readiness evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "in progress",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: null,
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:00:00.000Z"),
            checkpoint: { cursor: "lin_in_progress" },
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

    const linear = sources.find((source) => source.key === "linear");
    expect(linear).toMatchObject({
      key: "linear",
      status: "partial",
      connected: false,
      lastSyncedAt: null,
      lastError: "Sync run has not completed.",
      latestSyncRun: {
        status: "PARTIAL",
        completedAt: null,
        checkpoint: { cursor: "lin_in_progress" },
      },
    });
  });

  it("does not let stale completed sync evidence hide a current unfinished run", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: null,
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:30:00.000Z"),
            checkpoint: { cursor: "in-progress" },
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 0,
            lastError: null,
          },
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-27T08:00:00.000Z"),
            completedAt: new Date("2026-05-27T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-27T08:03:00.000Z"),
            checkpoint: { cursor: "stale-completed" },
            recordCount: 100,
            acceptedCount: 100,
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
      status: "partial",
      connected: false,
      lastSyncedAt: null,
      lastError: "Sync run has not completed.",
      latestSyncRun: {
        status: "SUCCESS",
        startedAt: "2026-05-29T09:30:00.000Z",
        completedAt: null,
        checkpoint: { cursor: "in-progress" },
      },
    });
  });

  it("does not let stale completed sync errors hide a current unfinished run", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: null,
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:30:00.000Z"),
            checkpoint: { cursor: "in-progress" },
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 0,
            lastError: null,
          },
          {
            provider: "LINEAR",
            status: "ERROR",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-27T08:00:00.000Z"),
            completedAt: new Date("2026-05-27T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-27T08:03:00.000Z"),
            checkpoint: { cursor: "stale-error" },
            recordCount: 100,
            acceptedCount: 99,
            errorCount: 1,
            lastError: "Previous Linear sync failed",
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
      status: "partial",
      connected: false,
      lastSyncedAt: null,
      lastError: "Sync run has not completed.",
      latestSyncRun: {
        status: "SUCCESS",
        startedAt: "2026-05-29T09:30:00.000Z",
        completedAt: null,
        checkpoint: { cursor: "in-progress" },
      },
    });
  });

  it("normalizes provider aliases before matching sync runs to source readiness", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: " google ads ",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 25,
            acceptedCount: 25,
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

    const googleAds = sources.find((source) => source.key === "googleAds");
    expect(googleAds).toMatchObject({
      key: "googleAds",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T09:03:00.000Z",
      latestSyncRun: {
        status: "SUCCESS",
        recordCount: 25,
      },
    });
  });

  it("normalizes object-shaped provider aliases before matching sync runs to source readiness", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: { key: "google_ads", label: "Google Ads" },
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 25,
            acceptedCount: 25,
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

    const googleAds = sources.find((source) => source.key === "googleAds");
    expect(googleAds).toMatchObject({
      key: "googleAds",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T09:03:00.000Z",
      latestSyncRun: {
        status: "SUCCESS",
        recordCount: 25,
      },
    });
  });

  it("unwraps direct data provider aliases before matching sync runs to source readiness", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: { data: { key: "google_ads" } },
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 25,
            acceptedCount: 25,
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

    const googleAds = sources.find((source) => source.key === "googleAds");
    expect(googleAds).toMatchObject({
      key: "googleAds",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T09:03:00.000Z",
      latestSyncRun: {
        status: "SUCCESS",
        recordCount: 25,
      },
    });
  });

  it("does not treat unknown completed sync-run statuses as connected evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "NEEDS_REVIEW",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: "GitHub sync needs provider review",
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
      status: "partial",
      connected: false,
      lastError: "GitHub sync needs provider review",
      latestSyncRun: {
        status: "NEEDS_REVIEW",
        recordCount: 120,
        acceptedCount: 120,
        errorCount: 0,
      },
    });
  });

  it("unwraps provider sync-run status code envelopes before returning readiness output", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: { code: "needs-review" },
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: "GitHub sync needs provider review",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(sources.find((source) => source.key === "github")).toMatchObject({
      key: "github",
      status: "partial",
      connected: false,
      lastError: "GitHub sync needs provider review",
      latestSyncRun: {
        status: "NEEDS_REVIEW",
      },
    });
  });

  it("does not leak malformed provider sync-run status envelopes into readiness output", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: { providerPayload: { step: 2 } },
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: "Linear returned an unrecognized sync state",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(sources.find((source) => source.key === "linear")).toMatchObject({
      key: "linear",
      status: "partial",
      connected: false,
      lastError: "Linear returned an unrecognized sync state",
      latestSyncRun: {
        status: "UNKNOWN",
      },
    });
  });

  it("uses normalized snapshot status when selecting the readiness error message", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "META_ADS",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T08:30:00.000Z"),
            lastError: "Old connection warning",
          },
        ]),
      },
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            userId: "user_1",
            providerKey: "metaAds",
            status: " error ",
            capturedAt: new Date("2026-05-29T09:00:00.000Z"),
            expiresAt: new Date("2026-05-30T09:00:00.000Z"),
            lastError: "Meta Ads snapshot permissions expired",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const metaAds = sources.find((source) => source.key === "metaAds");
    expect(metaAds).toMatchObject({
      key: "metaAds",
      status: "error",
      connected: false,
      lastError: "Meta Ads snapshot permissions expired",
    });
  });

  it("normalizes object-shaped snapshot provider keys before matching source readiness", async () => {
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            userId: "user_1",
            providerKey: { key: "meta_ads", label: "Meta Ads" },
            status: "OK",
            capturedAt: new Date("2026-05-29T09:00:00.000Z"),
            expiresAt: new Date("2026-05-30T09:00:00.000Z"),
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

    expect(sources.find((source) => source.key === "metaAds")).toMatchObject({
      key: "metaAds",
      status: "connected",
      connected: true,
      lastSnapshotAt: "2026-05-29T09:00:00.000Z",
      lastSyncedAt: "2026-05-29T09:00:00.000Z",
    });
  });

  it("does not let legacy snapshot errors override fresh Imladris source sync evidence", async () => {
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            userId: "user_1",
            providerKey: "metaAds",
            status: "ERROR",
            capturedAt: new Date("2026-05-29T08:00:00.000Z"),
            expiresAt: new Date("2026-05-30T08:00:00.000Z"),
            lastError: "Legacy snapshot token expired",
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "META_ADS",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: { cursor: "fresh-sync" },
            recordCount: 25,
            acceptedCount: 25,
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

    const metaAds = sources.find((source) => source.key === "metaAds");
    expect(metaAds).toMatchObject({
      key: "metaAds",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T09:05:00.000Z",
      lastSnapshotAt: "2026-05-29T08:00:00.000Z",
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
        checkpoint: { cursor: "fresh-sync" },
      },
    });
  });

  it("uses normalized partial sync-run status when selecting the readiness error message", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "REDDIT",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T08:30:00.000Z"),
            lastError: "Old Reddit connection warning",
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "REDDIT",
            status: " partial ",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: null,
            recordCount: 10,
            acceptedCount: 10,
            errorCount: 0,
            lastError: "Reddit sync returned partial coverage",
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
      lastError: "Reddit sync returned partial coverage",
      latestSyncRun: {
        status: "PARTIAL",
      },
    });
  });

  it("normalizes connection statuses before ranking candidate source connections", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: null,
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:20:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:30:00.000Z"),
            lastError: "Organization fallback connection failed",
          },
          {
            provider: "HUBSPOT",
            status: " connected ",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:10:00.000Z"),
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:10:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:10:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "connected",
      connected: true,
      lastError: null,
    });
  });

  it("treats active provider connections as healthy before ranking source readiness", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:10:00.000Z"),
            lastError: "Previous HubSpot refresh failed",
          },
          {
            provider: "HUBSPOT",
            status: "ACTIVE",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:10:00.000Z"),
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:10:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:10:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "connected",
      connected: true,
      lastError: null,
    });
  });

  it("marks sources errored when the selected provider connection credentials are expired", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:00:00.000Z"),
            expiresAt: new Date("2026-05-29T09:30:00.000Z"),
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:10:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:10:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "error",
      connected: false,
      lastSyncedAt: "2026-05-29T09:10:00.000Z",
      lastError: "Integration credentials expired.",
    });
  });

  it("keeps expired credential errors ahead of unfinished sync-run partial status", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:00:00.000Z"),
            expiresAt: new Date("2026-05-29T09:30:00.000Z"),
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:45:00.000Z"),
            completedAt: null,
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:45:00.000Z"),
            checkpoint: { cursor: "in-progress" },
            recordCount: 0,
            acceptedCount: 0,
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "error",
      connected: false,
      lastSyncedAt: null,
      lastError: "Integration credentials expired.",
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: null,
      },
    });
  });

  it("marks sources errored when selected provider connection expiry metadata is invalid", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:00:00.000Z"),
            expiresAt: "not-a-date",
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:10:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:10:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "error",
      connected: false,
      lastError: "Integration credential expiry is invalid.",
    });
  });

  it("keeps provider connection state visible when retained last sync metadata is invalid", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: "not-a-date",
            expiresAt: null,
            lastError: "HubSpot token refresh failed",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "error",
      connected: false,
      lastSyncedAt: null,
      lastError: "HubSpot token refresh failed",
    });
  });

  it("keeps provider connection state visible when connection timing metadata is invalid", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: "not-a-date",
            lastSyncedAt: null,
            expiresAt: null,
            lastError: "HubSpot returned malformed connection timing",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "error",
      connected: false,
      lastSyncedAt: null,
      lastError: "HubSpot returned malformed connection timing",
    });
  });

  it("keeps provider connection state visible when retained last sync metadata is future-skewed", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-30T09:30:00.000Z"),
            expiresAt: null,
            lastError: "HubSpot token refresh failed with a skewed sync timestamp",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "error",
      connected: false,
      lastSyncedAt: null,
      freshness: {
        lastSyncedAt: null,
        staleAfter: null,
        ageHours: null,
      },
      lastError: "HubSpot token refresh failed with a skewed sync timestamp",
    });
  });

  it("does not mark explicitly disconnected source connections as connected", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "DISCONNECTED",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: null,
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastError: null,
    });
  });

  it("unwraps single-value connection status arrays before source readiness analysis", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: ["disconnected"],
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: null,
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("HUBSPOT", "2026-05-29T09:00:00.000Z"),
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastError: null,
    });
  });

  it("treats a disconnected source as missing even when stale sync failures still exist", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: " disconnected ",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: null,
            lastError: null,
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:10:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:10:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "HubSpot sync failed before disconnect",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastError: null,
    });
  });

  it("prefers a newer same-scope disconnect over an older healthy source connection", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastError: null,
          },
          {
            provider: "HUBSPOT",
            status: "DISCONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:30:00.000Z"),
            lastSyncedAt: null,
            lastError: "User disconnected HubSpot",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastSyncedAt: null,
      lastError: "User disconnected HubSpot",
    });
  });

  it("orders same-scope disconnected source rows by disconnect event time instead of retained sync time", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastError: null,
          },
          {
            provider: "STRIPE",
            status: "DISCONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:30:00.000Z"),
            lastSyncedAt: new Date("2026-05-28T08:00:00.000Z"),
            lastError: "User disconnected Stripe after the last successful sync",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "missing",
      connected: false,
      lastSyncedAt: "2026-05-28T08:00:00.000Z",
      lastError: "User disconnected Stripe after the last successful sync",
    });
  });

  it("prefers a healthy provider connection over an errored organization peer connection", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "user_teammate",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-28T10:00:00.000Z"),
            lastError: "teammate token expired",
          },
          {
            provider: "HUBSPOT",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:30:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T09:30:00.000Z",
      lastError: null,
    });
  });

  it("ignores wrong-organization source connections returned by the data layer", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "CONNECTED",
            userId: "other_user",
            organizationId: "other_org",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:30:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastSyncedAt: null,
      lastError: null,
    });
  });

  it("filters source connection queries to required Imladris providers", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany,
      },
    });

    await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: {
            in: expect.arrayContaining(["HUBSPOT", "STRIPE", "MERCURY"]),
          },
        }),
      }),
    );
  });

  it("includes global fallback connection scope when querying sources for an organization context", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany,
      },
    });

    await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ]),
        }),
      }),
    );
  });

  it("does not mark a source connected from credentials alone before data sync evidence exists", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T09:00:00.000Z"),
            lastSyncedAt: null,
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
      status: "partial",
      connected: false,
      lastSyncedAt: null,
      lastError: "Linear is connected but no raw sync has completed yet.",
    });
  });

  it("uses legacy user-only connections under organization context when scoped credentials are missing", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: null,
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T09:00:00.000Z"),
            expiresAt: null,
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
      lastSyncedAt: "2026-05-29T09:00:00.000Z",
    });
  });

  it("uses the newest sync run across provider aliases for source readiness", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "META_PAGE",
            status: "ERROR",
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: new Date("2026-05-29T09:31:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:31:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "Meta page token expired",
          },
          {
            provider: "META_ADS",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
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

    const metaAds = sources.find((source) => source.key === "metaAds");
    expect(metaAds).toMatchObject({
      key: "metaAds",
      status: "error",
      connected: false,
      lastSyncedAt: "2026-05-29T09:31:00.000Z",
      lastError: "Meta page token expired",
      latestSyncRun: {
        status: "ERROR",
        errorCount: 1,
      },
    });
  });

  it("uses completedAt before startedAt when ranking source sync runs", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:05:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:05:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: null,
          },
          {
            provider: "GITHUB",
            status: "ERROR",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:30:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:30:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "GitHub backfill completed with an auth failure",
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
      status: "error",
      connected: false,
      lastSyncedAt: "2026-05-29T09:30:00.000Z",
      lastError: "GitHub backfill completed with an auth failure",
      latestSyncRun: {
        status: "ERROR",
        completedAt: "2026-05-29T09:30:00.000Z",
      },
    });
  });

  it("prefers current-user sync evidence over a newer errored organization peer sync run", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "ERROR",
            userId: "user_teammate",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: new Date("2026-05-29T09:31:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:31:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "Teammate Stripe sync token expired",
          },
          {
            provider: "STRIPE",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
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

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
      },
    });
  });

  it("prefers exact organization sync runs over newer legacy user-only sync runs", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "ERROR",
            userId: "user_1",
            organizationId: null,
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: new Date("2026-05-29T09:31:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:31:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "Legacy user-only Stripe sync token expired",
          },
          {
            provider: "STRIPE",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
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

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
      },
    });
  });

  it("uses legacy user-only sync runs under organization context when org sync evidence is missing", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "SUCCESS",
            userId: "user_1",
            organizationId: null,
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
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

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
      },
    });
  });

  it("uses global sync runs under organization context when scoped sync evidence is missing", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "SUCCESS",
            userId: null,
            organizationId: null,
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: { scope: "global" },
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

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
        checkpoint: { scope: "global" },
      },
    });
  });

  it("ignores wrong-organization sync runs returned by the data layer", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "HUBSPOT",
            status: "ERROR",
            userId: "other_user",
            organizationId: "other_org",
            startedAt: new Date("2026-05-29T09:30:00.000Z"),
            completedAt: new Date("2026-05-29T09:31:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:31:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "Wrong tenant HubSpot sync failed",
          },
          {
            provider: "HUBSPOT",
            status: "SUCCESS",
            userId: null,
            organizationId: "org_1",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "connected",
      connected: true,
      lastSyncedAt: "2026-05-29T08:03:00.000Z",
      lastError: null,
      latestSyncRun: {
        status: "SUCCESS",
        completedAt: "2026-05-29T08:03:00.000Z",
      },
    });
  });

  it("uses the newest snapshot across provider snapshot keys for source readiness", async () => {
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            providerKey: "instagram",
            status: "ERROR",
            capturedAt: new Date("2026-05-29T09:30:00.000Z"),
            expiresAt: new Date("2026-05-30T09:30:00.000Z"),
            lastError: "Instagram permissions expired",
          },
          {
            providerKey: "metaAds",
            status: "SUCCESS",
            capturedAt: new Date("2026-05-29T08:00:00.000Z"),
            expiresAt: new Date("2026-05-30T08:00:00.000Z"),
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

    const metaAds = sources.find((source) => source.key === "metaAds");
    expect(metaAds).toMatchObject({
      key: "metaAds",
      status: "error",
      connected: false,
      lastSnapshotAt: "2026-05-29T09:30:00.000Z",
      lastError: "Instagram permissions expired",
    });
  });

  it("queries delimiter-formatted snapshot provider key aliases before source readiness matching", async () => {
    const analyticsSnapshotFindMany = vi.fn(async (query) => {
      const providerKeys = (query as {
        where?: { providerKey?: { in?: string[] } };
      }).where?.providerKey?.in ?? [];
      return providerKeys.includes("google-analytics")
        ? [
            {
              providerKey: "google-analytics",
              status: "SUCCESS",
              capturedAt: new Date("2026-05-29T09:30:00.000Z"),
              expiresAt: new Date("2026-05-30T09:30:00.000Z"),
              lastError: null,
            },
          ]
        : [];
    });
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: analyticsSnapshotFindMany,
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const googleAnalytics = sources.find((source) => source.key === "googleAnalytics");
    expect(googleAnalytics).toMatchObject({
      key: "googleAnalytics",
      status: "connected",
      connected: true,
      lastSnapshotAt: "2026-05-29T09:30:00.000Z",
    });
    expect(analyticsSnapshotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining([
              "googleAnalytics",
              "google-analytics",
              "google_analytics",
            ]),
          },
        }),
      }),
    );
  });

  it("uses registry-backed legacy product snapshots for PostHog source readiness", async () => {
    const analyticsSnapshotFindMany = vi.fn(async (query) => {
      const providerKeys = (query as {
        where?: { providerKey?: { in?: string[] } };
      }).where?.providerKey?.in ?? [];
      return providerKeys.includes("product")
        ? [
            {
              providerKey: "product",
              status: "SUCCESS",
              capturedAt: new Date("2026-05-29T09:45:00.000Z"),
              expiresAt: new Date("2026-05-30T09:45:00.000Z"),
              lastError: null,
            },
          ]
        : [];
    });
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: analyticsSnapshotFindMany,
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const posthog = sources.find((source) => source.key === "posthog");
    expect(posthog).toMatchObject({
      key: "posthog",
      status: "connected",
      connected: true,
      lastSnapshotAt: "2026-05-29T09:45:00.000Z",
    });
    expect(analyticsSnapshotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining(["posthog", "product"]),
          },
        }),
      }),
    );
  });

  it("ignores future-dated snapshots when selecting source readiness evidence", async () => {
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            providerKey: "instagram",
            status: "ERROR",
            capturedAt: new Date("2026-05-30T09:30:00.000Z"),
            expiresAt: new Date("2026-05-31T09:30:00.000Z"),
            lastError: "Future Instagram snapshot should not be visible yet",
          },
          {
            providerKey: "metaAds",
            status: "SUCCESS",
            capturedAt: new Date("2026-05-29T08:00:00.000Z"),
            expiresAt: new Date("2026-05-30T08:00:00.000Z"),
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

    const metaAds = sources.find((source) => source.key === "metaAds");
    expect(metaAds).toMatchObject({
      key: "metaAds",
      status: "connected",
      connected: true,
      lastSnapshotAt: "2026-05-29T08:00:00.000Z",
      lastError: null,
    });
  });

  it("ignores wrong-user snapshots returned by the data layer", async () => {
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            userId: "other_user",
            providerKey: "hubspot",
            status: "SUCCESS",
            capturedAt: new Date("2026-05-29T09:30:00.000Z"),
            expiresAt: new Date("2026-05-30T09:30:00.000Z"),
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "missing",
      connected: false,
      lastSnapshotAt: null,
      lastError: null,
    });
  });

  it("marks snapshot-backed sources stale when snapshot expiry is invalid", async () => {
    const prisma = createPrismaMock({
      analyticsSnapshot: {
        findMany: vi.fn(async () => [
          {
            providerKey: "hubspot",
            status: "SUCCESS",
            capturedAt: new Date("2026-05-29T09:30:00.000Z"),
            expiresAt: "not-a-date",
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

    const hubspot = sources.find((source) => source.key === "hubspot");
    expect(hubspot).toMatchObject({
      key: "hubspot",
      status: "stale",
      connected: false,
      lastSnapshotAt: "2026-05-29T09:30:00.000Z",
    });
  });

  it("reports the error from the source state that drives readiness", async () => {
    const prisma = createPrismaMock({
      integrationConnection: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "CONNECTED",
            userId: "user_1",
            organizationId: "org_1",
            connectedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastSyncedAt: new Date("2026-05-29T08:00:00.000Z"),
            lastError: "old OAuth refresh warning",
          },
        ]),
      },
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "STRIPE",
            status: "ERROR",
            startedAt: new Date("2026-05-29T09:00:00.000Z"),
            completedAt: new Date("2026-05-29T09:01:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T09:01:00.000Z"),
            checkpoint: null,
            recordCount: 0,
            acceptedCount: 0,
            errorCount: 1,
            lastError: "Stripe invoice export failed",
          },
        ]),
      },
    });

    const sources = await buildImladrisSources({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const stripe = sources.find((source) => source.key === "stripe");
    expect(stripe).toMatchObject({
      key: "stripe",
      status: "error",
      lastError: "Stripe invoice export failed",
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

  it("explains partial source-health downgrades on ready canonical metrics", async () => {
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
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "marketing.pipeline_efficiency",
            department: "marketing",
            unit: "ratio",
            value: { ratio: 5.14 },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.9,
            warnings: [],
            calculationVersion: "marketing-pipeline-efficiency-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
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
      warnings: [
        "Metric is partial because Reddit Ads source data has partial sync coverage.",
      ],
    });
  });

  it("hydrates canonical metrics from latest Imladris metric values and lineage", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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

  it("unwraps provider-shaped lineage identifiers before returning public metric data", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
            warnings: [],
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
                sourceKey: { data: { key: "github" } },
                sourceType: { data: { type: "pull_request" } },
                sourceId: { data: { id: "repo/pull/7" } },
                rawRecordId: { data: { id: "raw_github_1" } },
                capturedAt: { value: "2026-05-29T08:05:00.000Z" },
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
      status: "ready",
      warnings: [],
      sourceLineage: expect.arrayContaining([
        expect.objectContaining({
          sourceKey: "github",
          sourceType: "pull_request",
          sourceId: "repo/pull/7",
          rawRecordId: "raw_github_1",
          capturedAt: "2026-05-29T08:05:00.000Z",
          status: "connected",
        }),
      ]),
    });
  });

  it("unwraps canonical metric value envelopes before returning public metric data", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("HUBSPOT", "2026-05-29T08:10:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: {
              values: {
                amount: 125000,
                currency: "USD",
              },
            },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.88,
            warnings: [],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
          {
            metricKey: "revenue.mrr",
            department: "revenue",
            unit: "currency",
            value: { amount: 32_000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "PARTIAL",
            confidence: 0.8,
            warnings: {
              data: {
                attributes: {
                  warnings: [" Stripe import completed with warnings. "],
                },
              },
              error: {
                detail: "HubSpot subscription join is partial.",
              },
            },
            calculationVersion: "revenue-mrr-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });
    const dashboard = await buildImladrisDashboard({
      prisma,
      context: CONTEXT,
      dashboardId: "finance",
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      status: "ready",
    });
    expect(dashboard?.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      status: "ready",
    });
  });

  it("unwraps JSON:API canonical metric value envelopes before returning public metric data", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("HUBSPOT", "2026-05-29T08:10:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: {
              data: {
                type: "canonical_metric_values",
                id: "metric_finance_net_burn",
                attributes: {
                  amount: 125000,
                  currency: "USD",
                },
              },
            },
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

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });
    const dashboard = await buildImladrisDashboard({
      prisma,
      context: CONTEXT,
      dashboardId: "finance",
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "finance.net_burn")?.value).toEqual({
      amount: 125000,
      currency: "USD",
    });
    expect(dashboard?.metrics.find((metric) => metric.key === "finance.net_burn")?.value).toEqual({
      amount: 125000,
      currency: "USD",
    });
  });

  it("unwraps single-value JSON:API canonical metric attributes before returning public metric data", async () => {
    const prisma = createPrismaMock({
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "development.delivery_health",
            department: "development",
            unit: "score",
            value: {
              data: {
                type: "canonical_metric_values",
                id: "metric_development_delivery_health",
                attributes: {
                  value: {
                    score: 91,
                    band: "healthy",
                  },
                },
              },
            },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "PARTIAL",
            confidence: 0.88,
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "development.delivery_health")?.value).toEqual({
      score: 91,
      band: "healthy",
    });
  });

  it("downgrades ready canonical metrics when lineage evidence is future-dated", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [
              {
                sourceKey: "github",
                sourceType: "pull_request",
                sourceId: "repo/pull/7",
                rawRecordId: "raw_github_1",
                capturedAt: new Date("2026-05-30T08:05:00.000Z"),
                metadata: { mergedCount: 7 },
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
      status: "partial",
      warnings: ["Metric lineage includes future-dated source evidence."],
    });
  });

  it("downgrades ready canonical metrics when lineage evidence timestamps are malformed", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [
              {
                sourceKey: "github",
                sourceType: "pull_request",
                sourceId: "repo/pull/7",
                rawRecordId: "raw_github_1",
                capturedAt: "not-a-date",
                metadata: { mergedCount: 7 },
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
      status: "partial",
      warnings: ["Metric lineage includes malformed source evidence timestamps."],
      sourceLineage: [
        expect.objectContaining({
          sourceKey: "github",
          capturedAt: null,
        }),
      ],
    });
  });

  it("downgrades ready canonical metrics when lineage evidence timestamps are missing", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
            warnings: [],
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
                capturedAt: null,
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
      status: "partial",
      warnings: ["Metric lineage is missing source evidence timestamps."],
    });
  });

  it("normalizes lineage source keys before validating metric evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
            warnings: [],
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
                sourceKey: " GITHUB ",
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
      status: "ready",
      warnings: [],
    });
    expect(deliveryHealth?.sourceLineage).toContainEqual(
      expect.objectContaining({
        sourceKey: "github",
        status: "connected",
      }),
    );
  });

  it("downgrades ready canonical metrics when lineage omits required source evidence", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [
              {
                sourceKey: "github",
                sourceType: "pull_request",
                sourceId: "repo/pull/7",
                rawRecordId: "raw_github_1",
                capturedAt: new Date("2026-05-29T08:05:00.000Z"),
                metadata: { mergedCount: 7 },
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
      status: "partial",
      warnings: ["Metric lineage is missing required source evidence."],
    });
  });

  it("downgrades ready canonical metrics when lineage references unexpected sources", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:15:00.000Z"),
        ]),
      },
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
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [
              {
                sourceKey: "stripe",
                sourceType: "subscription",
                sourceId: "sub_123",
                rawRecordId: "raw_stripe_1",
                capturedAt: new Date("2026-05-29T08:15:00.000Z"),
                metadata: { amount: 12000 },
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
      status: "partial",
      warnings: ["Metric lineage references sources outside this metric definition."],
      sourceLineage: [
        expect.objectContaining({
          sourceKey: "stripe",
          status: "connected",
        }),
      ],
    });
  });

  it("hydrates partial canonical metric values as partial instead of missing", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("REDDIT", "2026-05-29T08:00:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "marketing.pipeline_efficiency",
            department: "marketing",
            unit: "ratio",
            value: { ratio: 4.2 },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "PARTIAL",
            confidence: 0.61,
            warnings: ["Google Ads source data is missing."],
            calculationVersion: "marketing-pipeline-efficiency-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
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
      value: { ratio: 4.2 },
      status: "partial",
      confidence: 0.61,
      warnings: ["Google Ads source data is missing."],
    });
  });

  it("normalizes canonical metric confidence before returning public metric data", async () => {
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
            status: "PARTIAL",
            confidence: 1.7,
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 90_000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "PARTIAL",
            confidence: Number.NaN,
            warnings: [],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
          {
            metricKey: "revenue.mrr",
            department: "revenue",
            unit: "currency",
            value: { amount: 32_000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "PARTIAL",
            confidence: -0.4,
            warnings: [],
            calculationVersion: "revenue-mrr-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "development.delivery_health")).toMatchObject({
      confidence: 1,
    });
    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      confidence: 0,
    });
    expect(metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      confidence: 0,
    });
  });

  it("normalizes canonical metric warnings before returning public metric data", async () => {
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
            status: "PARTIAL",
            confidence: 0.8,
            warnings: "Linear sync is partial.",
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 90_000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "PARTIAL",
            confidence: 0.8,
            warnings: {
              data: {
                attributes: {
                  warnings: [" Mercury sync is stale. ", "", 42, null, "Stripe coverage is partial."],
                },
              },
              messages: [{ message: "HubSpot context is missing." }],
            },
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "development.delivery_health")).toMatchObject({
      warnings: ["Linear sync is partial."],
    });
    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      warnings: ["Mercury sync is stale.", "Stripe coverage is partial.", "HubSpot context is missing."],
    });
  });

  it("treats malformed canonical metric statuses as missing instead of throwing", async () => {
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
            status: 42,
            confidence: 0.8,
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "development.delivery_health")).toMatchObject({
      status: "missing",
    });
  });

  it("normalizes canonical metric status aliases before returning public metric data", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("LINEAR", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("GITHUB", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("POSTHOG", "2026-05-29T08:10:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "development.delivery_health",
            department: "development",
            unit: "score",
            value: 91,
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "complete",
            confidence: 0.8,
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 90_000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "ready-with-warnings",
            confidence: 0.7,
            warnings: ["Stripe coverage warning"],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "development.delivery_health")).toMatchObject({
      status: "ready",
      value: 91,
    });
    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      status: "partial",
      warnings: ["Stripe coverage warning"],
    });
  });

  it("ignores future-period canonical metric values when selecting board metrics", async () => {
    const findMany = vi.fn(async () => [
      {
        metricKey: "finance.net_burn",
        department: "finance",
        unit: "currency",
        value: { amount: 999999, currency: "USD" },
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-06-30T00:00:00.000Z"),
        status: "READY",
        confidence: 0.99,
        warnings: [],
        calculationVersion: "finance-net-burn-v1",
        computedAt: new Date("2026-05-29T09:30:00.000Z"),
        lineage: [],
      },
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
    ]);
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("HUBSPOT", "2026-05-29T08:10:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany,
      },
    });
    const now = new Date("2026-05-29T10:00:00.000Z");

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now,
    });

    const netBurn = metrics.find((metric) => metric.key === "finance.net_burn");
    expect(netBurn).toMatchObject({
      key: "finance.net_burn",
      value: { amount: 125000, currency: "USD" },
      periodEnd: "2026-05-29T00:00:00.000Z",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodEnd: {
            lte: now,
          },
        }),
      }),
    );
  });

  it("ignores future-computed canonical metric values when selecting board metrics", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("HUBSPOT", "2026-05-29T08:10:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 999999, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.99,
            warnings: [],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-30T00:00:00.000Z"),
            lineage: [],
          },
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

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const netBurn = metrics.find((metric) => metric.key === "finance.net_burn");
    expect(netBurn).toMatchObject({
      key: "finance.net_burn",
      value: { amount: 125000, currency: "USD" },
      computedAt: "2026-05-29T09:00:00.000Z",
    });
  });

  it("ignores canonical metric values with inverted reporting windows", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 999999, currency: "USD" },
            periodStart: new Date("2026-05-31T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.99,
            warnings: [],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:30:00.000Z"),
            lineage: [],
          },
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

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const netBurn = metrics.find((metric) => metric.key === "finance.net_burn");
    expect(netBurn).toMatchObject({
      key: "finance.net_burn",
      value: { amount: 125000, currency: "USD" },
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-05-29T00:00:00.000Z",
      computedAt: "2026-05-29T09:00:00.000Z",
    });
  });

  it("selects the latest canonical metric row even when the data layer returns rows out of order", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 180000, currency: "USD" },
            periodStart: new Date("2026-04-01T00:00:00.000Z"),
            periodEnd: new Date("2026-04-30T00:00:00.000Z"),
            status: "STALE",
            confidence: 0.45,
            warnings: ["Older Mercury materialization."],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-01T09:00:00.000Z"),
            lineage: [],
          },
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

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const netBurn = metrics.find((metric) => metric.key === "finance.net_burn");
    expect(netBurn).toMatchObject({
      key: "finance.net_burn",
      value: { amount: 125000, currency: "USD" },
      status: "ready",
      confidence: 0.88,
      periodEnd: "2026-05-29T00:00:00.000Z",
    });
  });

  it("degrades ready canonical metric status when a required source is stale", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-27T08:00:00.000Z"),
            completedAt: new Date("2026-05-27T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-27T08:03:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: null,
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "development.delivery_health",
            department: "development",
            unit: "score",
            value: { score: 91 },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.92,
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
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
      value: { score: 91 },
      status: "stale",
      confidence: 0.92,
      warnings: ["Metric is stale because GitHub source data is stale."],
    });
    expect(deliveryHealth?.sourceLineage).toContainEqual({
      sourceKey: "github",
      status: "stale",
    });
  });

  it("degrades ready canonical metric status when a required source is missing", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          {
            provider: "LINEAR",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T08:00:00.000Z"),
            completedAt: new Date("2026-05-29T08:03:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:03:00.000Z"),
            checkpoint: null,
            recordCount: 45,
            acceptedCount: 45,
            errorCount: 0,
            lastError: null,
          },
          {
            provider: "GITHUB",
            status: "SUCCESS",
            startedAt: new Date("2026-05-29T08:05:00.000Z"),
            completedAt: new Date("2026-05-29T08:08:00.000Z"),
            windowStart: new Date("2025-04-29T10:00:00.000Z"),
            windowEnd: new Date("2026-05-29T08:08:00.000Z"),
            checkpoint: null,
            recordCount: 120,
            acceptedCount: 120,
            errorCount: 0,
            lastError: null,
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "development.delivery_health",
            department: "development",
            unit: "score",
            value: { score: 91 },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.92,
            warnings: [],
            calculationVersion: "development-delivery-health-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            lineage: [],
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
      value: { score: 91 },
      status: "missing",
      warnings: ["Metric is missing because PostHog source data is missing."],
    });
    expect(deliveryHealth?.sourceLineage).toContainEqual({
      sourceKey: "posthog",
      status: "missing",
    });
  });

  it("queries canonical metric values for user-owned and organization-owned scope", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createPrismaMock({
      imladrisCanonicalMetricValue: {
        findMany,
      },
    });

    await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
  });

  it("normalizes blank read context before querying and matching canonical metrics", async () => {
    const canonicalFindMany = vi.fn(async () => [
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
        userId: "user_1",
        organizationId: null,
        lineage: [],
      },
    ]);
    const prisma = createPrismaMock({
      imladrisCanonicalMetricValue: {
        findMany: canonicalFindMany,
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(canonicalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      confidence: 0.88,
    });
  });

  it("uses organization-level canonical metric values and ignores wrong-scope rows", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("HUBSPOT", "2026-05-29T08:10:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 999999, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.99,
            warnings: [],
            calculationVersion: "finance-net-burn-v1",
            computedAt: new Date("2026-05-29T09:30:00.000Z"),
            userId: "other_user",
            organizationId: "org_1",
            lineage: [],
          },
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
            userId: null,
            organizationId: "org_1",
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    const netBurn = metrics.find((metric) => metric.key === "finance.net_burn");
    expect(netBurn).toMatchObject({
      key: "finance.net_burn",
      value: { amount: 125000, currency: "USD" },
      confidence: 0.88,
    });
  });

  it("prefers user-scoped canonical metric values over organization fallbacks for the same period", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 999999, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.99,
            warnings: [],
            calculationVersion: "finance-net-burn-org-v1",
            computedAt: new Date("2026-05-29T09:30:00.000Z"),
            userId: null,
            organizationId: "org_1",
            lineage: [],
          },
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
            calculationVersion: "finance-net-burn-user-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            userId: "user_1",
            organizationId: "org_1",
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      confidence: 0.88,
      calculationVersion: "finance-net-burn-user-v1",
    });
  });

  it("does not let newer global canonical metrics override scoped metric values", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 999999, currency: "USD" },
            periodStart: new Date("2026-05-30T00:00:00.000Z"),
            periodEnd: new Date("2026-05-30T23:59:59.999Z"),
            status: "READY",
            confidence: 0.99,
            warnings: [],
            calculationVersion: "finance-net-burn-global-v1",
            computedAt: new Date("2026-05-31T00:00:00.000Z"),
            userId: null,
            organizationId: null,
            lineage: [],
          },
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
            calculationVersion: "finance-net-burn-scoped-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            userId: "user_1",
            organizationId: "org_1",
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-31T12:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      confidence: 0.88,
      calculationVersion: "finance-net-burn-scoped-v1",
      periodEnd: "2026-05-29T00:00:00.000Z",
    });
  });

  it("uses legacy user-only canonical metrics under organization context", async () => {
    const canonicalFindMany = vi.fn(async () => [
      {
        metricKey: "finance.net_burn",
        department: "finance",
        unit: "currency",
        value: { amount: 999999, currency: "USD" },
        periodStart: new Date("2026-05-01T00:00:00.000Z"),
        periodEnd: new Date("2026-05-29T00:00:00.000Z"),
        status: "READY",
        confidence: 0.99,
        warnings: [],
        calculationVersion: "finance-net-burn-org-v1",
        computedAt: new Date("2026-05-29T09:30:00.000Z"),
        userId: null,
        organizationId: "org_1",
        lineage: [],
      },
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
        calculationVersion: "finance-net-burn-legacy-user-v1",
        computedAt: new Date("2026-05-29T09:00:00.000Z"),
        userId: "user_1",
        organizationId: null,
        lineage: [],
      },
    ]);
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: canonicalFindMany,
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(canonicalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 125000, currency: "USD" },
      confidence: 0.88,
      calculationVersion: "finance-net-burn-legacy-user-v1",
    });
  });

  it("uses global canonical metrics under organization context when scoped metric values are missing", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
        ]),
      },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          {
            metricKey: "finance.net_burn",
            department: "finance",
            unit: "currency",
            value: { amount: 123000, currency: "USD" },
            periodStart: new Date("2026-05-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-29T00:00:00.000Z"),
            status: "READY",
            confidence: 0.7,
            warnings: [],
            calculationVersion: "finance-net-burn-global-v1",
            computedAt: new Date("2026-05-29T09:00:00.000Z"),
            userId: null,
            organizationId: null,
            lineage: [],
          },
        ]),
      },
    });

    const metrics = await buildImladrisMetrics({
      prisma,
      context: CONTEXT,
      now: new Date("2026-05-29T10:00:00.000Z"),
    });

    expect(metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      value: { amount: 123000, currency: "USD" },
      status: "ready",
      confidence: 0.7,
      calculationVersion: "finance-net-burn-global-v1",
    });
  });

  it("renders dashboards from canonical metric values", async () => {
    const prisma = createPrismaMock({
      imladrisSourceSyncRun: {
        findMany: vi.fn(async () => [
          successfulSyncRun("MERCURY", "2026-05-29T08:00:00.000Z"),
          successfulSyncRun("STRIPE", "2026-05-29T08:05:00.000Z"),
          successfulSyncRun("HUBSPOT", "2026-05-29T08:10:00.000Z"),
        ]),
      },
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
