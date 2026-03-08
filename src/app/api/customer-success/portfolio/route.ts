import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import { getCustomerSuccessPortfolio } from "@/lib/customer-success/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const portfolio = await getCustomerSuccessPortfolio(authResult.actor);
    return NextResponse.json(portfolio);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load customer success portfolio",
      },
      { status: 500 }
    );
  }
}
