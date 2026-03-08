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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "project.read",
      request,
      targetType: "project",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const projects = await prisma.project.findMany({
      include: {
        companyPriority: { select: { id: true, name: true, color: true } },
        department: { select: { id: true, name: true, color: true } },
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        sponsor: { select: USER_SELECT },
        _count: { select: { tasks: true } },
        tasks: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const projectsWithCounts = projects.map((p) => {
      const { tasks, ...rest } = p;
      const taskStatusCounts: Record<string, number> = {};
      for (const t of tasks) {
        taskStatusCounts[t.status] = (taskStatusCounts[t.status] || 0) + 1;
      }
      return { ...rest, taskStatusCounts };
    });

    const includeMeta = request.nextUrl.searchParams.get("meta") === "true";

    if (!includeMeta) {
      return NextResponse.json(projectsWithCounts);
    }

    return NextResponse.json({
      items: projectsWithCounts,
      meta: {
        servedAt: new Date().toISOString(),
        isPartial: false,
      },
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
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
      action: "project.write",
      request,
      targetType: "project",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const {
      name,
      description,
      status,
      projectType,
      companyPriorityId,
      businessFunction,
      departmentId,
      parentId,
      responsibleIds = [],
      accountableIds = [],
      consultedIds = [],
      informedIds = [],
      sponsorIds = [],
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 },
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        status,
        projectType,
        companyPriorityId,
        businessFunction,
        departmentId: departmentId || null,
        parentId,
        responsible: { connect: responsibleIds.map((id: string) => ({ id })) },
        accountable: { connect: accountableIds.map((id: string) => ({ id })) },
        consulted: { connect: consultedIds.map((id: string) => ({ id })) },
        informed: { connect: informedIds.map((id: string) => ({ id })) },
        sponsor: { connect: sponsorIds.map((id: string) => ({ id })) },
      },
      include: {
        companyPriority: { select: { id: true, name: true, color: true } },
        department: { select: { id: true, name: true, color: true } },
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        sponsor: { select: USER_SELECT },
      },
    });

    invalidateHierarchy(user.id);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
