export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { MeetingStatus } from "@/generated/prisma/client";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meetings = await prisma.dealMeeting.findMany({
      include: {
        deal: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        _count: { select: { attendees: true } },
      },
      orderBy: { startAt: "desc" },
    });

    return NextResponse.json(meetings);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch meetings");
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
    if (!body || typeof body.title !== "string" || !body.title.trim() || !body.startAt) {
      return NextResponse.json({ error: "Title and start time are required" }, { status: 400 });
    }

    const startAt = new Date(body.startAt);
    if (isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
    }

    const status =
      typeof body.status === "string" && Object.values(MeetingStatus).includes(body.status as MeetingStatus)
        ? (body.status as MeetingStatus)
        : MeetingStatus.SCHEDULED;

    const meeting = await prisma.dealMeeting.create({
      data: {
        title: body.title.trim(),
        status,
        startAt,
        endAt: body.endAt ? new Date(body.endAt) : null,
        location: typeof body.location === "string" ? body.location : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        expectedAttendees: typeof body.expectedAttendees === "number" ? body.expectedAttendees : 0,
        actualAttendees: typeof body.actualAttendees === "number" ? body.actualAttendees : 0,
        dealId: typeof body.dealId === "string" ? body.dealId : null,
        companyId: typeof body.companyId === "string" ? body.companyId : null,
        attendees:
          Array.isArray(body.attendeeIds) && body.attendeeIds.length > 0
            ? { connect: body.attendeeIds.map((id: string) => ({ id })) }
            : undefined,
      },
      include: {
        deal: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        _count: { select: { attendees: true } },
      },
    });

    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to create meeting");
  }
}
