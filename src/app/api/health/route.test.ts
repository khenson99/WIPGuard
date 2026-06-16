import { beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../../../package.json";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
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
        totalConnectRetries: 0,
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
      },
      uptime: 1234,
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
        totalConnectRetries: 1,
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
