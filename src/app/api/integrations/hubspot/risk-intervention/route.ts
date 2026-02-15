export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateHubSpotRiskRule,
  patchHubSpotRiskRule,
  runHubSpotRiskIntervention,
  serializeHubSpotRiskRule,
  type HubSpotRiskInterventionConfig,
} from "@/lib/integrations/hubspot-risk-intervention";

interface HubSpotRiskSyncRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<HubSpotRiskInterventionConfig>;
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

    const rule = await getOrCreateHubSpotRiskRule(session.user.id);
    return NextResponse.json({
      rule: serializeHubSpotRiskRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/hubspot/risk-intervention error:", error);
    return NextResponse.json(
      { error: "Failed to load HubSpot risk intervention rule" },
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

    const body = (await request.json().catch(() => ({}))) as HubSpotRiskSyncRequestBody;
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
      const rule = await patchHubSpotRiskRule(session.user.id, {
        enabled: body.enabled,
        statusOverride: body.statusOverride,
        config: body.config,
      });

      return NextResponse.json({
        ok: true,
        action: "configure",
        rule,
      });
    }

    const result = await runHubSpotRiskIntervention({
      userId: session.user.id,
      dryRun: body.dryRun,
    });

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/hubspot/risk-intervention error:", error);
    const message = error instanceof Error ? error.message : "Failed to run HubSpot risk automation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
