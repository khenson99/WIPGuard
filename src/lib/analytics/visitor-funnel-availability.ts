import type {
  FunnelEventType,
  FunnelIdentityType,
  FunnelLinkProvenance,
  PrismaEnrichmentProvider,
} from "@/lib/analytics/prisma-funnel-enums";

export interface VisitorFunnelVisitorRecord {
  id: string;
  anonymousId: string;
  siteHost: string | null;
  firstTouchSource: string | null;
  firstTouchChannel: string | null;
  firstTouchCampaign: string | null;
  firstTouchReferrer: string | null;
  firstTouchLandingPath: string | null;
  firstTouchLandingUrl: string | null;
  lastTouchSource: string | null;
  lastTouchChannel: string | null;
  lastTouchCampaign: string | null;
  lastTouchReferrer: string | null;
  lastTouchPath: string | null;
  lastTouchUrl: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorFunnelEventRecord {
  id: string;
  visitorId: string;
  eventType: FunnelEventType;
  occurredAt: Date;
  source: string | null;
  channel: string | null;
  campaign: string | null;
  path: string | null;
  url: string | null;
  referrer: string | null;
  dedupeKey: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorFunnelIdentityLinkRecord {
  id: string;
  visitorId: string;
  identityType: FunnelIdentityType;
  identityValue: string;
  provider: string;
  provenance: FunnelLinkProvenance;
  confidence: number;
  metadata: unknown;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorFunnelEnrichmentSignalRecord {
  id: string;
  provider: PrismaEnrichmentProvider;
  signalKey: string;
  visitorId: string | null;
  anonymousId: string | null;
  email: string | null;
  domain: string | null;
  fullName: string | null;
  companyName: string | null;
  confidence: number;
  occurredAt: Date | null;
  accepted: boolean;
  metadata: unknown;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorFunnelVisitorWithRelations
  extends VisitorFunnelVisitorRecord {
  events: VisitorFunnelEventRecord[];
  identityLinks: VisitorFunnelIdentityLinkRecord[];
  enrichmentSignals: VisitorFunnelEnrichmentSignalRecord[];
}

export interface VisitorFunnelPrismaClient {
  funnelVisitor: {
    findUnique(args: unknown): Promise<VisitorFunnelVisitorRecord | null>;
    findMany(args: unknown): Promise<VisitorFunnelVisitorWithRelations[]>;
    upsert(args: unknown): Promise<VisitorFunnelVisitorRecord>;
    update(args: unknown): Promise<VisitorFunnelVisitorRecord>;
  };
  funnelEvent: {
    create(args: unknown): Promise<VisitorFunnelEventRecord>;
    upsert(args: unknown): Promise<VisitorFunnelEventRecord>;
  };
  funnelIdentityLink: {
    findFirst(
      args: unknown,
    ): Promise<(VisitorFunnelIdentityLinkRecord & { visitor: VisitorFunnelVisitorRecord | null }) | null>;
    upsert(args: unknown): Promise<VisitorFunnelIdentityLinkRecord>;
  };
  funnelEnrichmentSignal: {
    count(args: unknown): Promise<number>;
    findFirst(
      args: unknown,
    ): Promise<Pick<VisitorFunnelEnrichmentSignalRecord, "occurredAt" | "createdAt"> | null>;
    upsert(args: unknown): Promise<VisitorFunnelEnrichmentSignalRecord>;
    update(args: unknown): Promise<VisitorFunnelEnrichmentSignalRecord>;
  };
}

const VISITOR_FUNNEL_MODEL_METHODS = {
  funnelVisitor: ["findUnique", "findMany", "upsert", "update"],
  funnelEvent: ["create", "upsert"],
  funnelIdentityLink: ["findFirst", "upsert"],
  funnelEnrichmentSignal: ["count", "findFirst", "upsert", "update"],
} as const;

export const VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON =
  "Visitor funnel Prisma models are unavailable in this deployment.";

export function hasVisitorFunnelPrismaModels(
  prisma: unknown,
): prisma is VisitorFunnelPrismaClient {
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

export function getVisitorFunnelPrisma(
  prisma: unknown,
): VisitorFunnelPrismaClient | null {
  return hasVisitorFunnelPrismaModels(prisma) ? prisma : null;
}
