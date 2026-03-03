import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import {
  extractSessionToken,
  getSessionFromToken,
  verifyProjectAccess,
} from "@/lib/socket-auth";

let io: SocketIOServer | null = null;

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

    // Join a project-scoped room after verifying access
    socket.on(
      "join-board",
      async (projectId: string, callback?: (response: { ok: boolean; error?: string }) => void) => {
        if (!projectId || typeof projectId !== "string") {
          const msg = "Invalid projectId";
          console.warn(`[socket] ${msg} from user ${userId}`);
          if (callback) callback({ ok: false, error: msg });
          return;
        }

        const hasAccess = await verifyProjectAccess(userId, projectId);

        if (!hasAccess) {
          const msg = `Access denied to project ${projectId}`;
          console.warn(`[socket] User ${userId}: ${msg}`);
          if (callback) callback({ ok: false, error: msg });
          return;
        }

        const room = `project:${projectId}`;
        socket.join(room);
        console.log(`[socket] User ${userId} joined room ${room}`);
        if (callback) callback({ ok: true });
      }
    );

    // Leave a project-scoped room
    socket.on("leave-board", (projectId: string) => {
      if (!projectId || typeof projectId !== "string") return;
      const room = `project:${projectId}`;
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
