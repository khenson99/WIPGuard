export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission, normalizeRole } from "@/lib/permissions";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (normalizeRole(session.user.role) === "investor") {
      return NextResponse.json({ error: "Forbidden: investors cannot access team data" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "team.role.write",
      request,
      targetType: "user_role",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json()) as { userId?: string; role?: string };
    if (!body.userId || !body.role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 }
      );
    }

    const role = normalizeRole(body.role);

    const updatedUser = await prisma.user.update({
      where: { id: body.userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
      },
    });

    await recordSecurityAuditEvent({
      action: "team.role.update",
      category: "authorization",
      outcome: "ALLOWED",
      actorId: session.user.id,
      actorRole: permission.role,
      targetType: "user",
      targetId: updatedUser.id,
      details: {
        newRole: role,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Failed to update team member role:", error);
    return NextResponse.json(
      { error: "Failed to update team member role" },
      { status: 500 }
    );
  }
}
