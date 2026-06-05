export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

function scopeKeyFor(organizationId: string | null, userId: string): string {
  return organizationId ? `org:${organizationId}` : `user:${userId}`;
}

function normalizeLinearProjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 200);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const linearProjectIds = normalizeLinearProjectIds(body.linearProjectIds);
    const scopeKey = scopeKeyFor(user.organizationId ?? null, user.id);

    await prisma.companyGoalTracking.deleteMany({
      where: {
        userId: user.id,
        scopeKey,
        linearProjectId: { notIn: linearProjectIds },
      },
    });

    await Promise.all(
      linearProjectIds.map((linearProjectId, sortOrder) =>
        prisma.companyGoalTracking.upsert({
          where: {
            userId_scopeKey_linearProjectId: {
              userId: user.id,
              scopeKey,
              linearProjectId,
            },
          },
          create: {
            userId: user.id,
            organizationId: user.organizationId ?? null,
            scopeKey,
            linearProjectId,
            sortOrder,
            enabled: true,
          },
          update: {
            enabled: true,
            sortOrder,
          },
        }),
      ),
    );

    return NextResponse.json({ linearProjectIds });
  } catch (error) {
    console.error("PATCH /api/goals/tracking error:", error);
    return NextResponse.json(
      { error: "Failed to update goal tracking" },
      { status: 500 },
    );
  }
}
