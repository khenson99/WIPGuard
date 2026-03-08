import { createHash } from "crypto";
import {
  PrismaEnrichmentProvider,
  FunnelEventType,
  FunnelIdentityType,
  FunnelLinkProvenance,
} from "@/lib/analytics/prisma-funnel-enums";
import {
  type Prisma,
  type PrismaClient,
} from "@/generated/prisma/client";
import { enrichStripeEmails } from "@/lib/analytics/stripe-email-enrichment";
import { buildVisitorFunnelEnrichmentAlerts } from "@/lib/analytics/visitor-funnel-enrichment-alerts";
import type { PrismaClientType } from "@/lib/prisma";
import type {
  AnalyticsDashboardData,
  EnrichmentProvider,
  VisitorFunnelBreakdownRow,
  VisitorFunnelData,
  VisitorFunnelEnrichmentAlert,
  VisitorFunnelEnrichmentProviderStatus,
  VisitorFunnelFilters,
  VisitorFunnelOverlap,
  VisitorFunnelProviderEvidence,
  VisitorFunnelRecord,
  VisitorFunnelStageCount,
  VisitorFunnelStageId,
  VisitorFunnelTrendPoint,
  VisitorMilestone,
  VisitorLinkProvenance,
} from "@/lib/analytics/types";

type FunnelPrismaClient = PrismaClientType;
type PersistedVisitor = NonNullable<
  Awaited<ReturnType<PrismaClient["funnelVisitor"]["findUnique"]>>
>;
type HubSpotDeal = NonNullable<
  NonNullable<AnalyticsDashboardData["hubspot"]>["deals"]
>[number];

const STAGE_ORDER: VisitorFunnelStageId[] = [
  "visitors",
  "identified",
  "demo_booked",
  "kanban_card_created",
  "trial_started",
  "paid_customer",
];

const STAGE_LABELS: Record<VisitorFunnelStageId, string> = {
  visitors: "Visitors",
  identified: "Identified",
  demo_booked: "Demo Booked",
  kanban_card_created: "Kanban Card Created",
  trial_started: "Trial Started",
  paid_customer: "Paid Customer",
};

const DEMO_STAGES = new Set([
  "Demo Scheduled",
  "No-Show/Reschedule",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
  "Active",
]);

const EMAIL_IDENTITY_TYPES = new Set<FunnelIdentityType>([
  FunnelIdentityType.EMAIL,
  FunnelIdentityType.CODA_EMAIL,
]);

const ENRICHMENT_PROVIDERS: EnrichmentProvider[] = ["unify", "clay", "rb2b"];
const ENRICHMENT_PROVIDER_LABELS: Record<EnrichmentProvider, string> = {
  unify: "UNIFY",
  clay: "Clay",
  rb2b: "RB2B",
};

type AttributionInfo = {
  source: string | null;
  channel: string | null;
  campaign: string | null;
  referrer: string | null;
  path: string | null;
  url: string | null;
  siteHost: string | null;
};

type IdentityInput = {
  type: FunnelIdentityType;
  value: string;
  provider: string;
  provenance: FunnelLinkProvenance;
  confidence: number;
  userId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

type RawVisitorRecord = Awaited<
  ReturnType<typeof loadVisitorsForRecords>
>[number];

type StripeStatusRecord = {
  subscriptionStatus: "active" | "trialing" | "past_due" | "paused" | "canceled" | "none" | "unknown";
  occurredAt: string | null;
};

export interface VisitorEventCollectorInput {
  anonymousId: string;
  eventType: FunnelEventType;
  occurredAt?: string | null;
  path?: string | null;
  url?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  userId?: string | null;
  email?: string | null;
  dedupeKey?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface VisitorEnrichmentSignalInput {
  signalKey?: string | null;
  anonymousId?: string | null;
  email?: string | null;
  domain?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  confidence?: number | null;
  occurredAt?: string | null;
  provenance?: VisitorLinkProvenance | null;
  metadata?: Prisma.InputJsonValue | null;
  payload?: Prisma.InputJsonValue | null;
}

export interface VisitorRecordsQuery {
  from: Date;
  to: Date;
  filters: VisitorFunnelFilters;
  page: number;
  pageSize: number;
}

export interface VisitorRecordsPage {
  records: VisitorFunnelRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = trimOrNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeIdentityValue(type: FunnelIdentityType, value: string): string {
  if (type === FunnelIdentityType.EMAIL || type === FunnelIdentityType.CODA_EMAIL) {
    return normalizeEmail(value) ?? value.trim().toLowerCase();
  }
  return value.trim();
}

function normalizeSource(value: string | null | undefined): string | null {
  const source = trimOrNull(value);
  return source ? source.toLowerCase() : null;
}

function normalizeCampaign(value: string | null | undefined): string | null {
  const campaign = trimOrNull(value);
  return campaign ? campaign.toLowerCase() : null;
}

function toIso(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const resolved = date instanceof Date ? date : new Date(date);
  return Number.isNaN(resolved.getTime()) ? null : resolved.toISOString();
}

function safeDate(value: Date | string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? fallback : resolved;
}

function safeOptionalDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? null : resolved;
}

function parseEnabledFlag(value: string | null | undefined, fallback: boolean): boolean {
  const trimmed = trimOrNull(value)?.toLowerCase();
  if (!trimmed) return fallback;
  if (["1", "true", "yes", "on"].includes(trimmed)) return true;
  if (["0", "false", "no", "off"].includes(trimmed)) return false;
  return fallback;
}

function hostFromUrl(rawUrl: string | null | undefined): string | null {
  const value = trimOrNull(rawUrl);
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function pathFromUrl(rawUrl: string | null | undefined): string | null {
  const value = trimOrNull(rawUrl);
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function redditAttribution(input: {
  source?: string | null;
  referrer?: string | null;
}): boolean {
  const source = normalizeSource(input.source);
  const referrer = trimOrNull(input.referrer)?.toLowerCase() ?? null;
  return Boolean(
    source?.startsWith("reddit") ||
      source === "reddit.com" ||
      referrer?.includes("reddit.com")
  );
}

function mapMediumToChannel(
  medium: string | null | undefined,
  source: string | null,
  referrer: string | null,
): string | null {
  const normalizedMedium = trimOrNull(medium)?.toLowerCase() ?? null;
  if (redditAttribution({ source, referrer })) return "reddit";
  if (normalizedMedium?.includes("email")) return "email";
  if (
    normalizedMedium?.includes("cpc") ||
    normalizedMedium?.includes("ppc") ||
    normalizedMedium?.includes("paid") ||
    normalizedMedium?.includes("search")
  ) {
    return "paid-search";
  }
  if (
    normalizedMedium?.includes("social") ||
    normalizedMedium?.includes("community") ||
    source === "facebook" ||
    source === "instagram" ||
    source === "linkedin"
  ) {
    return "paid-social";
  }
  if (source === "google" || source === "bing") return "organic-search";
  if (referrer) return "referral";
  return "direct";
}

function deriveAttribution(input: {
  url?: string | null;
  path?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  siteHost?: string | null;
}): AttributionInfo {
  const url = trimOrNull(input.url);
  const referrer = trimOrNull(input.referrer);
  const utmSource = normalizeSource(input.utmSource);
  const source =
    utmSource ??
    hostFromUrl(referrer) ??
    null;
  const path = trimOrNull(input.path) ?? pathFromUrl(url);
  return {
    source,
    channel: mapMediumToChannel(input.utmMedium, source, referrer),
    campaign: normalizeCampaign(input.utmCampaign),
    referrer,
    path,
    url,
    siteHost: trimOrNull(input.siteHost) ?? hostFromUrl(url),
  };
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function syntheticAnonymousId(identityType: FunnelIdentityType, value: string): string {
  return `backfill:${identityType.toLowerCase()}:${stableHash(value)}`;
}

function providerSlug(provider: PrismaEnrichmentProvider | EnrichmentProvider | string): string {
  const value = String(provider).trim().toLowerCase();
  if (value === "unify") return "unify";
  if (value === "clay") return "clay";
  if (value === "rb2b") return "rb2b";
  return value || "system";
}

function toPrismaEnrichmentProvider(
  provider: string,
): PrismaEnrichmentProvider | null {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "unify") return PrismaEnrichmentProvider.UNIFY;
  if (normalized === "clay") return PrismaEnrichmentProvider.CLAY;
  if (normalized === "rb2b") return PrismaEnrichmentProvider.RB2B;
  return null;
}

function hasProviderAuthSecret(provider: EnrichmentProvider): boolean {
  const globalSecret = trimOrNull(process.env.VISITOR_FUNNEL_ENRICH_SECRET);
  const providerSecret = trimOrNull(
    process.env[`${provider.toUpperCase()}_FUNNEL_ENRICH_SECRET`],
  );
  return Boolean(globalSecret || providerSecret);
}

function resolveUnifySyncConfig(): {
  apiConfigured: boolean;
  syncEnabled: boolean;
  objectName: string | null;
} {
  const apiConfigured = Boolean(
    trimOrNull(process.env.UNIFY_DATA_API_KEY) ??
      trimOrNull(process.env.UNIFY_API_KEY),
  ) && Boolean(trimOrNull(process.env.UNIFY_FUNNEL_OBJECT_NAME));
  const syncEnabled = parseEnabledFlag(process.env.UNIFY_FUNNEL_SYNC_ENABLED, apiConfigured);

  return {
    apiConfigured,
    syncEnabled,
    objectName: trimOrNull(process.env.UNIFY_FUNNEL_OBJECT_NAME),
  };
}

function enrichmentStatusNote(input: {
  provider: EnrichmentProvider;
  authConfigured: boolean;
  syncConfigured: boolean;
  syncEnabled: boolean;
  objectName?: string | null;
}): string {
  if (input.provider === "unify") {
    if (!input.syncEnabled) {
      return input.authConfigured
        ? "Push payloads to the v1 enrichment endpoint or enable scheduled Unify pulls."
        : "Configure Unify pull env vars or an enrichment secret for push delivery.";
    }

    if (!input.syncConfigured) {
      return "Missing UNIFY_DATA_API_KEY/UNIFY_API_KEY or UNIFY_FUNNEL_OBJECT_NAME.";
    }

    return `Scheduled pull enabled via /api/cron/sync${input.objectName ? ` for ${input.objectName}` : ""}.`;
  }

  return input.authConfigured
    ? "Provider can post payloads to the versioned enrichment endpoint."
    : "Set VISITOR_FUNNEL_ENRICH_SECRET or a provider-specific enrichment secret.";
}

export async function buildVisitorFunnelEnrichmentStatus(
  prisma: FunnelPrismaClient,
  now = new Date(),
): Promise<VisitorFunnelEnrichmentProviderStatus[]> {
  const unifyConfig = resolveUnifySyncConfig();

  return Promise.all(
    ENRICHMENT_PROVIDERS.map(async (provider) => {
      const prismaProvider = toPrismaEnrichmentProvider(provider);
      if (!prismaProvider) {
        throw new Error(`Unsupported enrichment provider "${provider}"`);
      }

      const [totalSignals, acceptedSignals, lastSignal, lastAcceptedSignal] = await Promise.all([
        prisma.funnelEnrichmentSignal.count({
          where: { provider: prismaProvider },
        }),
        prisma.funnelEnrichmentSignal.count({
          where: { provider: prismaProvider, accepted: true },
        }),
        prisma.funnelEnrichmentSignal.findFirst({
          where: { provider: prismaProvider },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          select: { occurredAt: true, createdAt: true },
        }),
        prisma.funnelEnrichmentSignal.findFirst({
          where: { provider: prismaProvider, accepted: true },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          select: { occurredAt: true, createdAt: true },
        }),
      ]);

      const authConfigured = hasProviderAuthSecret(provider);
      const syncConfigured =
        provider === "unify" ? unifyConfig.apiConfigured : authConfigured;
      const syncEnabled =
        provider === "unify" ? unifyConfig.syncEnabled : authConfigured;
      const lastSignalDate = lastSignal?.occurredAt ?? lastSignal?.createdAt ?? null;
      const lastAcceptedDate =
        lastAcceptedSignal?.occurredAt ?? lastAcceptedSignal?.createdAt ?? null;
      const stale = Boolean(
        syncConfigured &&
          lastSignalDate &&
          now.getTime() - lastSignalDate.getTime() > 7 * 24 * 60 * 60 * 1000,
      );

      return {
        provider,
        label: ENRICHMENT_PROVIDER_LABELS[provider],
        deliveryMode: provider === "unify" ? "cron_pull" : "webhook_push",
        endpointPath: `/api/v1/analytics/funnel/enrich/${provider}`,
        authConfigured,
        syncConfigured,
        syncEnabled,
        totalSignals,
        acceptedSignals,
        acceptedRate: pct(acceptedSignals, totalSignals),
        lastSignalAt: toIso(lastSignalDate),
        lastAcceptedAt: toIso(lastAcceptedDate),
        stale,
        note: enrichmentStatusNote({
          provider,
          authConfigured,
          syncConfigured,
          syncEnabled,
          objectName: provider === "unify" ? unifyConfig.objectName : null,
        }),
      };
    }),
  );
}

function toPrismaProvenance(value: VisitorLinkProvenance | null | undefined): FunnelLinkProvenance {
  switch (value) {
    case "inferred":
      return FunnelLinkProvenance.INFERRED;
    case "backfilled":
      return FunnelLinkProvenance.BACKFILLED;
    case "exact":
    default:
      return FunnelLinkProvenance.EXACT;
  }
}

function fromPrismaProvenance(value: FunnelLinkProvenance): VisitorLinkProvenance {
  switch (value) {
    case FunnelLinkProvenance.INFERRED:
      return "inferred";
    case FunnelLinkProvenance.BACKFILLED:
      return "backfilled";
    case FunnelLinkProvenance.EXACT:
    default:
      return "exact";
  }
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function stageRank(stage: VisitorFunnelStageId): number {
  return STAGE_ORDER.indexOf(stage);
}

function isoWeekStart(dateInput: Date | string): string {
  const date = new Date(dateInput);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function buildWeekBuckets(from: Date, to: Date): string[] {
  const buckets: string[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const firstBucket = new Date(isoWeekStart(cursor));
  for (let bucket = firstBucket; bucket <= to; bucket = new Date(bucket.getTime() + 7 * 24 * 60 * 60 * 1000)) {
    buckets.push(bucket.toISOString().slice(0, 10));
  }
  return buckets;
}

function milestoneOccurredBy(
  milestones: Map<VisitorFunnelStageId, string>,
  stage: Exclude<VisitorFunnelStageId, "visitors" | "identified">,
  cutoff: Date,
): string | null {
  const occurredAt = milestones.get(stage) ?? null;
  if (!occurredAt) return null;
  return new Date(occurredAt) <= cutoff ? occurredAt : null;
}

async function createFunnelEventIfMissing(
  prisma: FunnelPrismaClient,
  input: {
    visitorId: string;
    eventType: FunnelEventType;
    occurredAt: Date;
    source?: string | null;
    channel?: string | null;
    campaign?: string | null;
    path?: string | null;
    url?: string | null;
    referrer?: string | null;
    dedupeKey?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  },
): Promise<void> {
  const dedupeKey = trimOrNull(input.dedupeKey);
  if (dedupeKey) {
    await prisma.funnelEvent.upsert({
      where: { dedupeKey },
      update: {
        visitorId: input.visitorId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        source: input.source ?? null,
        channel: input.channel ?? null,
        campaign: input.campaign ?? null,
        path: input.path ?? null,
        url: input.url ?? null,
        referrer: input.referrer ?? null,
        metadata: input.metadata ?? {},
      },
      create: {
        visitorId: input.visitorId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        source: input.source ?? null,
        channel: input.channel ?? null,
        campaign: input.campaign ?? null,
        path: input.path ?? null,
        url: input.url ?? null,
        referrer: input.referrer ?? null,
        dedupeKey,
        metadata: input.metadata ?? {},
      },
    });
    return;
  }

  await prisma.funnelEvent.create({
    data: {
      visitorId: input.visitorId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      source: input.source ?? null,
      channel: input.channel ?? null,
      campaign: input.campaign ?? null,
      path: input.path ?? null,
      url: input.url ?? null,
      referrer: input.referrer ?? null,
      metadata: input.metadata ?? {},
    },
  });
}

async function syncIdentityLinks(
  prisma: FunnelPrismaClient,
  visitorId: string,
  identities: IdentityInput[],
): Promise<void> {
  for (const identity of identities) {
    const normalizedValue = normalizeIdentityValue(identity.type, identity.value);
    if (!normalizedValue) continue;

    await prisma.funnelIdentityLink.upsert({
      where: {
        visitorId_identityType_identityValue: {
          visitorId,
          identityType: identity.type,
          identityValue: normalizedValue,
        },
      },
      update: {
        provider: identity.provider,
        provenance: identity.provenance,
        confidence: identity.confidence,
        metadata: identity.metadata ?? undefined,
        userId: identity.userId ?? undefined,
      },
      create: {
        visitorId,
        identityType: identity.type,
        identityValue: normalizedValue,
        provider: identity.provider,
        provenance: identity.provenance,
        confidence: identity.confidence,
        metadata: identity.metadata ?? undefined,
        userId: identity.userId ?? undefined,
      },
    });
  }
}

async function findVisitorByIdentity(
  prisma: FunnelPrismaClient,
  identities: Array<Pick<IdentityInput, "type" | "value">>,
): Promise<Awaited<ReturnType<PrismaClient["funnelVisitor"]["findUnique"]>>> {
  if (identities.length === 0) return null;
  const candidates = identities
    .map((identity) => ({
      identityType: identity.type,
      identityValue: normalizeIdentityValue(identity.type, identity.value),
    }))
    .filter((identity) => identity.identityValue.length > 0);

  if (candidates.length === 0) return null;

  const link = await prisma.funnelIdentityLink.findFirst({
    where: {
      OR: candidates,
    },
    include: {
      visitor: true,
    },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
  });

  return link?.visitor ?? null;
}

async function createOrUpdateVisitor(
  prisma: FunnelPrismaClient,
  input: {
    anonymousId: string;
    occurredAt: Date;
    attribution: AttributionInfo;
  },
): Promise<PersistedVisitor> {
  const existing = await prisma.funnelVisitor.findUnique({
    where: { anonymousId: input.anonymousId },
  });

  const attribution = input.attribution;

  if (!existing) {
    return prisma.funnelVisitor.create({
      data: {
        anonymousId: input.anonymousId,
        siteHost: attribution.siteHost,
        firstTouchSource: attribution.source,
        firstTouchChannel: attribution.channel,
        firstTouchCampaign: attribution.campaign,
        firstTouchReferrer: attribution.referrer,
        firstTouchLandingPath: attribution.path,
        firstTouchLandingUrl: attribution.url,
        lastTouchSource: attribution.source,
        lastTouchChannel: attribution.channel,
        lastTouchCampaign: attribution.campaign,
        lastTouchReferrer: attribution.referrer,
        lastTouchPath: attribution.path,
        lastTouchUrl: attribution.url,
        firstSeenAt: input.occurredAt,
        lastSeenAt: input.occurredAt,
      },
    });
  }

  const update: Prisma.FunnelVisitorUpdateInput = {};
  if (input.occurredAt <= existing.firstSeenAt) {
    update.firstSeenAt = input.occurredAt;
    update.firstTouchSource = attribution.source ?? existing.firstTouchSource;
    update.firstTouchChannel = attribution.channel ?? existing.firstTouchChannel;
    update.firstTouchCampaign = attribution.campaign ?? existing.firstTouchCampaign;
    update.firstTouchReferrer = attribution.referrer ?? existing.firstTouchReferrer;
    update.firstTouchLandingPath = attribution.path ?? existing.firstTouchLandingPath;
    update.firstTouchLandingUrl = attribution.url ?? existing.firstTouchLandingUrl;
  }
  if (input.occurredAt >= existing.lastSeenAt) {
    update.lastSeenAt = input.occurredAt;
    update.lastTouchSource = attribution.source ?? existing.lastTouchSource;
    update.lastTouchChannel = attribution.channel ?? existing.lastTouchChannel;
    update.lastTouchCampaign = attribution.campaign ?? existing.lastTouchCampaign;
    update.lastTouchReferrer = attribution.referrer ?? existing.lastTouchReferrer;
    update.lastTouchPath = attribution.path ?? existing.lastTouchPath;
    update.lastTouchUrl = attribution.url ?? existing.lastTouchUrl;
    update.siteHost = attribution.siteHost ?? existing.siteHost;
  }

  if (Object.keys(update).length === 0) {
    return existing;
  }

  return prisma.funnelVisitor.update({
    where: { id: existing.id },
    data: update,
  });
}

async function ensureVisitorForKnownIdentity(
  prisma: FunnelPrismaClient,
  input: {
    anonymousId?: string | null;
    occurredAt: Date;
    attribution: AttributionInfo;
    identities: IdentityInput[];
  },
): Promise<PersistedVisitor> {
  const anonymousId = trimOrNull(input.anonymousId);
  if (anonymousId) {
    const visitor = await createOrUpdateVisitor(prisma, {
      anonymousId,
      occurredAt: input.occurredAt,
      attribution: input.attribution,
    });
    await syncIdentityLinks(prisma, visitor.id, input.identities);
    return visitor;
  }

  const visitor =
    (await findVisitorByIdentity(
      prisma,
      input.identities.map((identity) => ({ type: identity.type, value: identity.value })),
    )) ??
    (await createOrUpdateVisitor(prisma, {
      anonymousId:
        syntheticAnonymousId(input.identities[0]?.type ?? FunnelIdentityType.EMAIL, input.identities[0]?.value ?? stableHash(input.occurredAt.toISOString())),
      occurredAt: input.occurredAt,
      attribution: input.attribution,
    }));

  await syncIdentityLinks(prisma, visitor.id, input.identities);
  return visitor;
}

function hubspotAttribution(deal: HubSpotDeal): AttributionInfo {
  const analytics = deal.primaryContactAnalytics;
  const source = normalizeSource(
    analytics?.utmSource ?? analytics?.sourceData1 ?? analytics?.source ?? deal.source,
  );
  const campaign = normalizeCampaign(analytics?.utmCampaign);
  const referrer = trimOrNull(analytics?.firstUrl);
  return {
    source,
    channel: mapMediumToChannel(analytics?.utmMedium, source, referrer),
    campaign,
    referrer,
    path: trimOrNull(analytics?.firstUrl),
    url: trimOrNull(analytics?.firstUrl),
    siteHost: hostFromUrl(analytics?.firstUrl),
  };
}

function hubspotOccurredAt(deal: HubSpotDeal): Date {
  return (
    safeOptionalDate(deal.primaryContactAnalytics?.firstSeenAt) ??
    safeOptionalDate(deal.createdAt) ??
    safeOptionalDate(deal.updatedAt) ??
    new Date()
  );
}

async function syncHubSpotMilestones(
  prisma: FunnelPrismaClient,
  data: AnalyticsDashboardData,
): Promise<void> {
  const deals = data.hubspot?.deals ?? [];
  for (const deal of deals) {
    const identities: IdentityInput[] = [];
    const email = normalizeEmail(deal.primaryContactEmail);
    if (email) {
      identities.push({
        type: FunnelIdentityType.EMAIL,
        value: email,
        provider: "hubspot",
        provenance: FunnelLinkProvenance.BACKFILLED,
        confidence: 0.95,
      });
    }
    if (deal.primaryContactId) {
      identities.push({
        type: FunnelIdentityType.HUBSPOT_CONTACT_ID,
        value: deal.primaryContactId,
        provider: "hubspot",
        provenance: FunnelLinkProvenance.BACKFILLED,
        confidence: 1,
      });
    }
    identities.push({
      type: FunnelIdentityType.HUBSPOT_DEAL_ID,
      value: deal.dealId,
      provider: "hubspot",
      provenance: FunnelLinkProvenance.BACKFILLED,
      confidence: 1,
    });
    if (deal.stripeCustomerId) {
      identities.push({
        type: FunnelIdentityType.STRIPE_CUSTOMER_ID,
        value: deal.stripeCustomerId,
        provider: "hubspot",
        provenance: FunnelLinkProvenance.BACKFILLED,
        confidence: 0.9,
      });
    }

    if (identities.length === 0) continue;

    const visitor = await ensureVisitorForKnownIdentity(prisma, {
      occurredAt: hubspotOccurredAt(deal),
      attribution: hubspotAttribution(deal),
      identities,
    });

    const demoStage = deal.stageHistory?.find((stage) =>
      stage.stageLabel.trim().toLowerCase() === "demo scheduled",
    );
    if (DEMO_STAGES.has(deal.stageLabel) || demoStage) {
      const occurredAt =
        safeOptionalDate(demoStage?.occurredAt) ??
        safeOptionalDate(deal.updatedAt) ??
        safeOptionalDate(deal.createdAt) ??
        hubspotOccurredAt(deal);

      await createFunnelEventIfMissing(prisma, {
        visitorId: visitor.id,
        eventType: FunnelEventType.DEMO_BOOKED,
        occurredAt,
        source: visitor.firstTouchSource,
        channel: visitor.firstTouchChannel,
        campaign: visitor.firstTouchCampaign,
        dedupeKey: `demo_booked:${deal.dealId}`,
        metadata: {
          dealId: deal.dealId,
          dealName: deal.dealName,
          stageLabel: deal.stageLabel,
        },
      });
    }
  }
}

async function syncCodaMilestones(
  prisma: FunnelPrismaClient,
  data: AnalyticsDashboardData,
): Promise<void> {
  const submitters = data.coda?.recentSubmitters ?? data.codaKanban?.recentSubmitters ?? [];
  for (const submitter of submitters) {
    const email = normalizeEmail(submitter.email);
    if (!email) continue;
    const occurredAt =
      safeOptionalDate(submitter.firstSubmittedAt) ??
      safeOptionalDate(submitter.lastSubmittedAt) ??
      new Date();
    const visitor = await ensureVisitorForKnownIdentity(prisma, {
      occurredAt,
      attribution: {
        source: "coda",
        channel: "kanban-generator",
        campaign: null,
        referrer: null,
        path: null,
        url: null,
        siteHost: null,
      },
      identities: [
        {
          type: FunnelIdentityType.CODA_EMAIL,
          value: email,
          provider: "coda",
          provenance: FunnelLinkProvenance.BACKFILLED,
          confidence: 0.95,
        },
        {
          type: FunnelIdentityType.EMAIL,
          value: email,
          provider: "coda",
          provenance: FunnelLinkProvenance.INFERRED,
          confidence: 0.85,
        },
      ],
    });

    await createFunnelEventIfMissing(prisma, {
      visitorId: visitor.id,
      eventType: FunnelEventType.KANBAN_CARD_CREATED,
      occurredAt,
      source: visitor.firstTouchSource ?? "coda",
      channel: visitor.firstTouchChannel ?? "kanban-generator",
      campaign: visitor.firstTouchCampaign,
      dedupeKey: `kanban_card_created:${email}`,
      metadata: {
        creator: submitter.creator,
        cardsCreated: submitter.cardsCreated,
      },
    });
  }
}

async function fetchStripeStatusByCustomerId(
  apiKey: string,
  customerId: string,
): Promise<StripeStatusRecord | null> {
  const url = new URL("https://api.stripe.com/v1/subscriptions");
  url.searchParams.set("customer", customerId);
  url.searchParams.set("status", "all");
  url.searchParams.set("limit", "25");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    data?: Array<{
      status?: string | null;
      created?: number | null;
      trial_start?: number | null;
      current_period_start?: number | null;
    }>;
  };

  const subscriptions = payload.data ?? [];
  if (subscriptions.length === 0) {
    return { subscriptionStatus: "none", occurredAt: null };
  }

  const active = subscriptions.find((subscription) => subscription.status === "active");
  if (active) {
    const occurredAt = active.current_period_start ?? active.created ?? null;
    return {
      subscriptionStatus: "active",
      occurredAt: occurredAt ? new Date(occurredAt * 1000).toISOString() : null,
    };
  }

  const trialing = subscriptions.find((subscription) => subscription.status === "trialing");
  if (trialing) {
    const occurredAt = trialing.trial_start ?? trialing.created ?? null;
    return {
      subscriptionStatus: "trialing",
      occurredAt: occurredAt ? new Date(occurredAt * 1000).toISOString() : null,
    };
  }

  return {
    subscriptionStatus: "unknown",
    occurredAt: null,
  };
}

async function syncStripeMilestones(
  prisma: FunnelPrismaClient,
  stripeKey: string | null,
  from: Date,
  to: Date,
): Promise<void> {
  if (!stripeKey) return;

  const visitors = await prisma.funnelVisitor.findMany({
    where: {
      firstSeenAt: {
        lte: to,
      },
    },
    include: {
      identityLinks: true,
      events: {
        where: {
          eventType: {
            in: [FunnelEventType.TRIAL_STARTED, FunnelEventType.PAID_CUSTOMER],
          },
        },
      },
    },
    orderBy: {
      firstSeenAt: "desc",
    },
  });

  const emailInputs: Array<{ visitorId: string; email: string; firstSeenAt: Date; lastSeenAt: Date }> = [];
  const customerInputs: Array<{ visitorId: string; customerId: string; firstSeenAt: Date; lastSeenAt: Date }> = [];

  for (const visitor of visitors) {
    const emailSet = new Set<string>();
    const customerSet = new Set<string>();
    for (const identity of visitor.identityLinks) {
      if (EMAIL_IDENTITY_TYPES.has(identity.identityType)) {
        const email = normalizeEmail(identity.identityValue);
        if (email) emailSet.add(email);
      }
      if (identity.identityType === FunnelIdentityType.STRIPE_CUSTOMER_ID) {
        const customerId = trimOrNull(identity.identityValue);
        if (customerId) customerSet.add(customerId);
      }
    }

    for (const email of emailSet) {
      emailInputs.push({
        visitorId: visitor.id,
        email,
        firstSeenAt: visitor.firstSeenAt,
        lastSeenAt: visitor.lastSeenAt,
      });
    }
    for (const customerId of customerSet) {
      customerInputs.push({
        visitorId: visitor.id,
        customerId,
        firstSeenAt: visitor.firstSeenAt,
        lastSeenAt: visitor.lastSeenAt,
      });
    }
  }

  const emailMap = await enrichStripeEmails({
    apiKey: stripeKey,
    emails: [...new Set(emailInputs.map((entry) => entry.email))],
    now: new Date(),
    concurrency: 4,
    timeoutMs: 3_500,
  });

  const customerStatusMap = new Map<string, StripeStatusRecord | null>();
  for (const customerId of [...new Set(customerInputs.map((entry) => entry.customerId))]) {
    customerStatusMap.set(customerId, await fetchStripeStatusByCustomerId(stripeKey, customerId));
  }

  const seenDedupeKeys = new Set<string>();

  for (const entry of emailInputs) {
    const enrichment = emailMap.get(entry.email);
    if (!enrichment?.matched) continue;

    if (enrichment.subscriptionStatus === "trialing") {
      const dedupeKey = `trial_started:email:${entry.email}`;
      if (!seenDedupeKeys.has(dedupeKey)) {
        seenDedupeKeys.add(dedupeKey);
        await createFunnelEventIfMissing(prisma, {
          visitorId: entry.visitorId,
          eventType: FunnelEventType.TRIAL_STARTED,
          occurredAt: safeDate(enrichment.lastPaymentAt, entry.lastSeenAt),
          dedupeKey,
          metadata: {
            email: entry.email,
            approximate: true,
            matchedBy: "email",
          },
        });
      }
    }

    if (enrichment.subscriptionStatus === "active") {
      const dedupeKey = `paid_customer:email:${entry.email}`;
      if (!seenDedupeKeys.has(dedupeKey)) {
        seenDedupeKeys.add(dedupeKey);
        await createFunnelEventIfMissing(prisma, {
          visitorId: entry.visitorId,
          eventType: FunnelEventType.PAID_CUSTOMER,
          occurredAt: safeDate(enrichment.lastPaymentAt, entry.lastSeenAt),
          dedupeKey,
          metadata: {
            email: entry.email,
            customerId: enrichment.customerId,
            approximate: true,
            matchedBy: "email",
          },
        });
      }
    }
  }

  for (const entry of customerInputs) {
    const status = customerStatusMap.get(entry.customerId);
    if (!status) continue;

    if (status.subscriptionStatus === "trialing") {
      await createFunnelEventIfMissing(prisma, {
        visitorId: entry.visitorId,
        eventType: FunnelEventType.TRIAL_STARTED,
        occurredAt: safeDate(status.occurredAt, entry.lastSeenAt),
        dedupeKey: `trial_started:customer:${entry.customerId}`,
        metadata: {
          customerId: entry.customerId,
          approximate: status.occurredAt == null,
          matchedBy: "customer_id",
        },
      });
    }

    if (status.subscriptionStatus === "active") {
      await createFunnelEventIfMissing(prisma, {
        visitorId: entry.visitorId,
        eventType: FunnelEventType.PAID_CUSTOMER,
        occurredAt: safeDate(status.occurredAt, entry.lastSeenAt),
        dedupeKey: `paid_customer:customer:${entry.customerId}`,
        metadata: {
          customerId: entry.customerId,
          approximate: status.occurredAt == null,
          matchedBy: "customer_id",
        },
      });
    }
  }
}

function parseMilestones(
  visitor: RawVisitorRecord,
  cutoff: Date,
): {
  milestones: VisitorMilestone[];
  deepestStage: VisitorFunnelStageId;
  identified: boolean;
} {
  const eventMap = new Map<VisitorFunnelStageId, string>();

  for (const event of visitor.events) {
    const occurredAtIso = toIso(event.occurredAt);
    if (!occurredAtIso) continue;
    const occurredAt = new Date(occurredAtIso);
    if (occurredAt > cutoff) continue;

    switch (event.eventType) {
      case FunnelEventType.DEMO_BOOKED:
        eventMap.set("demo_booked", occurredAtIso);
        break;
      case FunnelEventType.KANBAN_CARD_CREATED:
        eventMap.set("kanban_card_created", occurredAtIso);
        break;
      case FunnelEventType.TRIAL_STARTED:
        eventMap.set("trial_started", occurredAtIso);
        break;
      case FunnelEventType.PAID_CUSTOMER:
        eventMap.set("paid_customer", occurredAtIso);
        break;
      default:
        break;
    }
  }

  const identified = visitor.identityLinks.length > 0;
  const milestones: VisitorMilestone[] = [];
  if (identified) {
    milestones.push({
      stage: "identified",
      occurredAt: visitor.identityLinks[0]?.updatedAt
        ? new Date(visitor.identityLinks[0].updatedAt).toISOString()
        : null,
    });
  }

  for (const stage of STAGE_ORDER) {
    if (stage === "visitors" || stage === "identified") continue;
    const occurredAt = milestoneOccurredBy(eventMap, stage, cutoff);
    if (!occurredAt) continue;
    milestones.push({ stage, occurredAt });
  }

  let deepestStage: VisitorFunnelStageId = "visitors";
  if (identified) deepestStage = "identified";
  for (const milestone of milestones) {
    if (stageRank(milestone.stage) > stageRank(deepestStage)) {
      deepestStage = milestone.stage;
    }
  }

  return { milestones, deepestStage, identified };
}

function buildRecord(
  visitor: RawVisitorRecord,
  cutoff: Date,
): VisitorFunnelRecord {
  const { milestones, deepestStage, identified } = parseMilestones(visitor, cutoff);

  const providerAgg = new Map<string, VisitorFunnelProviderEvidence>();
  for (const signal of visitor.enrichmentSignals) {
    const provider = providerSlug(signal.provider);
    const existing = providerAgg.get(provider) ?? {
      provider,
      accepted: false,
      signalCount: 0,
    };
    existing.signalCount += 1;
    existing.accepted = existing.accepted || signal.accepted;
    providerAgg.set(provider, existing);
  }

  return {
    visitorId: visitor.id,
    anonymousId: visitor.anonymousId,
    firstSeenAt: visitor.firstSeenAt.toISOString(),
    lastSeenAt: visitor.lastSeenAt.toISOString(),
    firstTouchSource: visitor.firstTouchSource ?? null,
    firstTouchChannel: visitor.firstTouchChannel ?? null,
    firstTouchCampaign: visitor.firstTouchCampaign ?? null,
    firstTouchReferrer: visitor.firstTouchReferrer ?? null,
    landingPath: visitor.firstTouchLandingPath ?? null,
    identified,
    deepestStage,
    milestones,
    identities: visitor.identityLinks.map((identity) => ({
      type: identity.identityType,
      value: identity.identityValue,
      provider: identity.provider,
      provenance: fromPrismaProvenance(identity.provenance),
      confidence: identity.confidence,
    })),
    providers: [...providerAgg.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
  };
}

export function parseVisitorFunnelFilters(searchParams: URLSearchParams): VisitorFunnelFilters {
  const channel = trimOrNull(searchParams.get("channel")) ?? "all";
  const source = normalizeSource(searchParams.get("source"));
  const campaign = normalizeCampaign(searchParams.get("campaign"));
  const stageParam = trimOrNull(searchParams.get("stage")) ?? "all";
  const quickFilter = trimOrNull(searchParams.get("quickFilter")) === "reddit" ? "reddit" : "all";
  const knownOnly = searchParams.get("knownOnly") === "true";

  const stage = STAGE_ORDER.includes(stageParam as VisitorFunnelStageId)
    ? (stageParam as VisitorFunnelStageId)
    : "all";

  return {
    channel,
    source,
    campaign,
    stage,
    knownOnly,
    quickFilter,
  };
}

async function loadVisitorRecords(
  prisma: FunnelPrismaClient,
  input: {
    from: Date;
    to: Date;
    filters: VisitorFunnelFilters;
  },
): Promise<VisitorFunnelRecord[]> {
  const where: Prisma.FunnelVisitorWhereInput = {
    firstSeenAt: {
      gte: input.from,
      lte: input.to,
    },
  };

  if (input.filters.channel !== "all") {
    where.firstTouchChannel = input.filters.channel;
  }
  if (input.filters.source) {
    where.firstTouchSource = input.filters.source;
  }
  if (input.filters.campaign) {
    where.firstTouchCampaign = input.filters.campaign;
  }
  if (input.filters.quickFilter === "reddit") {
    where.OR = [
      { firstTouchChannel: "reddit" },
      { firstTouchSource: { startsWith: "reddit" } },
      { firstTouchReferrer: { contains: "reddit.com" } },
    ];
  }
  if (input.filters.knownOnly) {
    where.identityLinks = { some: {} };
  }

  const visitors = await loadVisitorsForRecords(prisma, where);

  const records = visitors.map((visitor) => buildRecord(visitor, input.to));
  if (input.filters.stage === "all") return records;
  return records.filter((record) => record.deepestStage === input.filters.stage);
}

async function loadVisitorsForRecords(
  prisma: FunnelPrismaClient,
  where: Prisma.FunnelVisitorWhereInput,
) {
  return prisma.funnelVisitor.findMany({
    where,
    include: {
      events: {
        orderBy: { occurredAt: "asc" },
      },
      identityLinks: {
        orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      },
      enrichmentSignals: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { firstSeenAt: "desc" },
  });
}

function collectBreakdown(
  records: VisitorFunnelRecord[],
  keySelector: (record: VisitorFunnelRecord) => string | null,
): VisitorFunnelBreakdownRow[] {
  const rows = new Map<string, VisitorFunnelBreakdownRow>();

  for (const record of records) {
    const key = keySelector(record) ?? "unknown";
    const existing = rows.get(key) ?? {
      key,
      visitors: 0,
      identified: 0,
      demoBooked: 0,
      kanbanCards: 0,
      trialsStarted: 0,
      paidCustomers: 0,
    };

    existing.visitors += 1;
    if (record.identified) existing.identified += 1;
    if (record.milestones.some((milestone) => milestone.stage === "demo_booked")) existing.demoBooked += 1;
    if (record.milestones.some((milestone) => milestone.stage === "kanban_card_created")) existing.kanbanCards += 1;
    if (record.milestones.some((milestone) => milestone.stage === "trial_started")) existing.trialsStarted += 1;
    if (record.milestones.some((milestone) => milestone.stage === "paid_customer")) existing.paidCustomers += 1;
    rows.set(key, existing);
  }

  return [...rows.values()]
    .sort((a, b) => b.visitors - a.visitors || a.key.localeCompare(b.key))
    .slice(0, 12);
}

function collectOverlap(records: VisitorFunnelRecord[]): VisitorFunnelOverlap[] {
  const overlaps: VisitorFunnelOverlap[] = [];
  const combinations: Array<[VisitorMilestone["stage"], VisitorMilestone["stage"]]> = [
    ["demo_booked", "kanban_card_created"],
    ["demo_booked", "trial_started"],
    ["demo_booked", "paid_customer"],
    ["kanban_card_created", "trial_started"],
    ["kanban_card_created", "paid_customer"],
    ["trial_started", "paid_customer"],
  ];

  for (const [left, right] of combinations) {
    overlaps.push({
      key: `${left}+${right}`,
      count: records.filter((record) => {
        const stageSet = new Set(record.milestones.map((milestone) => milestone.stage));
        return stageSet.has(left) && stageSet.has(right);
      }).length,
    });
  }

  return overlaps;
}

function collectTrends(
  records: VisitorFunnelRecord[],
  from: Date,
  to: Date,
): VisitorFunnelTrendPoint[] {
  const weeks = buildWeekBuckets(from, to);
  const byWeek = new Map<string, VisitorFunnelTrendPoint>();

  for (const week of weeks) {
    byWeek.set(week, {
      week,
      visitors: 0,
      identified: 0,
      demo_booked: 0,
      kanban_card_created: 0,
      trial_started: 0,
      paid_customer: 0,
    });
  }

  for (const record of records) {
    const visitorWeek = isoWeekStart(record.firstSeenAt);
    const visitorBucket = byWeek.get(visitorWeek);
    if (visitorBucket) {
      visitorBucket.visitors += 1;
    }

    if (record.identified) {
      const identifiedAt =
        record.milestones.find((milestone) => milestone.stage === "identified")?.occurredAt ??
        record.firstSeenAt;
      const week = isoWeekStart(identifiedAt);
      const identifiedBucket = byWeek.get(week);
      if (identifiedBucket) {
        identifiedBucket.identified += 1;
      }
    }

    for (const milestone of record.milestones) {
      if (milestone.stage === "identified" || !milestone.occurredAt) continue;
      const week = isoWeekStart(milestone.occurredAt);
      const bucket = byWeek.get(week);
      if (bucket) {
        switch (milestone.stage) {
          case "demo_booked":
            bucket.demo_booked += 1;
            break;
          case "kanban_card_created":
            bucket.kanban_card_created += 1;
            break;
          case "trial_started":
            bucket.trial_started += 1;
            break;
          case "paid_customer":
            bucket.paid_customer += 1;
            break;
        }
      }
    }
  }

  return [...byWeek.values()];
}

export async function collectVisitorEvent(
  prisma: FunnelPrismaClient,
  input: VisitorEventCollectorInput,
  requestMeta: { siteHost?: string | null } = {},
): Promise<{ visitorId: string; anonymousId: string }> {
  const occurredAt = safeDate(input.occurredAt, new Date());
  const attribution = deriveAttribution({
    path: input.path,
    url: input.url,
    referrer: input.referrer,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    siteHost: requestMeta.siteHost,
  });

  const identities: IdentityInput[] = [];
  if (input.userId) {
    identities.push({
      type: FunnelIdentityType.USER_ID,
      value: input.userId,
      provider: "collector",
      provenance: FunnelLinkProvenance.EXACT,
      confidence: 1,
      userId: input.userId,
    });
  }
  if (input.email) {
    identities.push({
      type: FunnelIdentityType.EMAIL,
      value: input.email,
      provider: "collector",
      provenance: FunnelLinkProvenance.EXACT,
      confidence: 1,
      userId: input.userId ?? null,
    });
  }

  const visitor = await ensureVisitorForKnownIdentity(prisma, {
    anonymousId: input.anonymousId,
    occurredAt,
    attribution,
    identities,
  });

  await createFunnelEventIfMissing(prisma, {
    visitorId: visitor.id,
    eventType: input.eventType,
    occurredAt,
    source: attribution.source,
    channel: attribution.channel,
    campaign: attribution.campaign,
    path: attribution.path,
    url: attribution.url,
    referrer: attribution.referrer,
    dedupeKey: input.dedupeKey ?? null,
    metadata: input.metadata ?? {},
  });

  return {
    visitorId: visitor.id,
    anonymousId: visitor.anonymousId,
  };
}

export async function ingestVisitorEnrichmentSignals(
  prisma: FunnelPrismaClient,
  provider: EnrichmentProvider,
  signals: VisitorEnrichmentSignalInput[],
): Promise<{ accepted: number; stored: number }> {
  const prismaProvider = toPrismaEnrichmentProvider(provider);
  if (!prismaProvider) {
    throw new Error(`Unsupported enrichment provider "${provider}"`);
  }

  let accepted = 0;

  for (const signal of signals) {
    const anonymousId = trimOrNull(signal.anonymousId);
    const email = normalizeEmail(signal.email);
    const domain = normalizeSource(signal.domain);
    const confidence = Math.max(0, Math.min(1, signal.confidence ?? 0));
    const occurrence = safeOptionalDate(signal.occurredAt) ?? new Date();

    let visitor =
      (anonymousId
        ? await prisma.funnelVisitor.findUnique({ where: { anonymousId } })
        : null) ??
      (email
        ? await findVisitorByIdentity(prisma, [
            { type: FunnelIdentityType.EMAIL, value: email },
            { type: FunnelIdentityType.CODA_EMAIL, value: email },
          ])
        : null);

    const signalKey =
      trimOrNull(signal.signalKey) ??
      stableHash(JSON.stringify({
        provider,
        anonymousId,
        email,
        domain,
        occurredAt: occurrence.toISOString(),
      }));

    const stored = await prisma.funnelEnrichmentSignal.upsert({
      where: {
        provider_signalKey: {
          provider: prismaProvider,
          signalKey,
        },
      },
      update: {
        visitorId: visitor?.id ?? null,
        anonymousId,
        email,
        domain,
        fullName: trimOrNull(signal.fullName),
        companyName: trimOrNull(signal.companyName),
        confidence,
        occurredAt: occurrence,
        accepted: false,
        metadata: signal.metadata ?? {},
        payload: signal.payload ?? signal.metadata ?? {},
      },
      create: {
        provider: prismaProvider,
        signalKey,
        visitorId: visitor?.id ?? null,
        anonymousId,
        email,
        domain,
        fullName: trimOrNull(signal.fullName),
        companyName: trimOrNull(signal.companyName),
        confidence,
        occurredAt: occurrence,
        accepted: false,
        metadata: signal.metadata ?? {},
        payload: signal.payload ?? signal.metadata ?? {},
      },
    });

    if (!visitor && email) {
      visitor = await ensureVisitorForKnownIdentity(prisma, {
        occurredAt: occurrence,
        attribution: {
          source: domain,
          channel: domain ? "deanonymized" : null,
          campaign: null,
          referrer: null,
          path: null,
          url: null,
          siteHost: null,
        },
        identities: [
          {
            type: FunnelIdentityType.EMAIL,
            value: email,
            provider,
            provenance: toPrismaProvenance(signal.provenance ?? "backfilled"),
            confidence: Math.max(confidence, 0.8),
            metadata: signal.metadata ?? null,
          },
        ],
      });
    }

    if (!visitor && anonymousId) {
      visitor = await createOrUpdateVisitor(prisma, {
        anonymousId,
        occurredAt: occurrence,
        attribution: {
          source: stored.domain ?? null,
          channel: stored.domain ? "deanonymized" : null,
          campaign: null,
          referrer: null,
          path: null,
          url: null,
          siteHost: null,
        },
      });
    }

    const shouldAccept = confidence >= 0.8 && Boolean(visitor);
    await prisma.funnelEnrichmentSignal.update({
      where: { id: stored.id },
      data: {
        visitorId: visitor?.id ?? null,
        accepted: shouldAccept,
      },
    });

    if (shouldAccept) {
      accepted += 1;
    }

    if (visitor && shouldAccept) {
      const identities: IdentityInput[] = [];
      if (email) {
        identities.push({
          type: FunnelIdentityType.EMAIL,
          value: email,
          provider,
          provenance: toPrismaProvenance(signal.provenance ?? (anonymousId ? "exact" : "inferred")),
          confidence,
          metadata: signal.metadata ?? null,
        });
      }
      await syncIdentityLinks(prisma, visitor.id, identities);
    }
  }

  return {
    accepted,
    stored: signals.length,
  };
}

export async function syncVisitorFunnelArtifacts(input: {
  prisma: FunnelPrismaClient;
  analyticsData: AnalyticsDashboardData;
  stripeKey: string | null;
  from: Date;
  to: Date;
}): Promise<void> {
  await syncHubSpotMilestones(input.prisma, input.analyticsData);
  await syncCodaMilestones(input.prisma, input.analyticsData);
  await syncStripeMilestones(input.prisma, input.stripeKey, input.from, input.to);
}

export async function buildVisitorFunnelData(
  prisma: FunnelPrismaClient,
  input: {
    from: Date;
    to: Date;
    filters: VisitorFunnelFilters;
    closedWonCount?: number;
    includeOperationalMetadata?: boolean;
  },
): Promise<VisitorFunnelData> {
  const [records, enrichmentStatus] = await Promise.all([
    loadVisitorRecords(prisma, {
      from: input.from,
      to: input.to,
      filters: input.filters,
    }),
    input.includeOperationalMetadata === false
      ? Promise.resolve([])
      : buildVisitorFunnelEnrichmentStatus(prisma),
  ]);
  const enrichmentAlerts: VisitorFunnelEnrichmentAlert[] =
    input.includeOperationalMetadata === false
      ? []
      : buildVisitorFunnelEnrichmentAlerts(enrichmentStatus, input.to);

  const stages: VisitorFunnelStageCount[] = [];
  let previousCount = 0;
  const totals = {
    visitors: records.length,
    identified: records.filter((record) => record.identified).length,
    demoBooked: records.filter((record) =>
      record.milestones.some((milestone) => milestone.stage === "demo_booked"),
    ).length,
    kanbanCards: records.filter((record) =>
      record.milestones.some((milestone) => milestone.stage === "kanban_card_created"),
    ).length,
    trialsStarted: records.filter((record) =>
      record.milestones.some((milestone) => milestone.stage === "trial_started"),
    ).length,
    paidCustomers: records.filter((record) =>
      record.milestones.some((milestone) => milestone.stage === "paid_customer"),
    ).length,
  };

  const stageCounts: Record<VisitorFunnelStageId, number> = {
    visitors: totals.visitors,
    identified: totals.identified,
    demo_booked: totals.demoBooked,
    kanban_card_created: totals.kanbanCards,
    trial_started: totals.trialsStarted,
    paid_customer: totals.paidCustomers,
  };

  for (const stage of STAGE_ORDER) {
    const count = stageCounts[stage];
    stages.push({
      stage,
      label: STAGE_LABELS[stage],
      count,
      conversionFromVisitors: pct(count, totals.visitors),
      conversionFromPrevious: previousCount > 0 ? pct(count, previousCount) : null,
    });
    previousCount = count;
  }

  const availableChannels = [...new Set(records.map((record) => record.firstTouchChannel).filter(Boolean) as string[])]
    .sort();
  const availableSources = [...new Set(records.map((record) => record.firstTouchSource).filter(Boolean) as string[])]
    .sort();
  const availableCampaigns = [...new Set(records.map((record) => record.firstTouchCampaign).filter(Boolean) as string[])]
    .sort();

  const filterParams = new URLSearchParams({
    from: input.from.toISOString().slice(0, 10),
    to: input.to.toISOString().slice(0, 10),
    channel: input.filters.channel,
    quickFilter: input.filters.quickFilter,
  });
  if (input.filters.source) filterParams.set("source", input.filters.source);
  if (input.filters.campaign) filterParams.set("campaign", input.filters.campaign);
  if (input.filters.stage !== "all") filterParams.set("stage", input.filters.stage);
  if (input.filters.knownOnly) filterParams.set("knownOnly", "true");

  return {
    filters: input.filters,
    stages,
    trends: collectTrends(records, input.from, input.to),
    channelBreakdown: collectBreakdown(records, (record) => record.firstTouchChannel),
    sourceBreakdown: collectBreakdown(records, (record) => record.firstTouchSource),
    campaignBreakdown: collectBreakdown(records, (record) => record.firstTouchCampaign),
    overlaps: collectOverlap(records),
    availableChannels,
    availableSources,
    availableCampaigns,
    totals,
    recordsApi: {
      href: `/api/analytics/visitor-funnel/records?${filterParams.toString()}`,
      adminOnly: true,
    },
    secondaryMetrics: {
      closedWonCount: input.closedWonCount ?? 0,
    },
    enrichmentStatus: {
      adminOnly: true,
      alerts: enrichmentAlerts,
      providers: enrichmentStatus,
    },
  };
}

export async function listVisitorFunnelRecords(
  prisma: FunnelPrismaClient,
  input: VisitorRecordsQuery,
): Promise<VisitorRecordsPage> {
  const allRecords = await loadVisitorRecords(prisma, {
    from: input.from,
    to: input.to,
    filters: input.filters,
  });

  const startIndex = (input.page - 1) * input.pageSize;
  const records = allRecords.slice(startIndex, startIndex + input.pageSize);

  return {
    records,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: allRecords.length,
      totalPages: Math.max(1, Math.ceil(allRecords.length / input.pageSize)),
    },
  };
}
