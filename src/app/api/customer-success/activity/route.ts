import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import { getCustomerSuccessActivityFeed } from "@/lib/customer-success/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const feed = await getCustomerSuccessActivityFeed(authResult.actor);
    return NextResponse.json(feed);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load customer success activity",
      },
      { status: 500 }
    );
  }
}
