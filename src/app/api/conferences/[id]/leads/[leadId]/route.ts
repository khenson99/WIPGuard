export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { ConferenceLeadStatus } from "@/generated/prisma/client";

function isLeadStatus(value: unknown): value is (typeof ConferenceLeadStatus)[keyof typeof ConferenceLeadStatus] {
  return typeof value === "string" && Object.values(ConferenceLeadStatus).includes(value as never);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, leadId } = await params;

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

    const existing = await prisma.conferenceLead.findUnique({
      where: { id: leadId },
      select: { id: true, conferenceId: true },
    });
    if (!existing || existing.conferenceId !== id) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (body.status === null) {
        return NextResponse.json({ error: "status cannot be null" }, { status: 400 });
      }
      if (!isLeadStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status;
    }

    if (body.assignedToUserId !== undefined) {
      if (body.assignedToUserId === null) {
        data.assignedToUserId = null;
      } else if (typeof body.assignedToUserId === "string" && body.assignedToUserId.trim().length > 0) {
        data.assignedToUserId = body.assignedToUserId.trim();
      } else {
        return NextResponse.json({ error: "Invalid assignedToUserId" }, { status: 400 });
      }
    }

    const optionalStrings = [
      "firstName",
      "lastName",
      "email",
      "title",
      "phone",
      "companyName",
      "companyDomain",
      "linkedinUrl",
      "notes",
    ] as const;
    for (const key of optionalStrings) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const value = body[key];
        if (value === null) {
          data[key] = null;
        } else if (typeof value === "string") {
          const trimmed = value.trim();
          data[key] = trimmed.length > 0 ? trimmed : null;
        } else if (value !== undefined) {
          return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
        }
      }
    }

    const updated = await prisma.conferenceLead.update({
      where: { id: leadId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update conference lead:", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 },
    );
  }
}

