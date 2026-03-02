export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUpsertInput } from "@/lib/validators/insight-preference";

// GET /api/insights/preferences
// Optional query: ?insightId=<id>  (filter to one)
// Returns: { preferences: InsightPreference[] }
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const insightId = searchParams.get("insightId");

  const where: { userId: string; insightId?: string } = {
    userId: session.user.id,
  };
  if (insightId) {
    where.insightId = insightId;
  }

  const preferences = await prisma.insightPreference.findMany({ where });

  return NextResponse.json({ preferences });
}

// POST /api/insights/preferences
// Body: { insightId: string, status: "pinned" | "dismissed" | "default" }
// "default" removes the record (soft-reset).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const result = validateUpsertInput(body);

  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { insightId, status } = result.data!;
  const userId = session.user.id;

  // "default" means the user is resetting — delete the row
  if (status === "default") {
    await prisma.insightPreference.deleteMany({
      where: { userId, insightId },
    });
    return NextResponse.json({ preference: null });
  }

  // Upsert for pinned/dismissed
  const preference = await prisma.insightPreference.upsert({
    where: {
      userId_insightId: { userId, insightId },
    },
    create: {
      userId,
      insightId,
      status,
    },
    update: {
      status,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ preference });
}
