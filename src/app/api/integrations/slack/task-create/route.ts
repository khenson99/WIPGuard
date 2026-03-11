export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";
import {
  createTaskFromSlack,
  type SlackTaskCreationInput,
} from "@/lib/integrations/slack-task-creation";

interface TaskCreateRequestBody {
  /** The Slack event / shortcut payload */
  payload: SlackTaskCreationInput;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as TaskCreateRequestBody;

    if (!body.payload) {
      return NextResponse.json(
        { error: "payload is required" },
        { status: 400 }
      );
    }

    if (!body.payload.channelId || !body.payload.threadTs || !body.payload.triggerType) {
      return NextResponse.json(
        { error: "payload must include channelId, threadTs, and triggerType" },
        { status: 400 }
      );
    }

    const validTriggers = ["reaction", "shortcut", "slash_command", "webhook"];
    if (!validTriggers.includes(body.payload.triggerType)) {
      return NextResponse.json(
        { error: `triggerType must be one of: ${validTriggers.join(", ")}` },
        { status: 400 }
      );
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.SLACK,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const result = await createTaskFromSlack({
      userId: ownerUserId,
      payload: body.payload,
    });

    const status = result.deduped ? 200 : 201;

    return NextResponse.json(
      {
        ok: true,
        result,
      },
      { status }
    );
  } catch (error) {
    console.error("POST /api/integrations/slack/task-create error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create task from Slack";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
