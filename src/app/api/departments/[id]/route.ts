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
      action: "project.write",
      request,
      targetType: "department",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.color !== undefined) data.color = body.color;

    const department = await prisma.department.update({
      where: { id },
      data,
      include: { _count: { select: { projects: true } } },
    });

    return NextResponse.json(department);
  } catch (error) {
    console.error("Failed to update department:", error);
    return NextResponse.json(
      { error: "Failed to update department" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
      action: "project.write",
      request,
      targetType: "department",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    // Check if any projects are linked
    const projectCount = await prisma.project.count({
      where: { departmentId: id },
    });

    if (projectCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${projectCount} project(s) still linked` },
        { status: 409 },
      );
    }

    await prisma.department.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete department:", error);
    return NextResponse.json(
      { error: "Failed to delete department" },
      { status: 500 },
    );
  }
}
