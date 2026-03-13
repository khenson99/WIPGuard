import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import { getRetentionTenantDetail } from "@/lib/retention/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ customerRecordId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const { customerRecordId } = await context.params;
    const detail = await getRetentionTenantDetail(authResult.actor, customerRecordId);
    if (!detail) {
      return NextResponse.json({ error: "Retention tenant not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load retention tenant detail",
      },
      { status: 500 }
    );
  }
}
