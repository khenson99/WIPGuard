export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companies = await prisma.dealCompany.findMany({
      include: { _count: { select: { contacts: true, deals: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(companies);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch companies");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: session.user.id,
      action: "deals.write",
      request,
    });
    if (deniedResponse) return deniedResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const company = await prisma.dealCompany.create({
      data: {
        name: body.name.trim(),
        domain: typeof body.domain === "string" ? body.domain : null,
        industry: typeof body.industry === "string" ? body.industry : null,
        notes: typeof body.notes === "string" ? body.notes : null,
      },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to create company");
  }
}
