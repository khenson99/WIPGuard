export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const permission = await enforcePermission({
      userId: user.id,
      action: "priority.write",
      request,
      targetType: "priority",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }
    const body = await request.json();
    const {
      name,
      summary,
      priority,
      color,
      responsibleIds,
      accountableIds,
      consultedIds,
      informedIds,
    } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (summary !== undefined) data.summary = summary;
    if (priority !== undefined) data.priority = priority;
    if (color !== undefined) data.color = color;

    // Handle RACI relation updates
    if (responsibleIds)
      data.responsible = { set: responsibleIds.map((rid: string) => ({ id: rid })) };
    if (accountableIds)
      data.accountable = { set: accountableIds.map((rid: string) => ({ id: rid })) };
    if (consultedIds)
      data.consulted = { set: consultedIds.map((rid: string) => ({ id: rid })) };
    if (informedIds)
      data.informed = { set: informedIds.map((rid: string) => ({ id: rid })) };

    const companyPriority = await prisma.companyPriority.update({
      where: { id },
      data,
      include: {
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
      },
    });

    return NextResponse.json(companyPriority);
  } catch (error) {
    console.error("Failed to update priority:", error);
    return NextResponse.json(
      { error: "Failed to update priority" },
      { status: 500 },
    );
  }
}
