import { NextResponse } from "next/server";
import { isRedisConnected, redisHealthCheck } from "@/lib/redis-client";

/**
 * GET /api/health/redis
 *
 * Health check endpoint for Redis connectivity.
 * Returns the connection status and latency.
 */
export async function GET() {
  const connected = isRedisConnected();

  if (!connected) {
    return NextResponse.json(
      {
        status: "disconnected",
        message: "Redis is not connected or not configured",
        latencyMs: null,
      },
      { status: 503 }
    );
  }

  const health = await redisHealthCheck();

  if (!health.connected) {
    return NextResponse.json(
      {
        status: "unhealthy",
        message: "Redis ping failed",
        latencyMs: null,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      status: "healthy",
      message: "Redis is connected and responding",
      latencyMs: health.latencyMs,
    },
    { status: 200 }
  );
}
