/**
 * Database Connection Pool Monitor
 *
 * Tracks pool utilization metrics including:
 * - Active vs idle connections
 * - Connection wait times
 * - Pool exhaustion events
 * - Error counts
 *
 * @see Issue #378
 */

import type { Pool } from "pg";

/**
 * pg Pool exposes these runtime properties that are not in the @types/pg typings.
 */
interface PoolInternals {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  maxPoolSize: number;
  totalConnectionsCreated: number;
  totalConnectionErrors: number;
  totalPoolExhaustionEvents: number;
  avgConnectionWaitMs: number;
  lastError: string | null;
  lastErrorAt: string | null;
  uptimeMs: number;
}

/**
 * How long after a pool-exhaustion event the health status stays "critical".
 * Exhaustion previously latched critical forever (a non-zero cumulative
 * counter), so a single >5 s connection wait early in a container's life made
 * /api/health report a false, permanent 503 for the rest of that process —
 * wrong for any monitor/alert/health check consuming it. Recency-based instead,
 * so the status reflects live conditions while the event stays in the counter.
 */
const EXHAUSTION_CRITICAL_WINDOW_MS = 60_000;

class PoolMonitor {
  private totalConnectionsCreated = 0;
  private totalConnectionErrors = 0;
  private totalPoolExhaustionEvents = 0;
  private lastExhaustionAt: number | null = null;
  private connectionWaitTimes: number[] = [];
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;
  private startTime: number = Date.now();
  private pool: Pool | null = null;
  private maxPoolSize: number = 0;
  private isAttached = false;

  /**
   * Attach monitoring hooks to a pg Pool instance.
   * Should be called once during initialization.
   */
  attach(pool: Pool, maxPoolSize: number): void {
    if (this.isAttached) {
      console.warn("[PoolMonitor] Already attached to a pool, skipping.");
      return;
    }

    this.pool = pool;
    this.maxPoolSize = maxPoolSize;
    this.isAttached = true;
    this.startTime = Date.now();

    pool.on("connect", () => {
      this.totalConnectionsCreated++;
      this.logDebug(
        `Connection created (total created: ${this.totalConnectionsCreated})`
      );
    });

    pool.on("acquire", () => {
      this.logDebug(
        `Connection acquired (active: ${this.getActiveCount()}, idle: ${this.getIdleCount()})`
      );
    });

    pool.on("release", () => {
      this.logDebug(
        `Connection released (active: ${this.getActiveCount()}, idle: ${this.getIdleCount()})`
      );
    });

    pool.on("remove", () => {
      this.logDebug(
        `Connection removed (total: ${this.getTotalCount()})`
      );
    });

    pool.on("error", (err: Error) => {
      this.totalConnectionErrors++;
      this.lastError = err.message;
      this.lastErrorAt = new Date().toISOString();
      console.error(
        `[PoolMonitor] Pool error #${this.totalConnectionErrors}: ${err.message}`
      );
    });

    console.log(
      `[PoolMonitor] Attached to pool (max: ${maxPoolSize} connections)`
    );
  }

  /**
   * Record a connection wait time for metrics tracking.
   * Call this when a query completes to track how long it waited for a connection.
   */
  recordWaitTime(waitMs: number): void {
    this.connectionWaitTimes.push(waitMs);
    // Keep only last 1000 samples to prevent memory growth
    if (this.connectionWaitTimes.length > 1000) {
      this.connectionWaitTimes = this.connectionWaitTimes.slice(-500);
    }

    // Detect pool exhaustion: if wait time exceeds 5 seconds
    if (waitMs > 5000) {
      this.totalPoolExhaustionEvents++;
      this.lastExhaustionAt = Date.now();
      console.warn(
        `[PoolMonitor] Pool exhaustion detected! Wait time: ${waitMs}ms (event #${this.totalPoolExhaustionEvents})`
      );
    }
  }

  /**
   * Check if pool utilization is above a warning threshold.
   */
  isPoolUnderPressure(): boolean {
    if (!this.pool) return false;
    const utilization = this.getActiveCount() / this.maxPoolSize;
    return utilization > 0.8;
  }

  /**
   * Get current pool metrics snapshot.
   */
  getMetrics(): PoolMetrics {
    const avgWait =
      this.connectionWaitTimes.length > 0
        ? this.connectionWaitTimes.reduce((a, b) => a + b, 0) /
          this.connectionWaitTimes.length
        : 0;

    return {
      totalConnections: this.getTotalCount(),
      activeConnections: this.getActiveCount(),
      idleConnections: this.getIdleCount(),
      waitingRequests: this.getWaitingCount(),
      maxPoolSize: this.maxPoolSize,
      totalConnectionsCreated: this.totalConnectionsCreated,
      totalConnectionErrors: this.totalConnectionErrors,
      totalPoolExhaustionEvents: this.totalPoolExhaustionEvents,
      avgConnectionWaitMs: Math.round(avgWait * 100) / 100,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      uptimeMs: Date.now() - this.startTime,
    };
  }

  /**
   * Get a summary suitable for health checks.
   */
  getHealthStatus(): {
    status: "healthy" | "warning" | "critical";
    pool: PoolMetrics;
  } {
    const metrics = this.getMetrics();
    let status: "healthy" | "warning" | "critical" = "healthy";

    if (metrics.maxPoolSize > 0) {
      const utilization = metrics.activeConnections / metrics.maxPoolSize;
      if (utilization > 0.9 || metrics.waitingRequests > 0) {
        status = "critical";
      } else if (utilization > 0.7) {
        status = "warning";
      }
    }

    // Recent exhaustion marks the pool critical; older events stay visible in
    // the cumulative counter but no longer latch the status (a latched 503
    // would keep /api/health reporting failure long after one transient stall).
    if (
      this.lastExhaustionAt !== null &&
      Date.now() - this.lastExhaustionAt < EXHAUSTION_CRITICAL_WINDOW_MS
    ) {
      status = "critical";
    }

    return { status, pool: metrics };
  }

  private getPoolInternals(): PoolInternals | null {
    return this.pool ? (this.pool as unknown as PoolInternals) : null;
  }

  private getActiveCount(): number {
    // pg Pool exposes totalCount, idleCount, waitingCount
    const internals = this.getPoolInternals();
    return internals ? internals.totalCount - internals.idleCount : 0;
  }

  private getIdleCount(): number {
    const internals = this.getPoolInternals();
    return internals?.idleCount ?? 0;
  }

  private getTotalCount(): number {
    const internals = this.getPoolInternals();
    return internals?.totalCount ?? 0;
  }

  private getWaitingCount(): number {
    const internals = this.getPoolInternals();
    return internals?.waitingCount ?? 0;
  }

  private logDebug(message: string): void {
    if (process.env.DB_POOL_DEBUG === "true") {
      console.log(`[PoolMonitor] ${message}`);
    }
  }
}

// Singleton instance
export const poolMonitor = new PoolMonitor();
