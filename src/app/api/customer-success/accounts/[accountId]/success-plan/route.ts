import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import {
  createCustomerSuccessPlan,
  CustomerSuccessServiceError,
} from "@/lib/customer-success/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request, "analytics.write");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { accountId } = await params;
  if (!accountId) {
    return NextResponse.json({ error: "Account id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Success plan name is required" }, { status: 400 });
  }

  try {
    const plan = await createCustomerSuccessPlan(authResult.actor, {
      accountId,
      name: body.name,
      templateKey: typeof body.templateKey === "string" ? body.templateKey : undefined,
      targetDate: typeof body.targetDate === "string" ? body.targetDate : undefined,
      milestoneTitles: Array.isArray(body.milestoneTitles)
        ? body.milestoneTitles.filter(
            (title: unknown): title is string => typeof title === "string" && title.trim().length > 0
          )
        : undefined,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerSuccessServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create customer success plan",
      },
      { status: 500 }
    );
  }
}
