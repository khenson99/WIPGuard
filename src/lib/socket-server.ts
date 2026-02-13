import { Server as IOServer } from "socket.io";
import type { Server as HTTPServer } from "http";

// Global singleton so Next.js hot-reload doesn't create duplicates
const globalForIO = globalThis as unknown as { _io?: IOServer };

export function getIO(): IOServer | null {
  return globalForIO._io ?? null;
}

export function initIO(httpServer: HTTPServer): IOServer {
  if (globalForIO._io) return globalForIO._io;

  const io = new IOServer(httpServer, {
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log("[socket.io] client connected:", socket.id);

    socket.on("join-board", () => {
      socket.join("board");
    });

    socket.on("disconnect", () => {
      console.log("[socket.io] client disconnected:", socket.id);
    });
  });

  globalForIO._io = io;
  return io;
}
