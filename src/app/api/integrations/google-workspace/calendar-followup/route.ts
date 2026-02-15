export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateGoogleCalendarRule,
  patchGoogleCalendarRule,
  runGoogleCalendarPrepFollowup,
  serializeGoogleCalendarRule,
  type GoogleCalendarRuleConfig,
} from "@/lib/integrations/google-calendar-followup";

interface GoogleCalendarRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<GoogleCalendarRuleConfig>;
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
      targetId: IntegrationProvider.GOOGLE_WORKSPACE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await getOrCreateGoogleCalendarRule(session.user.id);
    return NextResponse.json({
      rule: serializeGoogleCalendarRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/google-workspace/calendar-followup error:", error);
    return NextResponse.json(
      { error: "Failed to load Google Calendar automation rule" },
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

    const body = (await request.json().catch(() => ({}))) as GoogleCalendarRequestBody;
    const action = body.action ?? "sync";

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "configure" ? "profile.write" : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.GOOGLE_WORKSPACE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchGoogleCalendarRule(session.user.id, {
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

    const result = await runGoogleCalendarPrepFollowup({
      userId: session.user.id,
      dryRun: body.dryRun,
    });

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/google-workspace/calendar-followup error:", error);
    const message = error instanceof Error ? error.message : "Failed to run calendar automation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
