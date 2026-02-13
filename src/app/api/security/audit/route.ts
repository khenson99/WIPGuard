export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "policy.write",
      request,
      targetType: "security_audit",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const { searchParams } = request.nextUrl;
    const category = searchParams.get("category") || undefined;
    const action = searchParams.get("action") || undefined;
    const outcome = searchParams.get("outcome") || undefined;
    const actorId = searchParams.get("actorId") || undefined;
    const limit = Math.max(
      1,
      Math.min(200, Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50)
    );

    const events = await prisma.securityAuditEvent.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(action ? { action } : {}),
        ...(outcome ? { outcome } : {}),
        ...(actorId ? { actorId } : {}),
      },
      include: {
        actor: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      events,
      count: events.length,
    });
  } catch (error) {
    console.error("GET /api/security/audit error:", error);
    return NextResponse.json(
      { error: "Failed to fetch security audit events" },
      { status: 500 }
    );
  }
}
