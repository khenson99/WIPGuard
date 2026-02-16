export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dispatchWorkflowTriggerEvents, enqueueWorkflowTriggerEvent } from "@/lib/automations/runtime";
import { getIntegrationBySlug } from "@/lib/integrations/catalog";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function payloadHash(input: Record<string, unknown>): string {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}

function isIngestTokenValid(request: NextRequest): boolean {
  const token = process.env.AUTOMATION_INGEST_TOKEN;
  if (!token) return false;

  const headerToken = request.headers.get("x-automation-token");
  return Boolean(headerToken && headerToken === token);
}

export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const tokenAuthorized = isIngestTokenValid(request);
    const session = tokenAuthorized ? null : await auth();

    if (!tokenAuthorized && !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider: providerSlug } = await context.params;
    const definition = getIntegrationBySlug(providerSlug);
    if (!definition) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const body = asRecord(await request.json().catch(() => ({})));
    const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
    if (!eventType) {
      return NextResponse.json({ error: "eventType is required" }, { status: 400 });
    }

    const payload = asRecord(body.payload);
    const externalId = typeof body.externalId === "string" ? body.externalId.trim() : null;
    const providedKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";

    const idempotencyKey =
      providedKey ||
      [
        definition.provider,
        eventType,
        externalId || payloadHash(payload),
      ].join(":");

    await enqueueWorkflowTriggerEvent({
      provider: definition.provider,
      eventType,
      externalId,
      payload,
      idempotencyKey,
    });

    const shouldDispatch = body.dispatchNow !== false;
    const dispatch = shouldDispatch
      ? await dispatchWorkflowTriggerEvents(10)
      : { processed: 0, startedRuns: 0, timedOutApprovals: 0 };

    return NextResponse.json({
      ok: true,
      idempotencyKey,
      dispatch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ingest event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
