/**
 * Slack Channel Routing Policies
 *
 * Routes Slack notifications to the appropriate channel based on:
 *  1. Project-specific channel mapping
 *  2. Priority-based channel mapping (P0 -> #urgent, P1 -> #important, etc.)
 *  3. Notification type routing (blocked -> #incidents, etc.)
 *  4. Default fallback channel
 *
 * Policies are evaluated in priority order:
 *  1. Exact project match
 *  2. Priority match
 *  3. Notification type match
 *  4. Default channel
 *
 * Configuration is stored as JSON in the IntegrationRule config field.
 */

import {
  IntegrationProvider,
  Prisma,
  type IntegrationRule,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelRoutingPolicy {
  /** Human-readable label for the policy */
  label: string;
  /** Match criteria — at least one must be specified */
  match: {
    projectId?: string;
    priority?: string;
    notificationType?: string;
  };
  /** The Slack channel ID to route to */
  channelId: string;
  /** Optional thread TS to post as a thread reply */
  threadTs?: string;
  /** Whether this policy is active */
  enabled: boolean;
}

export interface ChannelRoutingConfig {
  /** Ordered list of routing policies (first match wins) */
  policies: ChannelRoutingPolicy[];
  /** Default channel if no policy matches */
  defaultChannelId: string | null;
  /** Whether to fall back to DM if no channel matches */
  fallbackToDm: boolean;
}

export interface ChannelRoutingContext {
  projectId?: string;
  priority?: string;
  notificationType?: string;
}

export interface ResolvedChannel {
  channelId: string;
  threadTs?: string;
  matchedPolicy?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SLACK_CHANNEL_ROUTING_RULE_KEY = "slack_channel_routing";

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function defaultChannelRoutingConfig(): ChannelRoutingConfig {
  return {
    policies: [],
    defaultChannelId: null,
    fallbackToDm: true,
  };
}

function normalizePolicy(raw: unknown): ChannelRoutingPolicy | null {
  const input = asRecord(raw);

  const channelId = typeof input.channelId === "string" ? input.channelId.trim() : null;
  if (!channelId) return null;

  const match = asRecord(input.match);
  const hasMatch =
    typeof match.projectId === "string" ||
    typeof match.priority === "string" ||
    typeof match.notificationType === "string";

  if (!hasMatch) return null;

  return {
    label: typeof input.label === "string" ? input.label.trim() : "Unnamed policy",
    match: {
      projectId: typeof match.projectId === "string" ? match.projectId : undefined,
      priority: typeof match.priority === "string" ? match.priority : undefined,
      notificationType:
        typeof match.notificationType === "string" ? match.notificationType : undefined,
    },
    channelId,
    threadTs: typeof input.threadTs === "string" ? input.threadTs : undefined,
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
  };
}

export function normalizeChannelRoutingConfig(raw: unknown): ChannelRoutingConfig {
  const input = asRecord(raw);
  const fallback = defaultChannelRoutingConfig();

  const rawPolicies = Array.isArray(input.policies) ? input.policies : [];
  const policies = rawPolicies
    .map((item) => normalizePolicy(item))
    .filter((policy): policy is ChannelRoutingPolicy => policy !== null);

  const defaultChannelId =
    typeof input.defaultChannelId === "string" && input.defaultChannelId.trim().length > 0
      ? input.defaultChannelId.trim()
      : fallback.defaultChannelId;

  const fallbackToDm =
    typeof input.fallbackToDm === "boolean" ? input.fallbackToDm : fallback.fallbackToDm;

  return {
    policies,
    defaultChannelId,
    fallbackToDm,
  };
}

// ---------------------------------------------------------------------------
// In-memory routing cache (loaded from DB, refreshed periodically)
// ---------------------------------------------------------------------------

let cachedConfig: ChannelRoutingConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Load routing config from the database for a given user.
 */
export async function loadChannelRoutingConfig(userId: string): Promise<ChannelRoutingConfig> {
  const rule = await prisma.integrationRule.findUnique({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.SLACK,
        key: SLACK_CHANNEL_ROUTING_RULE_KEY,
      },
    },
  });

  if (!rule) {
    return defaultChannelRoutingConfig();
  }

  return normalizeChannelRoutingConfig(rule.config);
}

/**
 * Set the in-memory routing config (used by the notification bridge).
 */
export function setChannelRoutingConfig(config: ChannelRoutingConfig): void {
  cachedConfig = config;
  cacheTimestamp = Date.now();
}

/**
 * Clear the in-memory cache (for testing).
 */
export function clearChannelRoutingCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * Get the current routing config from cache.
 */
export function getCachedChannelRoutingConfig(): ChannelRoutingConfig | null {
  if (!cachedConfig) return null;
  if (Date.now() - cacheTimestamp > CACHE_TTL_MS) {
    cachedConfig = null;
    cacheTimestamp = 0;
    return null;
  }
  return cachedConfig;
}

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

/**
 * Check whether a single policy matches the given context.
 */
export function policyMatches(
  policy: ChannelRoutingPolicy,
  context: ChannelRoutingContext
): boolean {
  if (!policy.enabled) return false;

  // All specified match criteria must pass (AND logic)
  if (policy.match.projectId && policy.match.projectId !== context.projectId) {
    return false;
  }
  if (policy.match.priority && policy.match.priority !== context.priority) {
    return false;
  }
  if (
    policy.match.notificationType &&
    policy.match.notificationType !== context.notificationType
  ) {
    return false;
  }

  return true;
}

/**
 * Resolve the channel for a notification given a routing context.
 * Returns null if no channel is resolved (caller should fall back to DM).
 *
 * Evaluation order (first match wins):
 *  1. Policies ordered by specificity (more match criteria = higher priority)
 *  2. Default channel
 */
export function resolveChannelForNotification(
  context: ChannelRoutingContext,
  config?: ChannelRoutingConfig | null
): ResolvedChannel | null {
  const effectiveConfig = config ?? cachedConfig;
  if (!effectiveConfig) return null;

  // Sort policies by specificity (more match criteria = higher priority)
  const sortedPolicies = [...effectiveConfig.policies].sort((a, b) => {
    const aSpecificity = countMatchCriteria(a);
    const bSpecificity = countMatchCriteria(b);
    return bSpecificity - aSpecificity;
  });

  for (const policy of sortedPolicies) {
    if (policyMatches(policy, context)) {
      return {
        channelId: policy.channelId,
        threadTs: policy.threadTs,
        matchedPolicy: policy.label,
      };
    }
  }

  // Fallback to default channel
  if (effectiveConfig.defaultChannelId) {
    return {
      channelId: effectiveConfig.defaultChannelId,
      matchedPolicy: "default",
    };
  }

  return null;
}

function countMatchCriteria(policy: ChannelRoutingPolicy): number {
  let count = 0;
  if (policy.match.projectId) count += 1;
  if (policy.match.priority) count += 1;
  if (policy.match.notificationType) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// CRUD operations for routing rules
// ---------------------------------------------------------------------------

export interface ChannelRoutingRuleState {
  id: string;
  key: string;
  enabled: boolean;
  config: ChannelRoutingConfig;
  lastRunAt: string | null;
  lastError: string | null;
}

export async function getOrCreateChannelRoutingRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.SLACK,
        key: SLACK_CHANNEL_ROUTING_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.SLACK,
      key: SLACK_CHANNEL_ROUTING_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultChannelRoutingConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeChannelRoutingRule(rule: IntegrationRule): ChannelRoutingRuleState {
  return {
    id: rule.id,
    key: rule.key,
    enabled: rule.enabled,
    config: normalizeChannelRoutingConfig(rule.config),
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastError: rule.lastError,
  };
}

export async function updateChannelRoutingConfig(
  userId: string,
  configPatch: Partial<ChannelRoutingConfig>
): Promise<ChannelRoutingRuleState> {
  const existing = await getOrCreateChannelRoutingRule(userId);
  const baseConfig = normalizeChannelRoutingConfig(existing.config);

  const nextConfig = normalizeChannelRoutingConfig({
    ...baseConfig,
    ...configPatch,
    policies: configPatch.policies ?? baseConfig.policies,
  });

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  // Update in-memory cache
  setChannelRoutingConfig(nextConfig);

  return serializeChannelRoutingRule(updated);
}

export async function addChannelRoutingPolicy(
  userId: string,
  policy: ChannelRoutingPolicy
): Promise<ChannelRoutingRuleState> {
  const existing = await getOrCreateChannelRoutingRule(userId);
  const baseConfig = normalizeChannelRoutingConfig(existing.config);

  const nextConfig: ChannelRoutingConfig = {
    ...baseConfig,
    policies: [...baseConfig.policies, policy],
  };

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  setChannelRoutingConfig(nextConfig);
  return serializeChannelRoutingRule(updated);
}

export async function removeChannelRoutingPolicy(
  userId: string,
  policyIndex: number
): Promise<ChannelRoutingRuleState> {
  const existing = await getOrCreateChannelRoutingRule(userId);
  const baseConfig = normalizeChannelRoutingConfig(existing.config);

  if (policyIndex < 0 || policyIndex >= baseConfig.policies.length) {
    throw new Error(`Policy index ${policyIndex} out of range`);
  }

  const nextPolicies = baseConfig.policies.filter((_, idx) => idx !== policyIndex);
  const nextConfig: ChannelRoutingConfig = {
    ...baseConfig,
    policies: nextPolicies,
  };

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  setChannelRoutingConfig(nextConfig);
  return serializeChannelRoutingRule(updated);
}
