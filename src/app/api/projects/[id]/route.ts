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
      targetType: "project",
      targetId: id,
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
      responsibleIds,
      accountableIds,
      consultedIds,
      informedIds,
      sponsorIds,
    } = body;

    // Build update data with only provided fields
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (projectType !== undefined) data.projectType = projectType;
    if (companyPriorityId !== undefined)
      data.companyPriorityId = companyPriorityId;
    if (businessFunction !== undefined) data.businessFunction = businessFunction;
    if (parentId !== undefined) data.parentId = parentId;

    // Handle RACI relation updates (set = disconnect all then connect new)
    if (responsibleIds)
      data.responsible = { set: responsibleIds.map((rid: string) => ({ id: rid })) };
    if (accountableIds)
      data.accountable = { set: accountableIds.map((rid: string) => ({ id: rid })) };
    if (consultedIds)
      data.consulted = { set: consultedIds.map((rid: string) => ({ id: rid })) };
    if (informedIds)
      data.informed = { set: informedIds.map((rid: string) => ({ id: rid })) };
    if (sponsorIds)
      data.sponsor = { set: sponsorIds.map((rid: string) => ({ id: rid })) };

    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        companyPriority: { select: { id: true, name: true, color: true } },
        responsible: { select: USER_SELECT },
        accountable: { select: USER_SELECT },
        consulted: { select: USER_SELECT },
        informed: { select: USER_SELECT },
        sponsor: { select: USER_SELECT },
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}
