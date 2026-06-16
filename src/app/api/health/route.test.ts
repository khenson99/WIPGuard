import { beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../../../package.json";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/pool-monitor", () => ({
  poolMonitor: {
    recordWaitTime: vi.fn(),
    getHealthStatus: vi.fn(),
  },
}));

describe("GET /api/health", () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    const { prisma } = await import("@/lib/prisma");
    const { poolMonitor } = await import("@/lib/pool-monitor");

    vi.mocked(prisma.$queryRaw).mockResolvedValue(undefined as never);
    // Storage check: ~5 GB database against the default 50 GB volume.
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { size: BigInt(5_000_000_000) },
    ] as never);
    vi.mocked(poolMonitor.getHealthStatus).mockReturnValue({
      status: "healthy",
      pool: {
        totalConnections: 4,
        activeConnections: 1,
        idleConnections: 3,
        waitingRequests: 0,
        maxPoolSize: 10,
        totalConnectionsCreated: 4,
        totalConnectionErrors: 0,
        totalPoolExhaustionEvents: 0,
        avgConnectionWaitMs: 5,
        lastError: null,
        lastErrorAt: null,
        uptimeMs: 1234,
      },
    });
  });

  it("returns versioned health data when the database is reachable", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      version: packageJson.version,
      checks: {
        database: {
          status: "connected",
        },
        connectionPool: {
          status: "healthy",
          active: 1,
          idle: 3,
          waiting: 0,
        },
        storage: {
          status: "ok",
          databaseSizeMb: 5000,
          volumeCapacityMb: 50000,
          usagePercent: 10,
        },
      },
      uptime: 1234,
    });
  });

  it("reports a storage warning without failing the health check", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { prisma } = await import("@/lib/prisma");
    // 40 GB of 50 GB = 80% -> above the 75% warn threshold.
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { size: BigInt(40_000_000_000) },
    ] as never);

    try {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.checks.storage).toMatchObject({
        status: "warning",
        databaseSizeMb: 40000,
        usagePercent: 80,
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[health:storage]",
        expect.stringContaining('"warning"'),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns 503 degraded when disk usage crosses the critical threshold", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { prisma } = await import("@/lib/prisma");
    // 46.5 GB of 50 GB = 93% -> the June 2026 incident level.
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { size: BigInt(46_500_000_000) },
    ] as never);

    try {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.status).toBe("degraded");
      expect(body.checks.storage).toMatchObject({
        status: "critical",
        usagePercent: 93,
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("degrades the storage check to unknown when the size query fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(
      new Error("permission denied"),
    );

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.storage).toMatchObject({
      status: "unknown",
      error: "permission denied",
    });
  });

  it("returns 503 when the database check fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { prisma } = await import("@/lib/prisma");
    const { poolMonitor } = await import("@/lib/pool-monitor");

    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("db unavailable"));
    vi.mocked(poolMonitor.getHealthStatus).mockReturnValue({
      status: "critical",
      pool: {
        totalConnections: 4,
        activeConnections: 4,
        idleConnections: 0,
        waitingRequests: 2,
        maxPoolSize: 4,
        totalConnectionsCreated: 4,
        totalConnectionErrors: 2,
        totalPoolExhaustionEvents: 1,
        avgConnectionWaitMs: 7500,
        lastError: "db unavailable",
        lastErrorAt: "2026-03-08T00:00:00.000Z",
        uptimeMs: 4321,
      },
    });

    try {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        status: "error",
        version: packageJson.version,
        checks: {
          database: {
            status: "disconnected",
            error: "db unavailable",
          },
          connectionPool: {
            status: "critical",
            waiting: 2,
            errors: 2,
            exhaustionEvents: 1,
          },
        },
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
