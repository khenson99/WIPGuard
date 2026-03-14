export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const company = await prisma.dealCompany.findUnique({
      where: { id },
      include: {
        contacts: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, title: true },
        },
        deals: {
          select: { id: true, name: true, stage: true, amount: true },
        },
        _count: { select: { contacts: true, deals: true } },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch company");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (body.domain !== undefined) data.domain = body.domain || null;
    if (body.industry !== undefined) data.industry = body.industry || null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    const company = await prisma.dealCompany.update({ where: { id }, data });
    return NextResponse.json(company);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to update company");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const { id } = await params;
    await prisma.dealCompany.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to delete company");
  }
}
