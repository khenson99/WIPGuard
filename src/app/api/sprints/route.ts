export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    const where =
      isActive !== null ? { isActive: isActive === "true" } : undefined;

    const sprints = await prisma.sprint.findMany({
      where,
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(sprints);
  } catch (error) {
    console.error("Failed to fetch sprints:", error);
    return NextResponse.json(
      { error: "Failed to fetch sprints" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "sprint.write",
      request,
      targetType: "sprint",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const { name, startDate, endDate, isActive } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Name, startDate, and endDate are required" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprint = await prisma.$transaction(async (tx: any) => {
      if (isActive) {
        await tx.sprint.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
      }

      return tx.sprint.create({
        data: {
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          isActive: isActive ?? false,
        },
        include: {
          _count: { select: { tasks: true } },
        },
      });
    });

    return NextResponse.json(sprint, { status: 201 });
  } catch (error) {
    console.error("Failed to create sprint:", error);
    return NextResponse.json(
      { error: "Failed to create sprint" },
      { status: 500 },
    );
  }
}
