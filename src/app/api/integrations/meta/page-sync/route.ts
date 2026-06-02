export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import {
  META_PAGE_METRICS_RULE_KEY,
  buildProviderMetricsSyncResponsePayload,
  getOrCreateProviderMetricsRule,
  patchProviderMetricsRule,
  runProviderMetricsRule,
  serializeProviderMetricsRuleState,
  type IntegrationRunMode,
  type ProviderMetricsSyncConfig,
} from "@/lib/integrations/provider-metrics-sync";
import { enforcePermission } from "@/lib/permissions";

interface ProviderMetricsSyncRequestBody {
  action?: "sync" | "configure";
  mode?: IntegrationRunMode;
  dryRun?: boolean;
  enabled?: boolean;
  config?: Partial<ProviderMetricsSyncConfig>;
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
      targetId: IntegrationProvider.META_PAGE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateProviderMetricsRule({
      userId: ownerUserId,
      ruleKey: META_PAGE_METRICS_RULE_KEY,
    });

    return NextResponse.json({
      rule: serializeProviderMetricsRuleState(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/meta/page-sync error:", error);
    return NextResponse.json(
      { error: "Failed to load Meta page sync rule" },
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

    const body = (await request.json().catch(() => ({}))) as ProviderMetricsSyncRequestBody;
    const action = body.action ?? "sync";
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.META_PAGE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchProviderMetricsRule({
        userId: ownerUserId,
        ruleKey: META_PAGE_METRICS_RULE_KEY,
        patch: {
          enabled: body.enabled,
          config: body.config,
        },
      });

      return NextResponse.json({
        ok: true,
        action: "configure",
        rule,
      });
    }

    const result = await runProviderMetricsRule({
      userId: ownerUserId,
      ruleKey: META_PAGE_METRICS_RULE_KEY,
      dryRun: body.dryRun,
      mode: body.mode,
    });

    return NextResponse.json(buildProviderMetricsSyncResponsePayload(result));
  } catch (error) {
    console.error("POST /api/integrations/meta/page-sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to run Meta page sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
