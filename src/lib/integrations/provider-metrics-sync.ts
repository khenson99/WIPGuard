import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationRule,
} from "@/generated/prisma/client";
import { getCredentials, hasIntegrationCredential } from "@/lib/analytics/credentials";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaInstagramData,
  fetchMetaPageData,
  fetchRedditAdsData,
} from "@/lib/analytics/fetchers-ads";
import { fetchHubSpotData, fetchMercuryData, fetchStripeData } from "@/lib/analytics/fetchers";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchGoogleWorkspaceData } from "@/lib/analytics/fetchers-google-workspace";
import { fetchSlackData } from "@/lib/analytics/fetchers-slack";
import {
  fetchGitHubData,
  fetchLinearData,
  fetchPostHogData,
} from "@/lib/analytics/fetchers-development";
import { fetchGoogleSearchConsoleData } from "@/lib/analytics/fetchers-google-search-console";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import {
  snapshotExpiryFromNow,
  storeAnalyticsSnapshot,
  storeAnalyticsSnapshotFailure,
} from "@/lib/analytics/snapshots";
import {
  getImladrisHistoricalWindow,
  ingestImladrisRawRecords,
} from "@/lib/imladris/ingestion";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";
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
export const CODA_DOC_SYNC_RULE_KEY = "coda_doc_sync";
export const POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY = "posthog_product_events_sync";
export const LINEAR_ISSUES_SYNC_RULE_KEY = "linear_issues_sync";
export const GITHUB_PULL_REQUESTS_SYNC_RULE_KEY = "github_pull_requests_sync";
export const SEMRUSH_DOMAIN_SYNC_RULE_KEY = "semrush_domain_sync";
export const GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY = "google_analytics_traffic_sync";
export const GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY = "google_search_console_sync";
export const WEBFLOW_SITE_SYNC_RULE_KEY = "webflow_site_sync";
export const GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY = "google_workspace_activity_sync";
export const HUBSPOT_PIPELINE_SYNC_RULE_KEY = "hubspot_pipeline_sync";
export const SLACK_ACTIVITY_SYNC_RULE_KEY = "slack_activity_sync";

export type ProviderMetricsRuleKey =
  | typeof GOOGLE_ADS_METRICS_RULE_KEY
  | typeof META_ADS_METRICS_RULE_KEY
  | typeof META_PAGE_METRICS_RULE_KEY
  | typeof META_INSTAGRAM_METRICS_RULE_KEY
  | typeof REDDIT_ADS_METRICS_RULE_KEY
  | typeof STRIPE_REVENUE_SYNC_RULE_KEY
  | typeof MERCURY_CASHFLOW_SYNC_RULE_KEY
  | typeof PYLON_CONVERSATION_SYNC_RULE_KEY
  | typeof CODA_DOC_SYNC_RULE_KEY
  | typeof POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY
  | typeof LINEAR_ISSUES_SYNC_RULE_KEY
  | typeof GITHUB_PULL_REQUESTS_SYNC_RULE_KEY
  | typeof SEMRUSH_DOMAIN_SYNC_RULE_KEY
  | typeof GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY
  | typeof GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY
  | typeof WEBFLOW_SITE_SYNC_RULE_KEY
  | typeof GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY
  | typeof HUBSPOT_PIPELINE_SYNC_RULE_KEY
  | typeof SLACK_ACTIVITY_SYNC_RULE_KEY;

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
  [CODA_DOC_SYNC_RULE_KEY]: {
    key: CODA_DOC_SYNC_RULE_KEY,
    provider: IntegrationProvider.CODA,
    snapshotKey: "coda",
  },
  [POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY]: {
    key: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
    provider: IntegrationProvider.POSTHOG,
    snapshotKey: "posthog",
  },
  [LINEAR_ISSUES_SYNC_RULE_KEY]: {
    key: LINEAR_ISSUES_SYNC_RULE_KEY,
    provider: IntegrationProvider.LINEAR,
    snapshotKey: "linear",
  },
  [GITHUB_PULL_REQUESTS_SYNC_RULE_KEY]: {
    key: GITHUB_PULL_REQUESTS_SYNC_RULE_KEY,
    provider: IntegrationProvider.GITHUB,
    snapshotKey: "github",
  },
  [SEMRUSH_DOMAIN_SYNC_RULE_KEY]: {
    key: SEMRUSH_DOMAIN_SYNC_RULE_KEY,
    provider: IntegrationProvider.SEMRUSH,
    snapshotKey: "semrush",
  },
  [GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY]: {
    key: GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
    provider: IntegrationProvider.GOOGLE_ANALYTICS,
    snapshotKey: "googleAnalytics",
  },
  [GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY]: {
    key: GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
    provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
    snapshotKey: "googleSearchConsole",
  },
  [WEBFLOW_SITE_SYNC_RULE_KEY]: {
    key: WEBFLOW_SITE_SYNC_RULE_KEY,
    provider: IntegrationProvider.WEBFLOW,
    snapshotKey: "webflow",
  },
  [GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY]: {
    key: GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
    provider: IntegrationProvider.GOOGLE_WORKSPACE,
    snapshotKey: "googleWorkspace",
  },
  [HUBSPOT_PIPELINE_SYNC_RULE_KEY]: {
    key: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
    provider: IntegrationProvider.HUBSPOT,
    snapshotKey: "hubspot",
  },
  [SLACK_ACTIVITY_SYNC_RULE_KEY]: {
    key: SLACK_ACTIVITY_SYNC_RULE_KEY,
    provider: IntegrationProvider.SLACK,
    snapshotKey: "slack",
  },
};

const PROVIDER_METRICS_RULE_KEYS_BY_PROVIDER = new Map<IntegrationProvider, ProviderMetricsRuleKey[]>(
  Object.values(PROVIDER_METRICS_DEFINITIONS).reduce<Array<[IntegrationProvider, ProviderMetricsRuleKey[]]>>(
    (entries, definition) => {
      const existing = entries.find(([provider]) => provider === definition.provider);
      if (existing) {
        existing[1].push(definition.key);
      } else {
        entries.push([definition.provider, [definition.key]]);
      }
      return entries;
    },
    [],
  ),
);

export interface ProviderMetricsSyncConfig {
  rangePreset: "7d" | "30d" | "90d";
  contextKey: string;
  googleAdsCustomerId?: string;
  googleAdsLoginCustomerId?: string;
  metaAdAccountId?: string;
  metaPageId?: string;
  metaInstagramAccountId?: string;
  redditAdAccountId?: string;
  codaDocId?: string;
  posthogProjectId?: string;
  posthogHost?: string;
  githubOwner?: string;
  githubRepo?: string;
  semrushDomain?: string;
  gaPropertyId?: string;
  searchConsoleSiteUrl?: string;
  webflowSiteId?: string;
  googleWorkspaceCalendarIds?: string[];
  slackChannelIds?: string[];
}

interface ProviderMetricsCheckpoint {
  lastRunAt?: string;
  rangePreset?: "7d" | "30d" | "90d";
  from?: string;
  to?: string;
  snapshotKey?: string;
  syncMode?: IntegrationRunMode;
}

export type IntegrationRunMode = "incremental" | "backfill";

export interface ProviderMetricsRuleState {
  id: string;
  key: string;
  provider: IntegrationProvider;
  enabled: boolean;
  config: ProviderMetricsSyncConfig;
  checkpoint: ProviderMetricsCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface ProviderMetricsRulePatch {
  enabled?: boolean;
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
  rawRecordCount: number;
  acceptedRawRecordCount: number;
  statusPersistenceErrors: string[];
}

export interface ProviderMetricsSyncResponsePayload {
  ok: boolean;
  action: "sync";
  degraded: boolean;
  warnings: string[];
  result: ProviderMetricsRunResult;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function providerPayloadIsTruncated(payload: unknown): boolean {
  const meta = asRecord(asRecord(payload)._meta);
  return meta.truncated === true;
}

function assertProviderPayloadComplete(input: {
  ruleKey: ProviderMetricsRuleKey;
  payload: unknown;
}): void {
  if (!providerPayloadIsTruncated(input.payload)) return;
  throw new Error(
    `Provider payload for ${input.ruleKey} is truncated; refusing to persist partial provider data`,
  );
}

export function buildProviderMetricsSyncResponsePayload(
  result: ProviderMetricsRunResult,
): ProviderMetricsSyncResponsePayload {
  const warnings = Array.isArray(result.statusPersistenceErrors)
    ? result.statusPersistenceErrors.filter((warning) => warning.trim().length > 0)
    : [];
  if (result.rawRecordCount > result.acceptedRawRecordCount) {
    warnings.push(rawIngestionMessage({
      ruleKey: result.ruleKey,
      acceptedCount: result.acceptedRawRecordCount,
      recordCount: result.rawRecordCount,
      status: result.acceptedRawRecordCount > 0 ? "PARTIAL" : "ERROR",
    }));
  }
  const degraded = warnings.length > 0;

  return {
    ok: !degraded,
    action: "sync",
    degraded,
    warnings,
    result,
  };
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
  const normalizeOptionalStringArray = (value: unknown): string[] | undefined => {
    if (typeof value === "string") {
      const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
      return parsed.length > 0 ? parsed : undefined;
    }
    if (!Array.isArray(value)) return undefined;
    const parsed = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
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
    codaDocId: normalizeOptionalString(input.codaDocId),
    posthogProjectId: normalizeOptionalString(input.posthogProjectId),
    posthogHost: normalizeOptionalString(input.posthogHost),
    githubOwner: normalizeOptionalString(input.githubOwner),
    githubRepo: normalizeOptionalString(input.githubRepo),
    semrushDomain: normalizeOptionalString(input.semrushDomain),
    gaPropertyId: normalizeOptionalString(input.gaPropertyId),
    searchConsoleSiteUrl: normalizeOptionalString(input.searchConsoleSiteUrl),
    webflowSiteId: normalizeOptionalString(input.webflowSiteId),
    googleWorkspaceCalendarIds: normalizeOptionalStringArray(input.googleWorkspaceCalendarIds),
    slackChannelIds: normalizeOptionalStringArray(input.slackChannelIds),
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
  if (input.syncMode === "incremental" || input.syncMode === "backfill") {
    checkpoint.syncMode = input.syncMode;
  }

  return checkpoint;
}

function definitionForKey(ruleKey: ProviderMetricsRuleKey): ProviderMetricsDefinition {
  return PROVIDER_METRICS_DEFINITIONS[ruleKey];
}

function hasProviderMetricsRuleCredential(
  ruleKey: ProviderMetricsRuleKey,
  credentials: Awaited<ReturnType<typeof getCredentials>>,
): boolean {
  if (ruleKey === META_PAGE_METRICS_RULE_KEY) {
    return Boolean(credentials.metaPageAccessToken && credentials.metaPageId);
  }

  if (ruleKey === META_INSTAGRAM_METRICS_RULE_KEY) {
    return Boolean(credentials.metaPageAccessToken && credentials.metaInstagramAccountId);
  }

  return hasIntegrationCredential(definitionForKey(ruleKey).provider, credentials);
}

export function providerMetricsRuleKeysForProvider(
  provider: IntegrationProvider,
): ProviderMetricsRuleKey[] {
  return PROVIDER_METRICS_RULE_KEYS_BY_PROVIDER.get(provider) ?? [];
}

function isUniqueRuleConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "P2002") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("unique constraint failed");
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
    ...(ruleKey === CODA_DOC_SYNC_RULE_KEY
      ? { codaDocId: process.env.CODA_DOC_ID?.trim() || undefined }
      : {}),
    ...(ruleKey === POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY
      ? {
          posthogProjectId: process.env.POSTHOG_PROJECT_ID?.trim() || undefined,
          posthogHost:
            process.env.POSTHOG_HOST?.trim() ||
            process.env.POSTHOG_API_HOST?.trim() ||
            undefined,
        }
      : {}),
    ...(ruleKey === GITHUB_PULL_REQUESTS_SYNC_RULE_KEY
      ? {
          githubOwner:
            process.env.GITHUB_REPO_OWNER?.trim() ||
            process.env.GITHUB_OWNER?.trim() ||
            undefined,
          githubRepo:
            process.env.GITHUB_REPO_NAME?.trim() ||
            process.env.GITHUB_REPO?.trim() ||
            undefined,
        }
      : {}),
    ...(ruleKey === SEMRUSH_DOMAIN_SYNC_RULE_KEY
      ? { semrushDomain: process.env.SEMRUSH_DOMAIN?.trim() || undefined }
      : {}),
    ...(ruleKey === GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY
      ? { gaPropertyId: process.env.GA_PROPERTY_ID?.trim() || undefined }
      : {}),
    ...(ruleKey === GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY
      ? {
          searchConsoleSiteUrl:
            process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() ||
            process.env.GSC_SITE_URL?.trim() ||
            undefined,
        }
      : {}),
    ...(ruleKey === WEBFLOW_SITE_SYNC_RULE_KEY
      ? { webflowSiteId: process.env.WEBFLOW_SITE_ID?.trim() || undefined }
      : {}),
    ...(ruleKey === GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY
      ? {
          googleWorkspaceCalendarIds:
            process.env.GOOGLE_WORKSPACE_CALENDAR_IDS?.split(",").map((item) => item.trim()).filter(Boolean) ??
            undefined,
        }
      : {}),
    ...(ruleKey === SLACK_ACTIVITY_SYNC_RULE_KEY
      ? {
          slackChannelIds:
            process.env.SLACK_SYNC_CHANNEL_IDS?.split(",").map((item) => item.trim()).filter(Boolean) ??
            undefined,
        }
      : {}),
  };
}

async function createProviderMetricsRuleIfMissing(input: {
  userId: string;
  provider: IntegrationProvider;
  ruleKey: ProviderMetricsRuleKey;
  enabled: boolean;
}): Promise<{ created: boolean; rule: IntegrationRule | null }> {
  try {
    const rule = await prisma.integrationRule.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        key: input.ruleKey,
        enabled: input.enabled,
        config: defaultProviderMetricsConfig(input.ruleKey) as unknown as Prisma.InputJsonValue,
        checkpoint: {} as unknown as Prisma.InputJsonValue,
      },
    });
    return { created: true, rule };
  } catch (error) {
    if (isUniqueRuleConstraintError(error)) {
      return { created: false, rule: null };
    }
    throw error;
  }
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

  const created = await createProviderMetricsRuleIfMissing({
    userId: input.userId,
    provider: definition.provider,
    ruleKey: input.ruleKey,
    enabled: false,
  });
  if (created.rule) {
    return created.rule;
  }

  const raced = await prisma.integrationRule.findUnique({
    where: {
      userId_provider_key: {
        userId: input.userId,
        provider: definition.provider,
        key: input.ruleKey,
      },
    },
  });
  if (!raced) {
    throw new Error(`Provider metrics rule ${input.ruleKey} already exists but could not be loaded`);
  }
  return raced;
}

export async function ensureProviderMetricsRulesForConnectedProviders(input: {
  userId: string;
  providers?: IntegrationProvider[];
}): Promise<{ created: number; examined: number }> {
  const providerFilter =
    input.providers && input.providers.length > 0
      ? new Set(input.providers)
      : null;
  const connectedProviders = await prisma.integrationConnection.findMany({
    distinct: ["provider"],
    where: {
      userId: input.userId,
      status: {
        in: [
          IntegrationConnectionStatus.CONNECTED,
          IntegrationConnectionStatus.ERROR,
        ],
      },
      ...(providerFilter
        ? { provider: { in: Array.from(providerFilter) } }
        : {}),
    },
    select: { provider: true },
  });
  const credentials = await getCredentials(input.userId);
  const providers = new Set<IntegrationProvider>();

  for (const connection of connectedProviders) {
    if (hasIntegrationCredential(connection.provider, credentials)) {
      providers.add(connection.provider);
    }
  }

  for (const definition of Object.values(PROVIDER_METRICS_DEFINITIONS)) {
    if (providerFilter && !providerFilter.has(definition.provider)) {
      continue;
    }
    if (providers.has(definition.provider)) {
      continue;
    }
    if (hasIntegrationCredential(definition.provider, credentials)) {
      providers.add(definition.provider);
    }
  }

  let created = 0;
  let examined = 0;

  for (const provider of providers) {
    for (const ruleKey of providerMetricsRuleKeysForProvider(provider)) {
      const definition = definitionForKey(ruleKey);
      if (!hasProviderMetricsRuleCredential(ruleKey, credentials)) {
        continue;
      }
      examined += 1;
      const existing = await prisma.integrationRule.findUnique({
        where: {
          userId_provider_key: {
            userId: input.userId,
            provider: definition.provider,
            key: ruleKey,
          },
        },
      });
      if (existing) {
        continue;
      }

      const createdRule = await createProviderMetricsRuleIfMissing({
        userId: input.userId,
        provider: definition.provider,
        ruleKey,
        enabled: true,
      });
      if (createdRule.created) {
        created += 1;
      }
    }
  }

  return { created, examined };
}

export function serializeProviderMetricsRuleState(rule: IntegrationRule): ProviderMetricsRuleState {
  return {
    id: rule.id,
    key: rule.key,
    provider: rule.provider,
    enabled: rule.enabled,
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

function numericErrorField(error: unknown, field: string): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRetryableProviderError(error: unknown): boolean {
  if (isAuthError(error)) return false;

  const status =
    numericErrorField(error, "status") ??
    numericErrorField(error, "statusCode") ??
    numericErrorField(error, "code");
  if (status === 429 || (status !== null && status >= 500 && status < 600)) {
    return true;
  }

  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("rate limit") ||
    message.includes("temporarily") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

function providerFetchRetryBaseMs(): number {
  const raw =
    process.env.PROVIDER_SYNC_RETRY_BASE_MS ??
    (process.env.NODE_ENV === "test" ? "0" : "250");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
}

async function waitForProviderRetry(attempt: number): Promise<void> {
  const delayMs = providerFetchRetryBaseMs() * 2 ** (attempt - 1);
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function providerSyncTimeoutMs(): number {
  const raw = process.env.PROVIDER_SYNC_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return 30_000;
}

function withProviderSyncTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Provider metrics sync timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
}

async function resolveUserOrganizationId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  return user?.organizationId ?? null;
}

function rawIngestionMessage(input: {
  ruleKey: ProviderMetricsRuleKey;
  acceptedCount: number;
  recordCount: number;
  status: string;
}): string {
  const prefix =
    input.status === "ERROR"
      ? "Imladris raw ingestion failed"
      : "Imladris raw ingestion partially succeeded";
  return `${prefix} for ${input.ruleKey}: ${input.acceptedCount}/${input.recordCount} records accepted.`;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function parseCheckpointCoveredThrough(checkpoint: ProviderMetricsCheckpoint): Date | null {
  if (typeof checkpoint.to !== "string" || !checkpoint.to.trim()) {
    return null;
  }

  const raw = checkpoint.to.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return startOfUtcDay(parsed);
}

function hasProviderCoverageCheckpoint(checkpoint: ProviderMetricsCheckpoint): boolean {
  return parseCheckpointCoveredThrough(checkpoint) !== null;
}

function providerSyncRange(input: {
  mode: IntegrationRunMode;
  rangePreset: "7d" | "30d" | "90d";
  now: Date;
  checkpoint?: ProviderMetricsCheckpoint;
}): {
  preset: "7d" | "30d" | "90d";
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
} {
  if (input.mode === "backfill") {
    const historicalWindow = getImladrisHistoricalWindow(input.now);
    const fromDate = startOfUtcDay(historicalWindow.windowStart);
    const toDate = endOfUtcDay(historicalWindow.windowEnd);
    return {
      preset: input.rangePreset,
      from: toDateKey(fromDate),
      to: toDateKey(toDate),
      fromDate,
      toDate,
    };
  }

  const params = new URLSearchParams();
  params.set("range", input.rangePreset);
  const range = parseAnalyticsTimeRange(params, input.now);
  const historicalWindow = getImladrisHistoricalWindow(input.now);
  const historicalStart = startOfUtcDay(historicalWindow.windowStart);
  const rollingFromDate = new Date(`${range.from}T00:00:00.000Z`);
  const coveredThrough = input.checkpoint
    ? parseCheckpointCoveredThrough(input.checkpoint)
    : null;
  const catchUpFromDate =
    coveredThrough && coveredThrough < rollingFromDate ? coveredThrough : rollingFromDate;
  const fromDate = catchUpFromDate < historicalStart ? historicalStart : catchUpFromDate;
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  return {
    preset: range.preset as "7d" | "30d" | "90d",
    from: toDateKey(fromDate),
    to: range.to,
    fromDate,
    toDate,
  };
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
    if (!creds.metaAdsAccessToken || !adAccountId) {
      throw new Error("Missing Meta Ads credential");
    }
    return fetchMetaAdsData(creds.metaAdsAccessToken, adAccountId, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === META_PAGE_METRICS_RULE_KEY) {
    const pageId = input.config.metaPageId ?? creds.metaPageId;
    if (!creds.metaPageAccessToken || !pageId) {
      throw new Error("Missing Meta Page credential");
    }
    return fetchMetaPageData(creds.metaPageAccessToken, pageId, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === META_INSTAGRAM_METRICS_RULE_KEY) {
    const instagramAccountId =
      input.config.metaInstagramAccountId ?? creds.metaInstagramAccountId;
    if (!creds.metaPageAccessToken || !instagramAccountId) {
      throw new Error("Missing Meta Instagram credential");
    }
    return fetchMetaInstagramData(creds.metaPageAccessToken, instagramAccountId, {
      pageId: input.config.metaPageId ?? creds.metaPageId ?? undefined,
    }, input.fromDate, input.toDate);
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

  if (input.ruleKey === HUBSPOT_PIPELINE_SYNC_RULE_KEY) {
    if (!creds.hubspotToken) {
      throw new Error("Missing HubSpot credential");
    }
    return fetchHubSpotData(creds.hubspotToken, { fromDate: input.fromDate, toDate: input.toDate });
  }

  if (input.ruleKey === SLACK_ACTIVITY_SYNC_RULE_KEY) {
    if (!creds.slackAccessToken) {
      throw new Error("Missing Slack credential");
    }
    return fetchSlackData({
      accessToken: creds.slackAccessToken,
      fromDate: input.fromDate,
      toDate: input.toDate,
      channelIds: input.config.slackChannelIds,
    });
  }

  if (input.ruleKey === GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY) {
    if (!creds.googleWorkspaceAccessToken) {
      throw new Error("Missing Google Workspace credential");
    }
    return fetchGoogleWorkspaceData({
      accessToken: creds.googleWorkspaceAccessToken,
      fromDate: input.fromDate,
      toDate: input.toDate,
      calendarIds: input.config.googleWorkspaceCalendarIds,
    });
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

    return fetchPylonData({
      apiKey: creds.pylonApiKey,
      from: toDateKey(input.fromDate),
      to: toDateKey(input.toDate),
      baseUrl: creds.pylonBaseUrl ?? undefined,
    });
  }

  if (input.ruleKey === CODA_DOC_SYNC_RULE_KEY) {
    const docId = input.config.codaDocId ?? creds.codaDocId;
    if (!creds.codaApiToken || !docId) {
      throw new Error("Missing Coda credential");
    }

    return fetchCodaData(creds.codaApiToken, docId, {
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  if (input.ruleKey === POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY) {
    const projectId = input.config.posthogProjectId ?? creds.posthogProjectId;
    const host = input.config.posthogHost ?? creds.posthogHost;
    if (!creds.posthogApiKey || !projectId) {
      throw new Error("Missing PostHog credential");
    }

    return fetchPostHogData({
      apiKey: creds.posthogApiKey,
      projectId,
      host,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  if (input.ruleKey === LINEAR_ISSUES_SYNC_RULE_KEY) {
    if (!creds.linearApiKey) {
      throw new Error("Missing Linear credential");
    }

    return fetchLinearData({
      apiKey: creds.linearApiKey,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  if (input.ruleKey === GITHUB_PULL_REQUESTS_SYNC_RULE_KEY) {
    const owner = input.config.githubOwner ?? creds.githubOwner;
    const repo = input.config.githubRepo ?? creds.githubRepo;
    if (!creds.githubToken || !owner || !repo) {
      throw new Error("Missing GitHub credential");
    }

    return fetchGitHubData({
      token: creds.githubToken,
      owner,
      repo,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  if (input.ruleKey === SEMRUSH_DOMAIN_SYNC_RULE_KEY) {
    const domain = input.config.semrushDomain ?? creds.semrushDomain;
    if (!creds.semrushApiToken || !domain) {
      throw new Error("Missing SEMrush credential");
    }

    return fetchSemrushData(creds.semrushApiToken, domain);
  }

  if (input.ruleKey === GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY) {
    const propertyId = input.config.gaPropertyId ?? creds.gaPropertyId;
    const hasServiceAccount = Boolean(creds.gaClientEmail && creds.gaPrivateKey);
    const hasOAuth = Boolean(
      process.env.GA_REFRESH_TOKEN?.trim() &&
        process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim(),
    );
    if (!propertyId || (!hasServiceAccount && !hasOAuth)) {
      throw new Error("Missing Google Analytics credential");
    }

    return fetchGAData(
      propertyId,
      creds.gaClientEmail ?? "",
      creds.gaPrivateKey ?? "",
      { fromDate: input.fromDate, toDate: input.toDate },
    );
  }

  if (input.ruleKey === GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY) {
    const siteUrl = input.config.searchConsoleSiteUrl ?? creds.searchConsoleSiteUrl;
    if (
      !siteUrl ||
      (!creds.searchConsoleAccessToken &&
        !(creds.gaClientEmail && creds.gaPrivateKey) &&
        !(process.env.GA_REFRESH_TOKEN?.trim() &&
          process.env.GOOGLE_CLIENT_ID?.trim() &&
          process.env.GOOGLE_CLIENT_SECRET?.trim()))
    ) {
      throw new Error("Missing Google Search Console credential");
    }

    return fetchGoogleSearchConsoleData({
      accessToken: creds.searchConsoleAccessToken,
      siteUrl,
      clientEmail: creds.gaClientEmail,
      privateKey: creds.gaPrivateKey,
      refreshToken: process.env.GA_REFRESH_TOKEN?.trim() || null,
      googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || null,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  if (input.ruleKey === WEBFLOW_SITE_SYNC_RULE_KEY) {
    const siteId = input.config.webflowSiteId ?? creds.webflowSiteId;
    if (!creds.webflowApiToken || !siteId) {
      throw new Error("Missing Webflow credential");
    }

    return fetchWebflowData(
      creds.webflowApiToken,
      siteId,
      input.fromDate,
      input.toDate,
    );
  }

  throw new Error(`Unsupported provider metrics rule: ${input.ruleKey}`);
}

async function fetchProviderPayloadWithRetry(input: {
  ruleKey: ProviderMetricsRuleKey;
  userId: string;
  config: ProviderMetricsSyncConfig;
  fromDate: Date;
  toDate: Date;
}): Promise<unknown> {
  const maxAttempts = 3;
  const timeoutMs = providerSyncTimeoutMs();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withProviderSyncTimeout(fetchProviderPayload(input), timeoutMs);
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableProviderError(error)) {
        throw error;
      }
      await waitForProviderRetry(attempt);
    }
  }

  throw new Error("Provider metrics sync failed");
}

export async function runProviderMetricsRule(input: {
  userId: string;
  ruleKey: ProviderMetricsRuleKey;
  dryRun?: boolean;
  mode?: IntegrationRunMode;
}): Promise<ProviderMetricsRunResult> {
  const definition = definitionForKey(input.ruleKey);
  const rule = await getOrCreateProviderMetricsRule({
    userId: input.userId,
    ruleKey: input.ruleKey,
  });

  const config = normalizeConfig(rule.config);
  const now = new Date();
  const checkpoint = normalizeCheckpoint(rule.checkpoint);
  const requestedMode = input.mode ?? "incremental";
  const mode =
    requestedMode === "incremental" &&
    !hasProviderCoverageCheckpoint(checkpoint)
      ? "backfill"
      : requestedMode;
  const range = providerSyncRange({
    mode,
    rangePreset: config.rangePreset,
    now,
    checkpoint,
  });

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      ruleKey: input.ruleKey,
      provider: definition.provider,
      snapshotKey: definition.snapshotKey,
      dryRun: Boolean(input.dryRun),
      rangePreset: range.preset,
      from: range.from,
      to: range.to,
      capturedAt: now.toISOString(),
      rawRecordCount: 0,
      acceptedRawRecordCount: 0,
      statusPersistenceErrors: [],
    };
  }

  const { fromDate, toDate } = range;

  try {
    const payload = await fetchProviderPayloadWithRetry({
      ruleKey: input.ruleKey,
      userId: input.userId,
      config,
      fromDate,
      toDate,
    });
    assertProviderPayloadComplete({
      ruleKey: input.ruleKey,
      payload,
    });

    const runAt = new Date();
    const rawRecords = buildImladrisRawRecordsFromPayload({
      provider: definition.provider,
      snapshotKey: definition.snapshotKey,
      payload,
      from: range.from,
      to: range.to,
      capturedAt: runAt,
    });
    const rawIngestionResult = input.dryRun
      ? {
          status: "SUCCESS",
          recordCount: 0,
          acceptedCount: 0,
          statusPersistenceErrors: [],
        }
      : await ingestImladrisRawRecords({
          prisma,
          provider: definition.provider,
          context: {
            userId: input.userId,
            organizationId: await resolveUserOrganizationId(input.userId),
          },
          records: rawRecords,
          mode: mode === "backfill" ? "historical" : "incremental",
          windowStart: fromDate,
          windowEnd: toDate,
          checkpoint: {
            ruleId: rule.id,
            ruleKey: input.ruleKey,
            snapshotKey: definition.snapshotKey,
            rangePreset: config.rangePreset,
            syncMode: mode,
            from: range.from,
            to: range.to,
          },
          now: runAt,
        });
    const rawIngestionWarning =
      rawIngestionResult.status === "PARTIAL"
        ? rawIngestionMessage({
            ruleKey: input.ruleKey,
            acceptedCount: rawIngestionResult.acceptedCount,
            recordCount: rawIngestionResult.recordCount,
            status: rawIngestionResult.status,
          })
        : null;
    if (rawIngestionResult.status === "ERROR") {
      throw new Error(
        rawIngestionMessage({
          ruleKey: input.ruleKey,
          acceptedCount: rawIngestionResult.acceptedCount,
          recordCount: rawIngestionResult.recordCount,
          status: rawIngestionResult.status,
        }),
      );
    }

    const statusPersistenceErrors = Array.isArray(rawIngestionResult.statusPersistenceErrors)
      ? [...rawIngestionResult.statusPersistenceErrors]
      : [];
    if (!input.dryRun) {
      if (rawIngestionWarning) {
        await storeAnalyticsSnapshotFailure({
          userId: input.userId,
          providerKey: definition.snapshotKey,
          contextKey: config.contextKey,
          rangePreset: range.preset,
          fromDate,
          toDate,
          error: rawIngestionWarning,
          expiresAt: snapshotExpiryFromNow(1),
        }).catch((failureError) => {
          console.error("provider_metrics_sync.partial_failure_snapshot_failed", {
            provider: definition.provider,
            ruleKey: input.ruleKey,
            userId: input.userId,
            originalError: rawIngestionWarning,
            failureSnapshotError:
              failureError instanceof Error ? failureError.message : String(failureError),
          });
        });
      } else {
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
    }
    const recordSuccessStatusPersistenceError = (
      persistenceTarget: "integrationRule" | "integrationConnection",
      persistenceError: unknown,
    ): void => {
      const persistenceMessage =
        persistenceError instanceof Error ? persistenceError.message : String(persistenceError);
      statusPersistenceErrors.push(
        `${persistenceTarget} status persistence failed: ${persistenceMessage}`,
      );
      console.error("provider_metrics_sync.success_status_persist_failed", {
        provider: definition.provider,
        ruleKey: input.ruleKey,
        userId: input.userId,
        persistenceTarget,
        persistenceError: persistenceMessage,
      });
    };
    const checkpointPatch = rawIngestionWarning
      ? checkpoint
      : {
          ...checkpoint,
          lastRunAt: runAt.toISOString(),
          rangePreset: config.rangePreset,
          syncMode: mode,
          from: range.from,
          to: range.to,
          snapshotKey: definition.snapshotKey,
        };

    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastObservedAt: rawIngestionWarning ? rule.lastObservedAt : toDate,
        lastRunAt: runAt,
        lastError: rawIngestionWarning,
        checkpoint: checkpointPatch as unknown as Prisma.InputJsonValue,
      },
    }).catch((persistenceError) => {
      recordSuccessStatusPersistenceError("integrationRule", persistenceError);
    });

    const connectionSuccessData = {
      status: IntegrationConnectionStatus.CONNECTED,
      lastSyncedAt: runAt,
      lastError: rawIngestionWarning,
    };
    try {
      const updateResult = await prisma.integrationConnection.updateMany({
        where: {
          userId: input.userId,
          provider: definition.provider,
        },
        data: connectionSuccessData,
      });
      if (updateResult?.count === 0) {
        await prisma.integrationConnection.upsert({
          where: {
            userId_provider: {
              userId: input.userId,
              provider: definition.provider,
            },
          },
          update: connectionSuccessData,
          create: {
            userId: input.userId,
            provider: definition.provider,
            ...connectionSuccessData,
          },
        });
      }
    } catch (persistenceError) {
      recordSuccessStatusPersistenceError("integrationConnection", persistenceError);
    }

    return {
      ruleId: rule.id,
      ruleKey: input.ruleKey,
      provider: definition.provider,
      snapshotKey: definition.snapshotKey,
      dryRun: Boolean(input.dryRun),
      rangePreset: range.preset,
      from: range.from,
      to: range.to,
      capturedAt: runAt.toISOString(),
      rawRecordCount: rawIngestionResult.recordCount,
      acceptedRawRecordCount: rawIngestionResult.acceptedCount,
      statusPersistenceErrors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider metrics sync failed";

    if (!input.dryRun) {
      await storeAnalyticsSnapshotFailure({
        userId: input.userId,
        providerKey: definition.snapshotKey,
        contextKey: config.contextKey,
        rangePreset: range.preset,
        fromDate,
        toDate,
        error: message,
        expiresAt: snapshotExpiryFromNow(1),
      })
        .catch((failureError) => {
          console.error("provider_metrics_sync.failure_snapshot_failed", {
            provider: definition.provider,
            ruleKey: input.ruleKey,
            userId: input.userId,
            originalError: message,
            failureSnapshotError:
              failureError instanceof Error ? failureError.message : String(failureError),
          });
        });
    }

    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        lastError: message,
      },
    }).catch((persistenceError) => {
      console.error("provider_metrics_sync.failure_status_persist_failed", {
        provider: definition.provider,
        ruleKey: input.ruleKey,
        userId: input.userId,
        originalError: message,
        persistenceError:
          persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
      });
    });

    if (isAuthError(error)) {
      const connectionFailureData = {
        status: IntegrationConnectionStatus.ERROR,
        lastError: message,
      };
      try {
        const updateResult = await prisma.integrationConnection.updateMany({
          where: {
            userId: input.userId,
            provider: definition.provider,
          },
          data: connectionFailureData,
        });
        if (updateResult?.count === 0) {
          await prisma.integrationConnection.upsert({
            where: {
              userId_provider: {
                userId: input.userId,
                provider: definition.provider,
              },
            },
            update: connectionFailureData,
            create: {
              userId: input.userId,
              provider: definition.provider,
              ...connectionFailureData,
            },
          });
        }
      } catch (persistenceError) {
        console.error("provider_metrics_sync.failure_status_persist_failed", {
          provider: definition.provider,
          ruleKey: input.ruleKey,
          userId: input.userId,
          originalError: message,
          persistenceError:
            persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
        });
      }
    }

    throw error;
  }
}
