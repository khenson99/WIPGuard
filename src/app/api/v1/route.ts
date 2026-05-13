/**
 * API v1 Root
 *
 * GET /api/v1 — Returns API version info and available endpoints.
 */

import { NextResponse } from "next/server";
import { CURRENT_API_VERSION, API_VERSIONS, VERSION_SUNSET_DATES } from "@/lib/api/versioning";

export async function GET() {
  return NextResponse.json(
    {
      version: API_VERSIONS.V1,
      current: CURRENT_API_VERSION,
      supported: Object.values(API_VERSIONS),
      deprecated: VERSION_SUNSET_DATES,
      endpoints: ["/api/v1/deals"],
      documentation: "See docs/API_VERSIONING.md for versioning policy",
    },
    {
      headers: {
        "API-Version": API_VERSIONS.V1,
      },
    }
  );
}
