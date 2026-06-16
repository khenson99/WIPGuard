import { NextResponse } from "next/server";
import { redisHealthCheck } from "@/lib/redis";

/**
 * GET /api/health/redis
 *
 * Health check endpoint for Redis connectivity. Pings the live cache client and
 * returns its connection status and latency.
 */
export async function GET() {
  const health = await redisHealthCheck();

  if (!health.connected) {
    return NextResponse.json(
      {
        status: "disconnected",
        message: "Redis is not connected or not configured",
        latencyMs: health.latencyMs,
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
