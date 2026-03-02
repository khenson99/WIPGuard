/**
 * Provider Health Assembly
 *
 * Pure functions that assemble per-provider health/sync state from
 * IntegrationConnection, IntegrationRule, and IntegrationCircuitState data.
 * Used by GET /api/integrations/[provider]/health.
 */

import type { CircuitSnapshot } from "@/lib/integrations/circuit-breaker";

// ---------------------------------------------------------------------------
// Input types (matching Prisma select shapes)
// ---------------------------------------------------------------------------

export interface ConnectionHealth {
  provider: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  connectedAt: Date | null;
}

export interface RuleHealth {
  key: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
  lastObservedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ProviderHealthError {
  message: string;
  code: string;
}

export interface ProviderHealthResponse {
  provider: string;
  status: string;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: ProviderHealthError | null;
  nextRetryAt: string | null;
  backoff: {
    circuitState: string;
    consecutiveFailures: number;
    currentCooldownMs: number;
    openCount: number;
  } | null;
  rules: Array<{
    key: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastError: string | null;
    lastObservedAt: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const ERROR_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bauth\b|unauthorized|403|401|token.*expired|invalid.*token/i, code: "AUTH_FAILED" },
  { pattern: /rate.?limit|429|too many requests|throttl/i, code: "RATE_LIMITED" },
  { pattern: /timeout|timed?\s*out|ETIMEDOUT|ESOCKETTIMEDOUT/i, code: "TIMEOUT" },
  { pattern: /5\d{2}\b|internal server|bad gateway|service unavailable|upstream/i, code: "UPSTREAM_ERROR" },
  { pattern: /network|ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed/i, code: "NETWORK_ERROR" },
  { pattern: /circuit.?breaker|circuit.*open/i, code: "CIRCUIT_OPEN" },
];

export function classifyError(message: string): string {
  for (const { pattern, code } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return code;
    }
  }
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Derive `lastAttemptAt` from the most recent rule execution across all
 * rules for a provider. Returns null if no rules have run.
 */
export function deriveLastAttemptAt(rules: RuleHealth[]): Date | null {
  let latest: Date | null = null;
  for (const rule of rules) {
    if (rule.lastRunAt && (!latest || rule.lastRunAt > latest)) {
      latest = rule.lastRunAt;
    }
  }
  return latest;
}

/**
 * Derive the most relevant error from connection + rules.
 * Prefers the most recent error (by associated timestamp), falling back
 * to the connection-level error.
 */
export function deriveLastError(
  connection: ConnectionHealth,
  rules: RuleHealth[],
): ProviderHealthError | null {
  // Collect all errors with their associated timestamps
  const candidates: Array<{ message: string; at: Date | null }> = [];

  if (connection.lastError) {
    candidates.push({ message: connection.lastError, at: connection.lastSyncedAt });
  }

  for (const rule of rules) {
    if (rule.lastError) {
      candidates.push({ message: rule.lastError, at: rule.lastRunAt });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by timestamp descending (nulls last)
  candidates.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return b.at.getTime() - a.at.getTime();
  });

  const best = candidates[0]!;
  return {
    message: best.message,
    code: classifyError(best.message),
  };
}

/**
 * Assemble a complete health response for a single provider.
 */
export function assembleProviderHealth(input: {
  connection: ConnectionHealth;
  rules: RuleHealth[];
  circuit: CircuitSnapshot;
}): ProviderHealthResponse {
  const { connection, rules, circuit } = input;

  const lastAttemptAt = deriveLastAttemptAt(rules);
  const lastError = deriveLastError(connection, rules);

  const hasBackoff =
    circuit.state !== "CLOSED" || circuit.consecutiveFailures > 0;

  return {
    provider: connection.provider,
    status: connection.status,
    lastSuccessfulSyncAt: connection.lastSyncedAt?.toISOString() ?? null,
    lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
    lastError,
    nextRetryAt: circuit.nextRetryAt?.toISOString() ?? null,
    backoff: hasBackoff
      ? {
          circuitState: circuit.state,
          consecutiveFailures: circuit.consecutiveFailures,
          currentCooldownMs: circuit.currentCooldownMs,
          openCount: circuit.openCount,
        }
      : null,
    rules: rules.map((rule) => ({
      key: rule.key,
      enabled: rule.enabled,
      lastRunAt: rule.lastRunAt?.toISOString() ?? null,
      lastError: rule.lastError ?? null,
      lastObservedAt: rule.lastObservedAt?.toISOString() ?? null,
    })),
  };
}
