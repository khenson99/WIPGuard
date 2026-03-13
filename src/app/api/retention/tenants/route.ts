import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import { listRetentionTenants, normalizeRetentionFilters } from "@/lib/retention/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const tenants = await listRetentionTenants(
      authResult.actor,
      normalizeRetentionFilters(request.nextUrl.searchParams)
    );
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tenants,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load retention tenants",
      },
      { status: 500 }
    );
  }
}
