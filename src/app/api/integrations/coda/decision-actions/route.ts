export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateCodaDecisionRule,
  patchCodaDecisionRule,
  runCodaDecisionActionConverter,
  serializeCodaDecisionRule,
  type CodaDecisionActionConfig,
} from "@/lib/integrations/coda-decision-actions";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface CodaDecisionRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<CodaDecisionActionConfig>;
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
      targetId: IntegrationProvider.CODA,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await getOrCreateCodaDecisionRule(session.user.id);
    return NextResponse.json({
      rule: serializeCodaDecisionRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/coda/decision-actions error:", error);
    return NextResponse.json(
      { error: "Failed to load Coda decision/action rule" },
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

    const body = (await request.json().catch(() => ({}))) as CodaDecisionRequestBody;
    const action = body.action ?? "sync";

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "configure" ? "profile.write" : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.CODA,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchCodaDecisionRule(session.user.id, {
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

    const result = await withSyncObservability(
      "coda", "decision-actions", session.user.id,
      () => runCodaDecisionActionConverter({ userId: session.user.id, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/coda/decision-actions error:", error);
    const message = error instanceof Error ? error.message : "Failed to run Coda decision/action converter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
