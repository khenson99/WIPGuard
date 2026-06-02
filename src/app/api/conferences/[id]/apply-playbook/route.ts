export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { applyConferencePlaybook } from "@/lib/conferences/playbook";

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

    const conference = await prisma.conference.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        budget: { select: { id: true } },
      },
    });

    if (!conference) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    if (conference.budget) {
      return NextResponse.json(
        { error: "Already seeded" },
        { status: 409 },
      );
    }

    const result = await applyConferencePlaybook({
      userId: session.user.id,
      conferenceId: conference.id,
      conferenceName: conference.name,
      startDate: conference.startDate,
      endDate: conference.endDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to apply conference playbook:", error);
    return NextResponse.json(
      { error: "Failed to apply conference playbook" },
      { status: 500 },
    );
  }
}
