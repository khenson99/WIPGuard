export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      include: {
        companyPriority: { select: { id: true, name: true, color: true } },
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        sponsor: { select: USER_SELECT },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(projects);
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
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
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
        parentId,
        responsible: { connect: responsibleIds.map((id: string) => ({ id })) },
        accountable: { connect: accountableIds.map((id: string) => ({ id })) },
        consulted: { connect: consultedIds.map((id: string) => ({ id })) },
        informed: { connect: informedIds.map((id: string) => ({ id })) },
        sponsor: { connect: sponsorIds.map((id: string) => ({ id })) },
      },
      include: {
        companyPriority: { select: { id: true, name: true, color: true } },
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        sponsor: { select: USER_SELECT },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
