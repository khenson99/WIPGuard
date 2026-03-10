import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import {
  createCustomerSuccessTask,
  CustomerSuccessServiceError,
} from "@/lib/customer-success/service";
import { enforcePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

function readIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request, "analytics.write");
  if ("response" in authResult) {
    return authResult.response;
  }

  const taskPermission = await enforcePermission({
    userId: authResult.actor.id,
    action: "task.write",
    request,
    targetType: "task",
  });
  if (taskPermission.deniedResponse) {
    return taskPermission.deniedResponse;
  }

  const { accountId } = await params;
  if (!accountId) {
    return NextResponse.json({ error: "Account id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "Task title is required" }, { status: 400 });
  }

  try {
    const task = await createCustomerSuccessTask(authResult.actor, {
      accountId,
      title: body.title,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      dueDate: typeof body.dueDate === "string" ? body.dueDate : undefined,
      responsibleIds: readIdList(body.responsibleIds),
      accountableIds: readIdList(body.accountableIds),
      consultedIds: readIdList(body.consultedIds),
      informedIds: readIdList(body.informedIds),
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerSuccessServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create linked customer success task",
      },
      { status: 500 }
    );
  }
}
