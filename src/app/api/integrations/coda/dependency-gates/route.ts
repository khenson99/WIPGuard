export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateCodaDependencyGateRule,
  patchCodaDependencyGateRule,
  runCodaDependencyGateAutomation,
  serializeCodaDependencyGateRule,
  type CodaDependencyGateConfig,
} from "@/lib/integrations/coda-dependency-gates";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface CodaDependencyGateRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<CodaDependencyGateConfig>;
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

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateCodaDependencyGateRule(ownerUserId);
    return NextResponse.json({
      rule: serializeCodaDependencyGateRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/coda/dependency-gates error:", error);
    return NextResponse.json(
      { error: "Failed to load Coda dependency gate rule" },
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

    const body = (await request.json().catch(() => ({}))) as CodaDependencyGateRequestBody;
    const action = body.action ?? "sync";
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

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
      const rule = await patchCodaDependencyGateRule(ownerUserId, {
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
      "coda", "dependency-gates", ownerUserId,
      () => runCodaDependencyGateAutomation({ userId: ownerUserId, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/coda/dependency-gates error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to run Coda dependency gate automation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
