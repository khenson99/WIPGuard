import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";
import type { Socket } from "net";
import { initIO } from "@/lib/socket-server";

interface SocketServer extends HTTPServer {
  io?: ReturnType<typeof initIO>;
}

interface SocketResponse extends NextApiResponse {
  socket: Socket & { server: SocketServer };
}

export const config = {
  api: { bodyParser: false },
};

export default function handler(
  _req: NextApiRequest,
  res: SocketResponse,
) {
  if (!res.socket.server.io) {
    console.log("[socket.io] Initializing Socket.IO server...");
    const io = initIO(res.socket.server as HTTPServer);
    res.socket.server.io = io;
  }

  res.status(200).json({ ok: true });
}
