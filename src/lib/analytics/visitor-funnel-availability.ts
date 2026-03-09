const VISITOR_FUNNEL_MODEL_METHODS = {
  funnelVisitor: ["findUnique", "upsert"],
  funnelEvent: ["upsert"],
  funnelIdentityLink: ["upsert"],
  funnelEnrichmentSignal: ["count", "findFirst", "upsert", "update"],
} as const;

export const VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON =
  "Visitor funnel Prisma models are unavailable in this deployment.";

export function hasVisitorFunnelPrismaModels(prisma: unknown): boolean {
  if (!prisma || typeof prisma !== "object") {
    return false;
  }

  const client = prisma as Record<string, unknown>;
  return Object.entries(VISITOR_FUNNEL_MODEL_METHODS).every(([key, methods]) => {
    const model = client[key];
    if (!model || typeof model !== "object") {
      return false;
    }

    const delegate = model as Record<string, unknown>;
    return methods.every((method) => typeof delegate[method] === "function");
  });
}
