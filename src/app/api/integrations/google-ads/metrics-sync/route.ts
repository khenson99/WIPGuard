export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  GOOGLE_ADS_METRICS_RULE_KEY,
  getOrCreateProviderMetricsRule,
  patchProviderMetricsRule,
  runProviderMetricsRule,
  serializeProviderMetricsRuleState,
  type ProviderMetricsSyncConfig,
} from "@/lib/integrations/provider-metrics-sync";

interface ProviderMetricsSyncRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
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
      targetId: IntegrationProvider.GOOGLE_ADS,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await getOrCreateProviderMetricsRule({
      userId: session.user.id,
      ruleKey: GOOGLE_ADS_METRICS_RULE_KEY,
    });

    return NextResponse.json({
      rule: serializeProviderMetricsRuleState(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/google-ads/metrics-sync error:", error);
    return NextResponse.json(
      { error: "Failed to load Google Ads metrics sync rule" },
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

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.GOOGLE_ADS,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchProviderMetricsRule({
        userId: session.user.id,
        ruleKey: GOOGLE_ADS_METRICS_RULE_KEY,
        patch: {
          enabled: body.enabled,
          statusOverride: body.statusOverride,
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
      userId: session.user.id,
      ruleKey: GOOGLE_ADS_METRICS_RULE_KEY,
      dryRun: body.dryRun,
    });

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/google-ads/metrics-sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to run Google Ads metrics sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
