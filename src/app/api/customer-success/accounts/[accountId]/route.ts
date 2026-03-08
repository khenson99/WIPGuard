import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import { getCustomerSuccessAccountDetail } from "@/lib/customer-success/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { accountId } = await params;
  if (!accountId) {
    return NextResponse.json({ error: "Account id is required" }, { status: 400 });
  }

  try {
    const detail = await getCustomerSuccessAccountDetail(authResult.actor, accountId);
    if (!detail) {
      return NextResponse.json({ error: "Customer success account not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load customer success account",
      },
      { status: 500 }
    );
  }
}
