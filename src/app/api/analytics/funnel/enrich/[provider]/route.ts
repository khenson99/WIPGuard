export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";
import type { EnrichmentProvider } from "@/lib/analytics/types";
import {
  ingestVisitorEnrichmentSignals,
  type VisitorEnrichmentSignalInput,
} from "@/lib/analytics/visitor-funnel";

const SUPPORTED_PROVIDERS = new Set<EnrichmentProvider>(["unify", "clay", "rb2b"]);

interface EnrichRequestBody {
  signals?: VisitorEnrichmentSignalInput[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { provider: rawProvider } = await context.params;
    const provider = rawProvider.trim().toLowerCase() as EnrichmentProvider;
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "Unsupported enrichment provider" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as EnrichRequestBody;
    if (!Array.isArray(body.signals)) {
      return NextResponse.json({ error: "signals must be an array" }, { status: 400 });
    }

    const result = await ingestVisitorEnrichmentSignals(prisma, provider, body.signals);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error("POST /api/analytics/funnel/enrich/[provider] error:", error);
    return NextResponse.json(
      { error: "Failed to ingest enrichment signals" },
      { status: 500 },
    );
  }
}
