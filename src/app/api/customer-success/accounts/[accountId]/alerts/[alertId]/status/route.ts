import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import {
  CustomerSuccessServiceError,
  updateCustomerSuccessAlertStatus,
} from "@/lib/customer-success/service";
import type { UpdateCustomerSuccessAlertStatusInput } from "@/lib/customer-success/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string; alertId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request, "analytics.write");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { accountId, alertId } = await params;
  if (!accountId || !alertId) {
    return NextResponse.json({ error: "Account id and alert id are required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.status !== "string" || body.status.trim().length === 0) {
    return NextResponse.json({ error: "Alert status is required" }, { status: 400 });
  }

  try {
    const alert = await updateCustomerSuccessAlertStatus(authResult.actor, {
      accountId,
      alertId,
      status: body.status as UpdateCustomerSuccessAlertStatusInput["status"],
    });

    return NextResponse.json(alert);
  } catch (error) {
    if (error instanceof CustomerSuccessServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update customer success alert",
      },
      { status: 500 }
    );
  }
}
