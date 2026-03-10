import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import type { PermissionAction } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

export interface CustomerSuccessActor {
  id: string;
  organizationId: string;
  role?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export async function requireCustomerSuccessActor(
  request: NextRequest,
  action: PermissionAction = "analytics.read"
): Promise<{ actor: CustomerSuccessActor } | { response: NextResponse }> {
  const session = await auth();
  const user = getAuthenticatedUser(session);

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const permission = await enforcePermission({
    userId: user.id,
    action,
    request,
    targetType: "customer-success",
  });

  if (permission.deniedResponse) {
    return { response: permission.deniedResponse };
  }

  const organizationId =
    user.organizationId ??
    (
      await prisma.user.findUnique({
        where: { id: user.id },
        select: { organizationId: true },
      })
    )?.organizationId ??
    null;

  if (!organizationId) {
    return {
      response: NextResponse.json(
        { error: "Organization context required for customer success" },
        { status: 403 }
      ),
    };
  }

  return {
    actor: {
      ...user,
      organizationId,
    },
  };
}
