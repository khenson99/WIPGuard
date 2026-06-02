// ─── Funnel Data Access Layer ──────────────────────────────────────────────────
import type { PrismaClientType } from "@/lib/prisma";
import type { FunnelInput } from "./funnel-analytics";

type FunnelPrismaClient = Pick<PrismaClientType, "submissionEvent">;

export interface FunnelQueryParams {
  from: Date;
  to: Date;
  projectId?: string;
}

export async function fetchFunnelInput(
  prisma: FunnelPrismaClient,
  params: FunnelQueryParams,
): Promise<FunnelInput> {
  const { from, to, projectId } = params;
  const dateFilter = { gte: from, lte: to };

  // 1. Count submission events in range
  const submissions = await prisma.submissionEvent.count({
    where: {
      createdAt: dateFilter,
      ...(projectId
        ? { metadata: { path: ["projectId"], equals: projectId } }
        : {}),
    },
  });

  return {
    submissions,
    created: 0,
    completed: 0,
    statusBreakdown: {},
    terminalStatuses: [],
  };
}
