import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import {
  extractSessionToken,
  getSessionFromToken,
} from "@/lib/socket-auth";

let io: SocketIOServer | null = null;

const DASHBOARD_ROOMS = new Set([
  "operating",
  "finance",
  "development",
  "marketing",
  "sales",
  "customer-success",
]);

export function getIO(): SocketIOServer | null {
  return io;
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    path: "/api/socket",
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // ─── Authentication Middleware ───────────────────────────────────────
  // Validates the session cookie before allowing a WebSocket connection.
  // Rejects unauthenticated clients with an "Unauthorized" error.
  io.use(async (socket: Socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const token = extractSessionToken(cookieHeader);

      if (!token) {
        console.warn(
          "[socket] Connection rejected: no session token found"
        );
        return next(new Error("Unauthorized: No session token"));
      }

      const sessionData = await getSessionFromToken(token);

      if (!sessionData) {
        console.warn(
          "[socket] Connection rejected: invalid or expired session"
        );
        return next(new Error("Unauthorized: Invalid session"));
      }

      // Attach user data to the socket for downstream use
      socket.data.userId = sessionData.userId;
      socket.data.email = sessionData.email;

      next();
    } catch (error) {
      console.error("[socket] Auth middleware error:", error);
      next(new Error("Unauthorized: Authentication failed"));
    }
  });

  // ─── Connection Handler ─────────────────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    console.log(
      `[socket] User ${userId} connected (socket ${socket.id})`
    );

    // Join an Imladris dashboard room for provider-derived metric refreshes.
    socket.on(
      "dashboard:subscribe",
      (dashboard: string, callback?: (response: { ok: boolean; error?: string }) => void) => {
        if (!dashboard || typeof dashboard !== "string" || !DASHBOARD_ROOMS.has(dashboard)) {
          const msg = "Invalid dashboard";
          console.warn(`[socket] ${msg} from user ${userId}`);
          if (callback) callback({ ok: false, error: msg });
          return;
        }

        const room = `dashboard:${dashboard}`;
        socket.join(room);
        console.log(`[socket] User ${userId} joined room ${room}`);
        if (callback) callback({ ok: true });
      }
    );

    socket.on("dashboard:unsubscribe", (dashboard: string) => {
      if (!dashboard || typeof dashboard !== "string" || !DASHBOARD_ROOMS.has(dashboard)) return;
      const room = `dashboard:${dashboard}`;
      socket.leave(room);
      console.log(`[socket] User ${userId} left room ${room}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `[socket] User ${userId} disconnected (${reason})`
      );
    });
  });

  return io;
}

/** @deprecated Use initSocketServer instead */
export const initIO = initSocketServer;
