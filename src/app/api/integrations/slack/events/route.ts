export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

interface SlackEventEnvelope {
  type?: string;
  challenge?: string;
}

// Keep the external Slack webhook healthy while task workflows are retired.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = (await request.json().catch(() => null)) as SlackEventEnvelope | null;

  if (payload?.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  return NextResponse.json({
    ok: true,
    retired: true,
  });
}
