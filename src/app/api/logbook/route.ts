export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") ?? "", 10) || DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1),
      100,
    );
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: { archivedAt?: { gte?: Date; lte?: Date } } = {};

    if (startDate || endDate) {
      where.archivedAt = {};
      if (startDate) {
        where.archivedAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.archivedAt.lte = new Date(endDate);
      }
    }

    const skip = (page - 1) * limit;

    const [entries, total] = await prisma.$transaction([
      prisma.logbookEntry.findMany({
        where,
        orderBy: { archivedAt: "desc" },
        skip,
        take: limit,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.logbookEntry.count({ where }),
    ]);

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch logbook entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch logbook entries" },
      { status: 500 },
    );
  }
}
