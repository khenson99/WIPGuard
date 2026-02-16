export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import {
  getOrCreateHubSpotBidirectionalRule,
  patchHubSpotBidirectionalRule,
  runHubSpotBidirectionalSync,
  serializeHubSpotBidirectionalRule,
  type HubSpotBidirectionalSyncConfig,
} from "@/lib/integrations/hubspot-bidirectional-sync";
import { enforcePermission } from "@/lib/permissions";

interface HubSpotBidirectionalSyncRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  config?: Partial<HubSpotBidirectionalSyncConfig>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.HUBSPOT,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await getOrCreateHubSpotBidirectionalRule(session.user.id);
    return NextResponse.json({
      rule: serializeHubSpotBidirectionalRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/hubspot/bidirectional-sync error:", error);
    return NextResponse.json(
      { error: "Failed to load HubSpot bi-directional sync rule" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as HubSpotBidirectionalSyncRequestBody;
    const action = body.action ?? "sync";

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "configure" ? "profile.write" : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.HUBSPOT,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchHubSpotBidirectionalRule(session.user.id, {
        enabled: body.enabled,
        config: body.config,
      });

      return NextResponse.json({
        ok: true,
        action: "configure",
        rule,
      });
    }

    const result = await runHubSpotBidirectionalSync({
      userId: session.user.id,
      dryRun: body.dryRun,
    });

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/hubspot/bidirectional-sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to run HubSpot bi-directional sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
