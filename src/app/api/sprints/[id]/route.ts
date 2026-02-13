export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

export async function PATCH(
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
      action: "sprint.write",
      request,
      targetType: "sprint",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const { name, startDate, endDate, isActive } = body;

    const existing = await prisma.sprint.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprint = await prisma.$transaction(async (tx: any) => {
      if (isActive === true) {
        await tx.sprint.updateMany({
          where: { isActive: true, id: { not: id } },
          data: { isActive: false },
        });
      }

      return tx.sprint.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(startDate !== undefined && { startDate: new Date(startDate) }),
          ...(endDate !== undefined && { endDate: new Date(endDate) }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          _count: { select: { tasks: true } },
        },
      });
    });

    return NextResponse.json(sprint);
  } catch (error) {
    console.error("Failed to update sprint:", error);
    return NextResponse.json(
      { error: "Failed to update sprint" },
      { status: 500 },
    );
  }
}
