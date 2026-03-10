export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import {
  getOrCreateHubSpotBidirectionalRule,
  patchHubSpotBidirectionalRule,
  runHubSpotBidirectionalSync,
  serializeHubSpotBidirectionalRule,
  type HubSpotBidirectionalSyncConfig,
} from "@/lib/integrations/hubspot-bidirectional-sync";
import { enforcePermission } from "@/lib/permissions";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

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

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateHubSpotBidirectionalRule(ownerUserId);
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
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

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
      const rule = await patchHubSpotBidirectionalRule(ownerUserId, {
        enabled: body.enabled,
        config: body.config,
      });

      return NextResponse.json({
        ok: true,
        action: "configure",
        rule,
      });
    }

    const result = await withSyncObservability(
      "hubspot", "bidirectional-sync", ownerUserId,
      () => runHubSpotBidirectionalSync({ userId: ownerUserId, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

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
