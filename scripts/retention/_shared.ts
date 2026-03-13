import { prisma } from "@/lib/prisma";
import type { RetentionActor } from "@/lib/retention/service";

export async function resolveRetentionActor(): Promise<RetentionActor> {
  const organizationId =
    process.env.RETENTION_ORGANIZATION_ID?.trim() ??
    process.env.BACKFILL_ORGANIZATION_ID?.trim() ??
    "org_arda";

  const user =
    (await prisma.user.findFirst({
      where: { organizationId },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true },
    })) ?? null;

  if (!user) {
    throw new Error(`No user found for organization ${organizationId}.`);
  }

  return {
    id: user.id,
    organizationId,
  };
}
