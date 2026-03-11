import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

export const tenantBypassEnabled =
  process.env.PRISMA_TENANT_BYPASS === "true" || process.env.NODE_ENV === "development";

export async function resolveDashboardOrganizationId(
  session: unknown,
  userId: string,
): Promise<string | null> {
  const sessionUser = getAuthenticatedUser(session as { user?: unknown } | null | undefined);
  if (sessionUser?.organizationId) {
    return sessionUser.organizationId;
  }

  try {
    return (
      (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { organizationId: true },
        })
      )?.organizationId ?? null
    );
  } catch {
    return null;
  }
}
