export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { FunnelEventType } from "@/lib/analytics/prisma-funnel-enums";
import {
  hasVisitorFunnelPrismaModels,
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
} from "@/lib/analytics/visitor-funnel-availability";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectVisitorEvent } from "@/lib/analytics/visitor-funnel";
import { getAuthenticatedUser } from "@/lib/session-user";

const PUBLIC_COLLECTABLE_EVENTS = new Set<FunnelEventType>([
  FunnelEventType.PAGE_VIEW,
  FunnelEventType.SESSION_STARTED,
  FunnelEventType.AUTH_COMPLETED,
]);

interface CollectRequestBody {
  anonymousId?: unknown;
  eventType?: unknown;
  occurredAt?: unknown;
  path?: unknown;
  url?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  userId?: unknown;
  email?: unknown;
  dedupeKey?: unknown;
  metadata?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    const body = (await request.json().catch(() => ({}))) as CollectRequestBody;

    const anonymousId = asString(body.anonymousId);
    const rawEventType = asString(body.eventType);
    if (!anonymousId || !rawEventType) {
      return NextResponse.json(
        { error: "anonymousId and eventType are required" },
        { status: 400 },
      );
    }

    const eventType = rawEventType as FunnelEventType;
    if (!PUBLIC_COLLECTABLE_EVENTS.has(eventType)) {
      return NextResponse.json(
        { error: "Unsupported public funnel event type" },
        { status: 400 },
      );
    }

    if (!hasVisitorFunnelPrismaModels(prisma)) {
      return NextResponse.json(
        {
          accepted: 0,
          disabled: true,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
        },
        { status: 202 },
      );
    }

    const sessionUserId = user?.id ?? null;
    const sessionEmail = user?.email?.toLowerCase() ?? null;
    const requestedUserId = asString(body.userId);
    const requestedEmail = asString(body.email)?.toLowerCase() ?? null;

    const trustedUserId =
      sessionUserId && (!requestedUserId || requestedUserId === sessionUserId)
        ? sessionUserId
        : null;
    const trustedEmail =
      sessionEmail && (!requestedEmail || requestedEmail === sessionEmail)
        ? sessionEmail
        : null;

    const siteHost =
      asString(request.headers.get("x-forwarded-host")) ??
      asString(request.headers.get("host"));

    const result = await collectVisitorEvent(prisma, {
      anonymousId,
      eventType,
      occurredAt: asString(body.occurredAt),
      path: asString(body.path),
      url: asString(body.url),
      referrer: asString(body.referrer),
      utmSource: asString(body.utmSource),
      utmMedium: asString(body.utmMedium),
      utmCampaign: asString(body.utmCampaign),
      userId: trustedUserId,
      email: trustedEmail,
      dedupeKey: asString(body.dedupeKey),
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Prisma.InputJsonValue)
          : {},
    }, { siteHost });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error("POST /api/analytics/funnel/collect error:", error);
    return NextResponse.json(
      { error: "Failed to collect funnel event" },
      { status: 500 },
    );
  }
}
