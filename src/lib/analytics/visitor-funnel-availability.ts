const VISITOR_FUNNEL_MODEL_KEYS = [
  "funnelVisitor",
  "funnelEvent",
  "funnelIdentityLink",
  "funnelEnrichmentSignal",
] as const;

export const VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON =
  "Visitor funnel Prisma models are unavailable in this deployment.";

export function hasVisitorFunnelPrismaModels(prisma: unknown): boolean {
  if (!prisma || typeof prisma !== "object") {
    return false;
  }

  const client = prisma as Record<string, unknown>;
  return VISITOR_FUNNEL_MODEL_KEYS.every((key) => {
    const model = client[key];
    return Boolean(model && typeof model === "object");
  });
}
