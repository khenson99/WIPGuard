export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { MeetingStatus } from "@/generated/prisma/client";

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
    const meeting = await prisma.dealMeeting.findUnique({
      where: { id },
      include: {
        deal: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        attendees: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json(meeting);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch meeting" },
      { status: 500 },
    );
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
    if (typeof body.title === "string") data.title = body.title.trim();
    if (body.startAt) data.startAt = new Date(body.startAt);
    if (body.endAt !== undefined) data.endAt = body.endAt ? new Date(body.endAt) : null;
    if (body.location !== undefined) data.location = body.location || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (typeof body.expectedAttendees === "number") data.expectedAttendees = body.expectedAttendees;
    if (typeof body.actualAttendees === "number") data.actualAttendees = body.actualAttendees;
    if (body.dealId !== undefined) data.dealId = body.dealId || null;
    if (body.companyId !== undefined) data.companyId = body.companyId || null;

    if (typeof body.status === "string" && Object.values(MeetingStatus).includes(body.status as MeetingStatus)) {
      data.status = body.status;
    }

    if (Array.isArray(body.attendeeIds)) {
      data.attendees = { set: body.attendeeIds.map((aid: string) => ({ id: aid })) };
    }

    const meeting = await prisma.dealMeeting.update({
      where: { id },
      data,
      include: {
        deal: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        _count: { select: { attendees: true } },
      },
    });

    return NextResponse.json(meeting);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update meeting" },
      { status: 500 },
    );
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
    await prisma.dealMeeting.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete meeting" },
      { status: 500 },
    );
  }
}
