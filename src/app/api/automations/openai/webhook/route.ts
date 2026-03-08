export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { processAutomationAiWebhook } from "@/lib/automations/runtime";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const result = await processAutomationAiWebhook(body, request.headers);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process OpenAI webhook";
    const status =
      message.toLowerCase().includes("signature") ||
      message.toLowerCase().includes("invalid")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
