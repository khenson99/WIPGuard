import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaInstagramData,
  fetchMetaPageData,
  fetchRedditAdsData,
} from "@/lib/analytics/fetchers-ads";
import { fetchMercuryData, fetchStripeData } from "@/lib/analytics/fetchers";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";
import {
  snapshotExpiryFromNow,
  storeAnalyticsSnapshot,
} from "@/lib/analytics/snapshots";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { prisma } from "@/lib/prisma";

export const GOOGLE_ADS_METRICS_RULE_KEY = "google_ads_metrics_pull";
export const META_ADS_METRICS_RULE_KEY = "meta_ads_metrics_pull";
export const META_PAGE_METRICS_RULE_KEY = "meta_page_metrics_pull";
export const META_INSTAGRAM_METRICS_RULE_KEY = "meta_instagram_metrics_pull";
export const REDDIT_ADS_METRICS_RULE_KEY = "reddit_ads_metrics_pull";
export const STRIPE_REVENUE_SYNC_RULE_KEY = "stripe_revenue_sync";
export const MERCURY_CASHFLOW_SYNC_RULE_KEY = "mercury_cashflow_sync";
export const PYLON_CONVERSATION_SYNC_RULE_KEY = "pylon_conversation_sync";

export type ProviderMetricsRuleKey =
  | typeof GOOGLE_ADS_METRICS_RULE_KEY
  | typeof META_ADS_METRICS_RULE_KEY
  | typeof META_PAGE_METRICS_RULE_KEY
  | typeof META_INSTAGRAM_METRICS_RULE_KEY
  | typeof REDDIT_ADS_METRICS_RULE_KEY
  | typeof STRIPE_REVENUE_SYNC_RULE_KEY
  | typeof MERCURY_CASHFLOW_SYNC_RULE_KEY
  | typeof PYLON_CONVERSATION_SYNC_RULE_KEY;

interface ProviderMetricsDefinition {
  key: ProviderMetricsRuleKey;
  provider: IntegrationProvider;
  snapshotKey: string;
}

const PROVIDER_METRICS_DEFINITIONS: Record<ProviderMetricsRuleKey, ProviderMetricsDefinition> = {
  [GOOGLE_ADS_METRICS_RULE_KEY]: {
    key: GOOGLE_ADS_METRICS_RULE_KEY,
    provider: IntegrationProvider.GOOGLE_ADS,
    snapshotKey: "googleAds",
  },
  [META_ADS_METRICS_RULE_KEY]: {
    key: META_ADS_METRICS_RULE_KEY,
    provider: IntegrationProvider.META_ADS,
    snapshotKey: "metaAds",
  },
  [META_PAGE_METRICS_RULE_KEY]: {
    key: META_PAGE_METRICS_RULE_KEY,
    provider: IntegrationProvider.META_PAGE,
    snapshotKey: "metaPage",
  },
  [META_INSTAGRAM_METRICS_RULE_KEY]: {
    key: META_INSTAGRAM_METRICS_RULE_KEY,
    provider: IntegrationProvider.META_PAGE,
    snapshotKey: "instagram",
  },
  [REDDIT_ADS_METRICS_RULE_KEY]: {
    key: REDDIT_ADS_METRICS_RULE_KEY,
    provider: IntegrationProvider.REDDIT,
    snapshotKey: "redditAds",
  },
  [STRIPE_REVENUE_SYNC_RULE_KEY]: {
    key: STRIPE_REVENUE_SYNC_RULE_KEY,
    provider: IntegrationProvider.STRIPE,
    snapshotKey: "stripe",
  },
  [MERCURY_CASHFLOW_SYNC_RULE_KEY]: {
    key: MERCURY_CASHFLOW_SYNC_RULE_KEY,
    provider: IntegrationProvider.MERCURY,
    snapshotKey: "mercury",
  },
  [PYLON_CONVERSATION_SYNC_RULE_KEY]: {
    key: PYLON_CONVERSATION_SYNC_RULE_KEY,
    provider: IntegrationProvider.PYLON,
    snapshotKey: "pylon",
  },
};

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface ProviderMetricsSyncConfig {
  rangePreset: "7d" | "30d" | "90d";
  contextKey: string;
  googleAdsCustomerId?: string;
  googleAdsLoginCustomerId?: string;
  metaAdAccountId?: string;
  metaPageId?: string;
  metaInstagramAccountId?: string;
  redditAdAccountId?: string;
}

interface ProviderMetricsCheckpoint {
  lastRunAt?: string;
  rangePreset?: "7d" | "30d" | "90d";
  from?: string;
  to?: string;
  snapshotKey?: string;
}

export interface ProviderMetricsRuleState {
  id: string;
  key: string;
  provider: IntegrationProvider;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: ProviderMetricsSyncConfig;
  checkpoint: ProviderMetricsCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface ProviderMetricsRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<ProviderMetricsSyncConfig>;
}

export interface ProviderMetricsRunResult {
  ruleId: string;
  ruleKey: ProviderMetricsRuleKey;
  provider: IntegrationProvider;
  snapshotKey: string;
  dryRun: boolean;
  rangePreset: "7d" | "30d" | "90d";
  from: string;
  to: string;
  capturedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): ProviderMetricsSyncConfig {
  const input = asRecord(raw);
  const rangeRaw = typeof input.rangePreset === "string" ? input.rangePreset : "30d";
  const rangePreset: "7d" | "30d" | "90d" =
    rangeRaw === "7d" || rangeRaw === "90d" ? rangeRaw : "30d";

  const contextKeyRaw = typeof input.contextKey === "string" ? input.contextKey.trim() : "";
  const contextKey = contextKeyRaw.length > 0 ? contextKeyRaw : "default";

  const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    rangePreset,
    contextKey,
    googleAdsCustomerId: normalizeOptionalString(input.googleAdsCustomerId),
    googleAdsLoginCustomerId: normalizeOptionalString(input.googleAdsLoginCustomerId),
    metaAdAccountId: normalizeOptionalString(input.metaAdAccountId),
    metaPageId: normalizeOptionalString(input.metaPageId),
    metaInstagramAccountId: normalizeOptionalString(input.metaInstagramAccountId),
    redditAdAccountId: normalizeOptionalString(input.redditAdAccountId),
  };
}

function normalizeCheckpoint(raw: unknown): ProviderMetricsCheckpoint {
  const input = asRecord(raw);
  const checkpoint: ProviderMetricsCheckpoint = {};

  if (typeof input.lastRunAt === "string" && input.lastRunAt.trim()) {
    checkpoint.lastRunAt = input.lastRunAt;
  }
  if (input.rangePreset === "7d" || input.rangePreset === "30d" || input.rangePreset === "90d") {
    checkpoint.rangePreset = input.rangePreset;
  }
  if (typeof input.from === "string" && input.from.trim()) {
    checkpoint.from = input.from;
  }
  if (typeof input.to === "string" && input.to.trim()) {
    checkpoint.to = input.to;
  }
  if (typeof input.snapshotKey === "string" && input.snapshotKey.trim()) {
    checkpoint.snapshotKey = input.snapshotKey;
  }

  return checkpoint;
}

function toSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus {
  if (value === "ACTIVE" || value === "NOT_DONE") {
    return value;
  }
  return "QUEUED";
}

function toOptionalSupportedStatus(
  value: TaskStatus | null | undefined
): SupportedAutoTaskStatus | null {
  if (!value) return null;
  return toSupportedStatus(value);
}

function definitionForKey(ruleKey: ProviderMetricsRuleKey): ProviderMetricsDefinition {
  return PROVIDER_METRICS_DEFINITIONS[ruleKey];
}

function defaultProviderMetricsConfig(ruleKey: ProviderMetricsRuleKey): ProviderMetricsSyncConfig {
  const definition = definitionForKey(ruleKey);
  return {
    rangePreset: "30d",
    contextKey: "default",
    ...(definition.provider === IntegrationProvider.GOOGLE_ADS
      ? {
          googleAdsCustomerId: process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() || undefined,
          googleAdsLoginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim() || undefined,
        }
      : {}),
    ...(ruleKey === META_ADS_METRICS_RULE_KEY
      ? { metaAdAccountId: process.env.META_AD_ACCOUNT_ID?.trim() || undefined }
      : {}),
    ...(ruleKey === META_PAGE_METRICS_RULE_KEY
      ? { metaPageId: process.env.META_PAGE_ID?.trim() || undefined }
      : {}),
    ...(ruleKey === META_INSTAGRAM_METRICS_RULE_KEY
      ? {
          metaInstagramAccountId:
            process.env.META_INSTAGRAM_ACCOUNT_ID?.trim() || undefined,
        }
      : {}),
    ...(ruleKey === REDDIT_ADS_METRICS_RULE_KEY
      ? { redditAdAccountId: process.env.REDDIT_AD_ACCOUNT_ID?.trim() || undefined }
      : {}),
  };
}

export async function getOrCreateProviderMetricsRule(input: {
  userId: string;
  ruleKey: ProviderMetricsRuleKey;
}): Promise<IntegrationRule> {
  const definition = definitionForKey(input.ruleKey);

  const existing = await prisma.integrationRule.findUnique({
    where: {
      userId_provider_key: {
        userId: input.userId,
        provider: definition.provider,
        key: input.ruleKey,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.integrationRule.create({
    data: {
      userId: input.userId,
      provider: definition.provider,
      key: input.ruleKey,
      enabled: false,
      config: defaultProviderMetricsConfig(input.ruleKey) as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
      statusOverride: null,
    },
  });
}

export function serializeProviderMetricsRuleState(rule: IntegrationRule): ProviderMetricsRuleState {
  return {
    id: rule.id,
    key: rule.key,
    provider: rule.provider,
    enabled: rule.enabled,
    statusOverride: toOptionalSupportedStatus(rule.statusOverride),
    config: normalizeConfig(rule.config),
    checkpoint: normalizeCheckpoint(rule.checkpoint),
    lastObservedAt: rule.lastObservedAt?.toISOString() ?? null,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastError: rule.lastError,
  };
}

export async function patchProviderMetricsRule(input: {
  userId: string;
  ruleKey: ProviderMetricsRuleKey;
  patch: ProviderMetricsRulePatch;
}): Promise<ProviderMetricsRuleState> {
  const existing = await getOrCreateProviderMetricsRule({
    userId: input.userId,
    ruleKey: input.ruleKey,
  });

  const currentConfig = normalizeConfig(existing.config);
  const mergedConfig = normalizeConfig({
    ...currentConfig,
    ...(input.patch.config ?? {}),
  });

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: input.patch.enabled ?? existing.enabled,
      statusOverride:
        input.patch.statusOverride === undefined
          ? existing.statusOverride
          : input.patch.statusOverride,
      config: mergedConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeProviderMetricsRuleState(updated);
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("token") ||
    message.includes("credential") ||
    message.includes("auth")
  );
}

async function fetchProviderPayload(input: {
  ruleKey: ProviderMetricsRuleKey;
  userId: string;
  config: ProviderMetricsSyncConfig;
  fromDate: Date;
  toDate: Date;
}): Promise<unknown> {
  const creds = await getCredentials(input.userId);

  if (input.ruleKey === GOOGLE_ADS_METRICS_RULE_KEY) {
    const customerId = input.config.googleAdsCustomerId ?? creds.googleAdsCustomerId;
    const loginCustomerId =
      input.config.googleAdsLoginCustomerId ?? creds.googleAdsLoginCustomerId;

    if (
      !creds.googleAdsDevToken ||
      !customerId ||
      !creds.googleAdsRefreshToken ||
      !creds.googleAdsClientId ||
      !creds.googleAdsClientSecret
    ) {
      throw new Error("Missing Google Ads credential");
    }

    return fetchGoogleAdsData(
      creds.googleAdsDevToken,
      customerId,
      creds.googleAdsRefreshToken,
      creds.googleAdsClientId,
      creds.googleAdsClientSecret,
      loginCustomerId,
      { fromDate: input.fromDate, toDate: input.toDate }
    );
  }

  if (input.ruleKey === META_ADS_METRICS_RULE_KEY) {
    const adAccountId = input.config.metaAdAccountId ?? creds.metaAdAccountId;
    if (!creds.metaAccessToken || !adAccountId) {
      throw new Error("Missing Meta Ads credential");
    }
    return fetchMetaAdsData(creds.metaAccessToken, adAccountId, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === META_PAGE_METRICS_RULE_KEY) {
    const pageId = input.config.metaPageId ?? creds.metaPageId;
    if (!creds.metaAccessToken || !pageId) {
      throw new Error("Missing Meta Page credential");
    }
    return fetchMetaPageData(creds.metaAccessToken, pageId, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === META_INSTAGRAM_METRICS_RULE_KEY) {
    const instagramAccountId =
      input.config.metaInstagramAccountId ?? creds.metaInstagramAccountId;
    if (!creds.metaAccessToken || !instagramAccountId) {
      throw new Error("Missing Meta Instagram credential");
    }
    return fetchMetaInstagramData(creds.metaAccessToken, instagramAccountId, {
      pageId: input.config.metaPageId ?? creds.metaPageId ?? undefined,
    });
  }

  if (input.ruleKey === REDDIT_ADS_METRICS_RULE_KEY) {
    const adAccountId = input.config.redditAdAccountId ?? creds.redditAdAccountId;
    if (
      !creds.redditClientId ||
      !creds.redditClientSecret ||
      !creds.redditRefreshToken ||
      !adAccountId
    ) {
      throw new Error("Missing Reddit Ads credential");
    }
    return fetchRedditAdsData(
      creds.redditClientId,
      creds.redditClientSecret,
      creds.redditRefreshToken,
      adAccountId,
      creds.redditUserAgent,
      { fromDate: input.fromDate, toDate: input.toDate }
    );
  }

  if (input.ruleKey === STRIPE_REVENUE_SYNC_RULE_KEY) {
    if (!creds.stripeKey) {
      throw new Error("Missing Stripe credential");
    }
    return fetchStripeData(creds.stripeKey, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === MERCURY_CASHFLOW_SYNC_RULE_KEY) {
    if (!creds.mercuryKey) {
      throw new Error("Missing Mercury credential");
    }
    return fetchMercuryData(creds.mercuryKey, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === PYLON_CONVERSATION_SYNC_RULE_KEY) {
    if (!creds.pylonApiKey) {
      throw new Error("Missing Pylon credential");
    }

    const params = new URLSearchParams();
    params.set("range", input.config.rangePreset);
    const range = parseAnalyticsTimeRange(params);

    return fetchPylonData({
      apiKey: creds.pylonApiKey,
      from: range.from,
      to: range.to,
    });
  }

  throw new Error(`Unsupported provider metrics rule: ${input.ruleKey}`);
}

export async function runProviderMetricsRule(input: {
  userId: string;
  ruleKey: ProviderMetricsRuleKey;
  dryRun?: boolean;
}): Promise<ProviderMetricsRunResult> {
  const definition = definitionForKey(input.ruleKey);
  const rule = await getOrCreateProviderMetricsRule({
    userId: input.userId,
    ruleKey: input.ruleKey,
  });

  const config = normalizeConfig(rule.config);
  const now = new Date();

  if (!rule.enabled) {
    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: now,
        lastError: null,
      },
    });

    const params = new URLSearchParams();
    params.set("range", config.rangePreset);
    const range = parseAnalyticsTimeRange(params);

    return {
      ruleId: rule.id,
      ruleKey: input.ruleKey,
      provider: definition.provider,
      snapshotKey: definition.snapshotKey,
      dryRun: Boolean(input.dryRun),
      rangePreset: config.rangePreset,
      from: range.from,
      to: range.to,
      capturedAt: now.toISOString(),
    };
  }

  const params = new URLSearchParams();
  params.set("range", config.rangePreset);
  const range = parseAnalyticsTimeRange(params);

  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  try {
    const payload = await fetchProviderPayload({
      ruleKey: input.ruleKey,
      userId: input.userId,
      config,
      fromDate,
      toDate,
    });

    if (!input.dryRun) {
      await storeAnalyticsSnapshot({
        userId: input.userId,
        providerKey: definition.snapshotKey,
        contextKey: config.contextKey,
        rangePreset: range.preset,
        fromDate,
        toDate,
        payload,
        expiresAt: snapshotExpiryFromNow(1),
      });
    }

    const runAt = new Date();
    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastObservedAt: toDate,
        lastRunAt: runAt,
        lastError: null,
        checkpoint: {
          ...normalizeCheckpoint(rule.checkpoint),
          lastRunAt: runAt.toISOString(),
          rangePreset: config.rangePreset,
          from: range.from,
          to: range.to,
          snapshotKey: definition.snapshotKey,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.integrationConnection.updateMany({
      where: {
        userId: input.userId,
        provider: definition.provider,
      },
      data: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastSyncedAt: runAt,
        lastError: null,
      },
    });

    return {
      ruleId: rule.id,
      ruleKey: input.ruleKey,
      provider: definition.provider,
      snapshotKey: definition.snapshotKey,
      dryRun: Boolean(input.dryRun),
      rangePreset: config.rangePreset,
      from: range.from,
      to: range.to,
      capturedAt: runAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider metrics sync failed";

    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        lastError: message,
      },
    });

    if (isAuthError(error)) {
      await prisma.integrationConnection.updateMany({
        where: {
          userId: input.userId,
          provider: definition.provider,
        },
        data: {
          status: IntegrationConnectionStatus.ERROR,
          lastError: message,
        },
      });
    }

    throw error;
  }
}
