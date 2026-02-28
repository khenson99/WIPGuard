export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { ConferenceDeadlineType } from "@/generated/prisma/client";

function parseDate(value: unknown): Date | null {
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

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const type = body.type;
    const dueAt = parseDate(body.dueAt);
    const ownerId = typeof body.ownerId === "string" && body.ownerId.trim().length > 0 ? body.ownerId.trim() : session.user.id;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!isDeadlineType(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!dueAt) {
      return NextResponse.json({ error: "dueAt is required" }, { status: 400 });
    }

    const created = await prisma.conferenceDeadline.create({
      data: {
        conferenceId: id,
        type,
        name,
        dueAt,
        ownerId,
        notes: typeof body.notes === "string" ? body.notes : null,
        sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create conference deadline:", error);
    return NextResponse.json(
      { error: "Failed to create deadline" },
      { status: 500 },
    );
  }
}

