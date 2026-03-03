import { type Server as IOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createRedisClients } from "./redis-client";

/**
 * Configures the Socket.IO server with the Redis adapter for horizontal scaling.
 * Falls back to the default in-memory adapter if Redis is not available.
 *
 * @param io - The Socket.IO server instance
 * @returns {Promise<boolean>} true if Redis adapter was configured, false if using in-memory
 */
export async function configureSocketAdapter(
  io: IOServer
): Promise<boolean> {
  try {
    const clients = await createRedisClients();

    if (!clients) {
      console.log(
        "[Socket.IO] Using default in-memory adapter (no Redis configured)"
      );
      return false;
    }

    const { pubClient, subClient } = clients;

    io.adapter(createAdapter(pubClient, subClient));

    console.log(
      "[Socket.IO] Redis adapter configured — horizontal scaling enabled"
    );
    return true;
  } catch (error) {
    console.error(
      "[Socket.IO] Failed to configure Redis adapter, falling back to in-memory:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
