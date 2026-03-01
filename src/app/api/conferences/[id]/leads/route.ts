export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { ConferenceLeadStatus } from "@/generated/prisma/client";

function isLeadStatus(value: unknown): value is (typeof ConferenceLeadStatus)[keyof typeof ConferenceLeadStatus] {
  return typeof value === "string" && Object.values(ConferenceLeadStatus).includes(value as never);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "conference.write",
      request,
      targetType: "conference",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const status = body.status;
    if (status !== undefined && status !== null && !isLeadStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const created = await prisma.conferenceLead.create({
      data: {
        conferenceId: id,
        status: isLeadStatus(status) ? status : undefined,
        firstName: typeof body.firstName === "string" && body.firstName.trim().length > 0 ? body.firstName.trim() : null,
        lastName: typeof body.lastName === "string" && body.lastName.trim().length > 0 ? body.lastName.trim() : null,
        email: typeof body.email === "string" && body.email.trim().length > 0 ? body.email.trim() : null,
        title: typeof body.title === "string" && body.title.trim().length > 0 ? body.title.trim() : null,
        phone: typeof body.phone === "string" && body.phone.trim().length > 0 ? body.phone.trim() : null,
        companyName: typeof body.companyName === "string" && body.companyName.trim().length > 0 ? body.companyName.trim() : null,
        companyDomain: typeof body.companyDomain === "string" && body.companyDomain.trim().length > 0 ? body.companyDomain.trim() : null,
        linkedinUrl: typeof body.linkedinUrl === "string" && body.linkedinUrl.trim().length > 0 ? body.linkedinUrl.trim() : null,
        notes: typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null,
        capturedByUserId: session.user.id,
        assignedToUserId: typeof body.assignedToUserId === "string" && body.assignedToUserId.trim().length > 0 ? body.assignedToUserId.trim() : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create conference lead:", error);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 },
    );
  }
}

