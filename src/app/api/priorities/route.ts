export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { invalidateHierarchy } from "@/lib/hierarchy-cache";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!getAuthenticatedUser(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const priorities = await prisma.companyPriority.findMany({
      include: {
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        _count: { select: { projects: true } },
      },
      orderBy: { priority: "asc" },
    });

    return NextResponse.json(priorities);
  } catch (error) {
    console.error("Failed to fetch priorities:", error);
    return NextResponse.json(
      { error: "Failed to fetch priorities" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "priority.write",
      request,
      targetType: "priority",
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
      responsibleIds = [],
      accountableIds = [],
      consultedIds = [],
      informedIds = [],
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Priority name is required" },
        { status: 400 },
      );
    }

    const companyPriority = await prisma.companyPriority.create({
      data: {
        name,
        summary,
        priority,
        color,
        responsible: { connect: responsibleIds.map((id: string) => ({ id })) },
        accountable: { connect: accountableIds.map((id: string) => ({ id })) },
        consulted: { connect: consultedIds.map((id: string) => ({ id })) },
        informed: { connect: informedIds.map((id: string) => ({ id })) },
      },
      include: {
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        _count: { select: { projects: true } },
      },
    });

    invalidateHierarchy(user.id);

    return NextResponse.json(companyPriority, { status: 201 });
  } catch (error) {
    console.error("Failed to create priority:", error);
    return NextResponse.json(
      { error: "Failed to create priority" },
      { status: 500 },
    );
  }
}
