export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { ConferenceDeadlineType } from "@/generated/prisma/client";

function parseDate(value: unknown): Date | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
}

function isDeadlineType(value: unknown): value is (typeof ConferenceDeadlineType)[keyof typeof ConferenceDeadlineType] {
  return typeof value === "string" && Object.values(ConferenceDeadlineType).includes(value as never);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deadlineId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, deadlineId } = await params;

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

    const existing = await prisma.conferenceDeadline.findUnique({
      where: { id: deadlineId },
      select: { id: true, conferenceId: true },
    });
    if (!existing || existing.conferenceId !== id) {
      return NextResponse.json({ error: "Deadline not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      data.name = body.name.trim();
    }

    if (body.type !== undefined) {
      if (!isDeadlineType(body.type)) {
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
      }
      data.type = body.type;
    }

    if (body.dueAt !== undefined) {
      const parsed = parseDate(body.dueAt);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
      }
      data.dueAt = parsed;
    }

    if (body.ownerId !== undefined) {
      if (body.ownerId === null) {
        data.ownerId = null;
      } else if (typeof body.ownerId === "string" && body.ownerId.trim().length > 0) {
        data.ownerId = body.ownerId.trim();
      } else {
        return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });
      }
    }

    if (body.notes !== undefined) {
      data.notes = typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes : null;
    }
    if (body.sourceUrl !== undefined) {
      data.sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0 ? body.sourceUrl : null;
    }

    if (body.completed !== undefined) {
      if (body.completed === true) data.completedAt = new Date();
      if (body.completed === false) data.completedAt = null;
    }

    const updated = await prisma.conferenceDeadline.update({
      where: { id: deadlineId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update conference deadline:", error);
    return NextResponse.json(
      { error: "Failed to update deadline" },
      { status: 500 },
    );
  }
}

