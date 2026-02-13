import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { recordSecurityAuditEvent } from "@/lib/security-audit";
import type { EnforcementMode } from "@/generated/prisma/enums";

/**
 * GET /api/policy — returns current WIP policy config per column
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const policies = await prisma.wipPolicy.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error("GET /api/policy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch policies" },
      { status: 500 }
    );
  }
}

interface PolicyInput {
  columnName: string;
  wipLimit: number;
  enforcement: EnforcementMode;
  overrideRoles?: string[];
}

/**
 * PUT /api/policy — update WIP policy (admin only)
 * Body: single policy object or array of policy objects
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "policy.write",
      request,
      targetType: "wip_policy",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const inputs: PolicyInput[] = Array.isArray(body) ? body : [body];

    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "Request body must include at least one policy" },
        { status: 400 }
      );
    }

    // Validate enforcement values
    const validModes: Set<string> = new Set(["WARN", "BLOCK"]);
    for (const input of inputs) {
      if (!input.columnName || typeof input.wipLimit !== "number") {
        return NextResponse.json(
          { error: "Each policy must have columnName and wipLimit" },
          { status: 400 }
        );
      }
      if (input.enforcement && !validModes.has(input.enforcement)) {
        return NextResponse.json(
          { error: `Invalid enforcement mode: ${input.enforcement}. Must be WARN or BLOCK.` },
          { status: 400 }
        );
      }
    }

    const policies = await prisma.$transaction(
      inputs.map((input) =>
        prisma.wipPolicy.upsert({
          where: { columnName: input.columnName },
          update: {
            wipLimit: input.wipLimit,
            enforcement: input.enforcement ?? "WARN",
            overrideRoles: input.overrideRoles ?? ["admin"],
          },
          create: {
            columnName: input.columnName,
            wipLimit: input.wipLimit,
            enforcement: input.enforcement ?? "WARN",
            overrideRoles: input.overrideRoles ?? ["admin"],
          },
        })
      )
    );

    await recordSecurityAuditEvent({
      action: "policy.update",
      category: "policy",
      outcome: "ALLOWED",
      actorId: session.user.id,
      actorRole: permission.role,
      request,
      details: {
        updatedColumns: policies.map((policy) => policy.columnName),
      },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error("PUT /api/policy error:", error);
    return NextResponse.json(
      { error: "Failed to update policy" },
      { status: 500 }
    );
  }
}
