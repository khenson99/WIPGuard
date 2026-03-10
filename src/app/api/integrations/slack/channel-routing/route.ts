export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import {
  getOrCreateChannelRoutingRule,
  serializeChannelRoutingRule,
  updateChannelRoutingConfig,
  addChannelRoutingPolicy,
  removeChannelRoutingPolicy,
  type ChannelRoutingConfig,
  type ChannelRoutingPolicy,
} from "@/lib/integrations/slack-channel-routing";

interface ChannelRoutingRequestBody {
  action?: "configure" | "add_policy" | "remove_policy";
  config?: Partial<ChannelRoutingConfig>;
  policy?: ChannelRoutingPolicy;
  policyIndex?: number;
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
      targetId: IntegrationProvider.SLACK,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateChannelRoutingRule(ownerUserId);
    return NextResponse.json({
      rule: serializeChannelRoutingRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/slack/channel-routing error:", error);
    return NextResponse.json(
      { error: "Failed to load channel routing config" },
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

    const body = (await request.json().catch(() => ({}))) as ChannelRoutingRequestBody;
    const action = body.action ?? "configure";
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.SLACK,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "add_policy") {
      if (!body.policy || !body.policy.channelId || !body.policy.match) {
        return NextResponse.json(
          { error: "policy with channelId and match criteria is required" },
          { status: 400 }
        );
      }

      const rule = await addChannelRoutingPolicy(ownerUserId, body.policy);
      return NextResponse.json({
        ok: true,
        action: "add_policy",
        rule,
      });
    }

    if (action === "remove_policy") {
      if (typeof body.policyIndex !== "number") {
        return NextResponse.json(
          { error: "policyIndex is required for remove_policy action" },
          { status: 400 }
        );
      }

      try {
        const rule = await removeChannelRoutingPolicy(ownerUserId, body.policyIndex);
        return NextResponse.json({
          ok: true,
          action: "remove_policy",
          rule,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("out of range")) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }

    // Default: configure
    if (!body.config) {
      return NextResponse.json(
        { error: "config is required for configure action" },
        { status: 400 }
      );
    }

    const rule = await updateChannelRoutingConfig(ownerUserId, body.config);
    return NextResponse.json({
      ok: true,
      action: "configure",
      rule,
    });
  } catch (error) {
    console.error("POST /api/integrations/slack/channel-routing error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update channel routing config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
