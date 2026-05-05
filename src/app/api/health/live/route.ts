import { NextResponse } from "next/server";
import packageJson from "../../../../../package.json";

const APP_VERSION = process.env.APP_VERSION?.trim() || packageJson.version;

/**
 * GET /api/health/live
 *
 * Liveness endpoint for platform health checks.
 * Returns 200 when the app process is up and able to serve HTTP,
 * without depending on downstream services like Postgres.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
