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
    const contact = await prisma.dealContact.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        deals: { select: { id: true, name: true, stage: true, amount: true } },
        meetings: {
          select: { id: true, title: true, startAt: true, status: true },
          orderBy: { startAt: "desc" },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch contact");
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
    if (typeof body.firstName === "string") data.firstName = body.firstName.trim();
    if (typeof body.lastName === "string") data.lastName = body.lastName.trim();
    if (body.email !== undefined) data.email = body.email || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.title !== undefined) data.title = body.title || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.companyId !== undefined) data.companyId = body.companyId || null;

    const contact = await prisma.dealContact.update({
      where: { id },
      data,
      include: { company: { select: { id: true, name: true } } },
    });

    return NextResponse.json(contact);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to update contact");
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
    await prisma.dealContact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to delete contact");
  }
}
