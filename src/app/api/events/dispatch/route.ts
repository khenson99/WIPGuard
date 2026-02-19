export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchOutboxBatch } from "@/lib/outbox-worker";
import { dispatchOutboxEvent } from "@/lib/outbox-dispatcher";

function normalizePositiveInt(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function isAuthorizedBySecret(request: NextRequest): boolean {
  const expected = process.env.OUTBOX_DISPATCH_SECRET?.trim();
  if (!expected) return false;
  const provided = request.headers.get("x-outbox-dispatch-secret")?.trim();
  return Boolean(provided && provided === expected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const hasSecret = isAuthorizedBySecret(request);

  if (!hasSecret) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const batchSize =
      normalizePositiveInt(body.batchSize, undefined) ??
      normalizePositiveInt(request.nextUrl.searchParams.get("batchSize"), undefined);
    const maxRetries =
      normalizePositiveInt(body.maxRetries, undefined) ??
      normalizePositiveInt(request.nextUrl.searchParams.get("maxRetries"), undefined);

    const result = await dispatchOutboxBatch(prisma, dispatchOutboxEvent, {
      batchSize,
      maxRetries,
    });

    return NextResponse.json({
      ...result,
      dispatchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/events/dispatch error:", error);
    return NextResponse.json(
      { error: "Failed to dispatch outbox events" },
      { status: 500 }
    );
  }
}
