export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/policy/audit — returns override audit trail
 * Query params: taskId (optional), page (default 1), limit (default 50)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (taskId) {
      where.taskId = taskId;
    }

    const [overrides, total] = await Promise.all([
      prisma.policyOverride.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          task: { select: { id: true, title: true, status: true } },
        },
      }),
      prisma.policyOverride.count({ where }),
    ]);

    return NextResponse.json({
      data: overrides,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/policy/audit error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit trail" },
      { status: 500 }
    );
  }
}
