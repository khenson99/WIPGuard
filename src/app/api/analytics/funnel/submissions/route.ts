export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, referenceId, metadata } = body as {
      type?: string;
      referenceId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!type) {
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400 },
      );
    }

    const event = await prisma.submissionEvent.create({
      data: {
        type,
        referenceId: referenceId ?? null,
        metadata: metadata ?? {},
        userId,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("Submission event error:", error);
    return NextResponse.json(
      { error: "Failed to record submission event" },
      { status: 500 },
    );
  }
}
