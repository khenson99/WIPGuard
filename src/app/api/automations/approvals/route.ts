export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { WorkflowApprovalStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { getAppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getAppRole(session.user.id);
    const mineOnly = request.nextUrl.searchParams.get("mine") === "true";

    const where = {
      status: WorkflowApprovalStatus.PENDING,
      ...(mineOnly
        ? { approverId: session.user.id }
        : role === "admin"
          ? {
              OR: [{ approverId: session.user.id }, { approverId: null }],
            }
          : {
              approverId: session.user.id,
            }),
    } as const;

    const approvals = await prisma.workflowApproval.findMany({
      where,
      orderBy: [{ timeoutAt: "asc" }, { createdAt: "asc" }],
      include: {
        run: {
          select: {
            id: true,
            status: true,
            workflow: {
              select: {
                id: true,
                name: true,
                scope: true,
                ownerId: true,
              },
            },
          },
        },
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      take: 200,
    });

    return NextResponse.json(approvals);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch approvals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
