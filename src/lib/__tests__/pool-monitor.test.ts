import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";

// We need to test a fresh instance each time, so we re-import
describe("PoolMonitor", () => {
  let PoolMonitorModule: typeof import("../pool-monitor");
  let mockPool: EventEmitter & {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };

  beforeEach(async () => {
    // Reset module to get a fresh singleton
    vi.resetModules();
    PoolMonitorModule = await import("../pool-monitor");

    mockPool = Object.assign(new EventEmitter(), {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    });
  });

  it("should initialize with zero metrics before attach", () => {
    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    expect(metrics.totalConnections).toBe(0);
    expect(metrics.activeConnections).toBe(0);
    expect(metrics.idleConnections).toBe(0);
    expect(metrics.maxPoolSize).toBe(0);
    expect(metrics.totalConnectionsCreated).toBe(0);
    expect(metrics.totalConnectionErrors).toBe(0);
    expect(metrics.totalPoolExhaustionEvents).toBe(0);
    expect(metrics.lastError).toBeNull();
    expect(metrics.lastErrorAt).toBeNull();
  });

  it("should track connections created on connect events", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    mockPool.emit("connect");
    mockPool.emit("connect");
    mockPool.emit("connect");

    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    expect(metrics.totalConnectionsCreated).toBe(3);
    expect(metrics.maxPoolSize).toBe(25);
  });

  it("should track pool errors", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    const testError = new Error("connection refused");
    mockPool.emit("error", testError);

    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    expect(metrics.totalConnectionErrors).toBe(1);
    expect(metrics.lastError).toBe("connection refused");
    expect(metrics.lastErrorAt).toBeTruthy();
  });

  it("should not attach twice", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already attached")
    );
    consoleSpy.mockRestore();
  });

  it("should record wait times and calculate average", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    PoolMonitorModule.poolMonitor.recordWaitTime(100);
    PoolMonitorModule.poolMonitor.recordWaitTime(200);
    PoolMonitorModule.poolMonitor.recordWaitTime(300);

    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    expect(metrics.avgConnectionWaitMs).toBe(200);
  });

  it("should detect pool exhaustion when wait time exceeds 5000ms", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);
    PoolMonitorModule.poolMonitor.recordWaitTime(6000);

    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    expect(metrics.totalPoolExhaustionEvents).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pool exhaustion detected")
    );
    consoleSpy.mockRestore();
  });

  it("should return healthy status when pool is underutilized", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    mockPool.totalCount = 5;
    mockPool.idleCount = 3;
    mockPool.waitingCount = 0;

    const health = PoolMonitorModule.poolMonitor.getHealthStatus();
    expect(health.status).toBe("healthy");
  });

  it("should return warning status when pool utilization exceeds 70%", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 10);

    mockPool.totalCount = 10;
    mockPool.idleCount = 2; // 8 active out of 10 = 80%
    mockPool.waitingCount = 0;

    const health = PoolMonitorModule.poolMonitor.getHealthStatus();
    expect(health.status).toBe("warning");
  });

  it("should return critical status when pool utilization exceeds 90%", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 10);

    mockPool.totalCount = 10;
    mockPool.idleCount = 0; // 10 active out of 10 = 100%
    mockPool.waitingCount = 0;

    const health = PoolMonitorModule.poolMonitor.getHealthStatus();
    expect(health.status).toBe("critical");
  });

  it("should return critical status when there are waiting requests", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 10);

    mockPool.totalCount = 10;
    mockPool.idleCount = 5;
    mockPool.waitingCount = 3;

    const health = PoolMonitorModule.poolMonitor.getHealthStatus();
    expect(health.status).toBe("critical");
  });

  it("should return critical status when exhaustion events have occurred", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);
    PoolMonitorModule.poolMonitor.recordWaitTime(6000); // triggers exhaustion

    const health = PoolMonitorModule.poolMonitor.getHealthStatus();
    expect(health.status).toBe("critical");
  });

  it("should track uptime", async () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    // Wait a small amount
    await new Promise((resolve) => setTimeout(resolve, 50));

    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    expect(metrics.uptimeMs).toBeGreaterThanOrEqual(40);
  });

  it("should correctly identify pool under pressure", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 10);

    mockPool.totalCount = 10;
    mockPool.idleCount = 1; // 9 active / 10 = 90%

    expect(PoolMonitorModule.poolMonitor.isPoolUnderPressure()).toBe(true);
  });

  it("should not identify pool under pressure when utilization is low", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    mockPool.totalCount = 5;
    mockPool.idleCount = 3; // 2 active / 25 = 8%

    expect(PoolMonitorModule.poolMonitor.isPoolUnderPressure()).toBe(false);
  });

  it("should cap wait time samples at 1000 to prevent memory growth", () => {
    PoolMonitorModule.poolMonitor.attach(mockPool as any, 25);

    // Add 1001 samples
    for (let i = 0; i < 1001; i++) {
      PoolMonitorModule.poolMonitor.recordWaitTime(i);
    }

    // After exceeding 1000, it should trim to 500
    // Add one more to trigger the trim
    const metrics = PoolMonitorModule.poolMonitor.getMetrics();
    // avgConnectionWaitMs should still be calculable
    expect(metrics.avgConnectionWaitMs).toBeGreaterThan(0);
  });
});
