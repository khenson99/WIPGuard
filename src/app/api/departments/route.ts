export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const departments = await prisma.department.findMany({
      include: {
        _count: { select: { projects: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(departments);
  } catch (error) {
    console.error("Failed to fetch departments:", error);
    return NextResponse.json(
      { error: "Failed to fetch departments" },
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
      action: "project.write",
      request,
      targetType: "department",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Department name is required" },
        { status: 400 },
      );
    }

    const department = await prisma.department.create({
      data: { name, color: color || null },
      include: { _count: { select: { projects: true } } },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    console.error("Failed to create department:", error);
    return NextResponse.json(
      { error: "Failed to create department" },
      { status: 500 },
    );
  }
}
