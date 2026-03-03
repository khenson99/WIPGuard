/**
 * Integration helper for wiring graceful shutdown into the server.
 *
 * Usage in server.ts:
 *
 *   import { setupGracefulShutdown } from "./lib/graceful-shutdown.integration";
 *
 *   const httpServer = createServer(app);
 *   const io = new Server(httpServer);
 *
 *   // Add in-flight request tracking
 *   app.use(trackInFlightRequests);
 *
 *   // Register shutdown handlers
 *   setupGracefulShutdown(httpServer, io, { stopOutboxWorker });
 */

import type { Server } from "node:http";
import type { Server as IOServer } from "socket.io";
import {
  registerShutdownHandlers,
  type ShutdownOptions,
} from "./graceful-shutdown";

export { trackInFlightRequests } from "./graceful-shutdown";

export function setupGracefulShutdown(
  server: Server,
  io: IOServer,
  options?: ShutdownOptions
): void {
  registerShutdownHandlers(server, io, options);
  console.info("[graceful-shutdown] Handlers registered for SIGTERM and SIGINT");
}
