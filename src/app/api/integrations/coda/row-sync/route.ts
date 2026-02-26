export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateCodaRowSyncRule,
  patchCodaRule,
  runCodaRowSync,
  serializeCodaRuleState,
  type CodaRowSyncConfig,
} from "@/lib/integrations/coda-row-sync";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface CodaSyncRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<CodaRowSyncConfig>;
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

    const rule = await getOrCreateCodaRowSyncRule(session.user.id);
    return NextResponse.json({
      rule: serializeCodaRuleState(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/coda/row-sync error:", error);
    return NextResponse.json(
      { error: "Failed to load Coda row sync rule" },
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

    const body = (await request.json().catch(() => ({}))) as CodaSyncRequestBody;
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
      const rule = await patchCodaRule(session.user.id, {
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
      "coda", "row-sync", session.user.id,
      () => runCodaRowSync({ userId: session.user.id, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/coda/row-sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to run Coda row sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
