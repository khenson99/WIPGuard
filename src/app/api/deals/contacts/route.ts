export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contacts = await prisma.dealContact.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json(contacts);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch contacts" },
      { status: 500 },
    );
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create contact" },
      { status: 500 },
    );
  }
}
