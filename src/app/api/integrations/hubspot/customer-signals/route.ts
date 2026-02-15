export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateHubSpotCustomerSignalRule,
  patchHubSpotCustomerSignalRule,
  runHubSpotCustomerSignalAutomation,
  serializeHubSpotCustomerSignalRule,
  type HubSpotCustomerSignalConfig,
} from "@/lib/integrations/hubspot-customer-signals";

interface HubSpotCustomerSignalRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<HubSpotCustomerSignalConfig>;
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

    const rule = await getOrCreateHubSpotCustomerSignalRule(session.user.id);
    return NextResponse.json({
      rule: serializeHubSpotCustomerSignalRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/hubspot/customer-signals error:", error);
    return NextResponse.json(
      { error: "Failed to load HubSpot customer signal rule" },
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

    const body = (await request.json().catch(() => ({}))) as HubSpotCustomerSignalRequestBody;
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
      const rule = await patchHubSpotCustomerSignalRule(session.user.id, {
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

    const result = await runHubSpotCustomerSignalAutomation({
      userId: session.user.id,
      dryRun: body.dryRun,
    });

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/hubspot/customer-signals error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to run HubSpot customer signal automation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
