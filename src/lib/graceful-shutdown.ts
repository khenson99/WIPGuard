import type { Server } from "node:http";
import type { Server as IOServer } from "socket.io";
import { prisma } from "./prisma";

const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;

let inFlightRequests = 0;
let isShuttingDown = false;

/**
 * Middleware to track in-flight HTTP requests.
 * Attach this early in the Express middleware chain.
 */
export function trackInFlightRequests(
  _req: unknown,
  _res: unknown,
  next: () => void
): void {
  if (isShuttingDown) {
    // During shutdown, reject new requests with 503
    const res = _res as { status: (code: number) => { json: (body: unknown) => void } };
    res.status(503).json({ error: "Server is shutting down" });
    return;
  }
  inFlightRequests++;
  const res = _res as { on: (event: string, fn: () => void) => void };
  res.on("finish", () => {
    inFlightRequests--;
  });
  res.on("close", () => {
    inFlightRequests--;
  });
  next();
}

/**
 * Wait until all in-flight requests have completed, or until the timeout.
 */
export function drainConnections(timeoutMs: number = DEFAULT_DRAIN_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      if (inFlightRequests <= 0) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        console.warn(
          `[graceful-shutdown] Drain timeout reached with ${inFlightRequests} in-flight request(s) remaining`
        );
        resolve(false);
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };

    check();
  });
}

export interface ShutdownOptions {
  drainTimeoutMs?: number;
  onShutdownStart?: () => void | Promise<void>;
  /** Optional outbox worker stop function */
  stopOutboxWorker?: () => void | Promise<void>;
}

/**
 * Register SIGTERM and SIGINT handlers for graceful shutdown.
 *
 * Shutdown sequence:
 *  1. Stop accepting new HTTP connections
 *  2. Gracefully disconnect all WebSocket clients
 *  3. Stop the outbox worker (if provided)
 *  4. Wait for in-flight requests to drain (with timeout)
 *  5. Disconnect from the database
 *  6. Exit the process
 */
export function registerShutdownHandlers(
  server: Server,
  io: IOServer,
  options: ShutdownOptions = {}
): void {
  const { drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS, onShutdownStart, stopOutboxWorker } = options;

  let shutdownInProgress = false;

  const shutdown = async (signal: string) => {
    if (shutdownInProgress) {
      console.warn(`[graceful-shutdown] Already shutting down, ignoring duplicate ${signal}`);
      return;
    }
    shutdownInProgress = true;
    isShuttingDown = true;

    console.info(`[graceful-shutdown] Shutdown initiated by ${signal}`);

    try {
      // Optional callback for custom pre-shutdown logic
      if (onShutdownStart) {
        await onShutdownStart();
      }

      // 1. Stop accepting new connections
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.warn("[graceful-shutdown] Error closing HTTP server:", err.message);
            reject(err);
          } else {
            console.info("[graceful-shutdown] HTTP server closed, no longer accepting connections");
            resolve();
          }
        });
      }).catch(() => {
        // Continue shutdown even if server.close fails
      });

      // 2. Gracefully disconnect WebSocket clients
      try {
        io.disconnectSockets(true);
        console.info("[graceful-shutdown] WebSocket connections disconnected");
      } catch (err) {
        console.warn("[graceful-shutdown] Error disconnecting WebSocket sockets:", err);
      }

      // 3. Stop outbox worker if provided
      if (stopOutboxWorker) {
        try {
          await stopOutboxWorker();
          console.info("[graceful-shutdown] Outbox worker stopped");
        } catch (err) {
          console.warn("[graceful-shutdown] Error stopping outbox worker:", err);
        }
      }

      // 4. Wait for in-flight requests to complete
      const drained = await drainConnections(drainTimeoutMs);
      if (drained) {
        console.info("[graceful-shutdown] All in-flight requests completed");
      } else {
        console.warn("[graceful-shutdown] Proceeding with shutdown despite pending requests");
      }

      // 5. Close database connection pool
      try {
        await prisma.$disconnect();
        console.info("[graceful-shutdown] Database connection closed");
      } catch (err) {
        console.warn("[graceful-shutdown] Error disconnecting database:", err);
      }

      console.info("[graceful-shutdown] Shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[graceful-shutdown] Unexpected error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/** Exposed for testing purposes */
export function _getInFlightCount(): number {
  return inFlightRequests;
}

/** Exposed for testing purposes */
export function _resetState(): void {
  inFlightRequests = 0;
  isShuttingDown = false;
}

export function getIsShuttingDown(): boolean {
  return isShuttingDown;
}
