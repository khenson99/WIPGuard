export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: user.id,
      action: "deals.read",
      request,
      targetType: "deal",
    });
    if (deniedResponse) return deniedResponse;

    const contacts = await prisma.dealContact.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json(contacts);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch contacts");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: user.id,
      action: "deals.write",
      request,
    });
    if (deniedResponse) return deniedResponse;

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.firstName !== "string" ||
      !body.firstName.trim() ||
      typeof body.lastName !== "string" ||
      !body.lastName.trim()
    ) {
      return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
    }

    const contact = await prisma.dealContact.create({
      data: {
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: typeof body.email === "string" ? body.email : null,
        phone: typeof body.phone === "string" ? body.phone : null,
        title: typeof body.title === "string" ? body.title : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        companyId: typeof body.companyId === "string" ? body.companyId : null,
      },
      include: { company: { select: { id: true, name: true } } },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to create contact");
  }
}
