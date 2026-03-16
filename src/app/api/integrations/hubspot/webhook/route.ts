export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

// Keep the external HubSpot webhook healthy while task workflows are retired.
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    processed: 0,
    retired: true,
  });
}
