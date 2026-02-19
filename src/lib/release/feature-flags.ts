/**
 * Feature flag system with deterministic hash-based rollout.
 *
 * All evaluation is pure — no side-effects, no DB calls.
 * Flags support allow/deny lists and percentage-based rollout
 * using a deterministic hash so the same (flag, context) pair
 * always produces the same result.
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

export const FLAG_NAMES = {
  hubspot_sync: "hubspot_sync",
  slack_integration: "slack_integration",
  coda_migration: "coda_migration",
  realtime_events: "realtime_events",
} as const;

export type FlagName = (typeof FLAG_NAMES)[keyof typeof FLAG_NAMES];

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface FeatureFlag {
  name: string;
  description: string;
  enabled: boolean;
  /** 0-100 — what percentage of contexts should see the flag on */
  rolloutPercentage: number;
  /** If non-empty, only these context IDs are eligible */
  allowList: string[];
  /** These context IDs are *never* eligible, even if on allowList */
  denyList: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FlagEvaluationContext {
  userId: string;
  teamId?: string;
  environment?: "development" | "staging" | "production";
}

export interface FlagAuditEntry {
  flagName: string;
  action: "created" | "updated" | "deleted" | "evaluated";
  timestamp: string;
  actor: string;
  previousValue?: Partial<FeatureFlag>;
  newValue?: Partial<FeatureFlag>;
  evaluationResult?: boolean;
}

export interface FlagStore {
  flags: Map<string, FeatureFlag>;
  auditLog: FlagAuditEntry[];
}

// ──────────────────────────────────────────────
// Deterministic hash
// ──────────────────────────────────────────────

/**
 * Simple deterministic hash that maps a string to 0-99.
 * Uses djb2 algorithm — fast, well-distributed, zero dependencies.
 */
export function deterministicHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash % 100);
}

// ──────────────────────────────────────────────
// Store helpers (pure — caller owns persistence)
// ──────────────────────────────────────────────

export function createFlagStore(): FlagStore {
  return { flags: new Map(), auditLog: [] };
}

export function createFlag(
  store: FlagStore,
  flag: FeatureFlag,
  actor: string,
): FlagStore {
  const now = new Date().toISOString();
  const entry: FlagAuditEntry = {
    flagName: flag.name,
    action: "created",
    timestamp: now,
    actor,
    newValue: flag,
  };
  const next = new Map(store.flags);
  next.set(flag.name, { ...flag, createdAt: now, updatedAt: now });
  return { flags: next, auditLog: [...store.auditLog, entry] };
}

export function updateFlag(
  store: FlagStore,
  name: string,
  patch: Partial<Omit<FeatureFlag, "name" | "createdAt">>,
  actor: string,
): FlagStore {
  const existing = store.flags.get(name);
  if (!existing) throw new Error(`Flag "${name}" not found`);
  const now = new Date().toISOString();
  const updated: FeatureFlag = { ...existing, ...patch, updatedAt: now };
  const entry: FlagAuditEntry = {
    flagName: name,
    action: "updated",
    timestamp: now,
    actor,
    previousValue: existing,
    newValue: updated,
  };
  const next = new Map(store.flags);
  next.set(name, updated);
  return { flags: next, auditLog: [...store.auditLog, entry] };
}

export function deleteFlag(
  store: FlagStore,
  name: string,
  actor: string,
): FlagStore {
  const existing = store.flags.get(name);
  if (!existing) throw new Error(`Flag "${name}" not found`);
  const entry: FlagAuditEntry = {
    flagName: name,
    action: "deleted",
    timestamp: new Date().toISOString(),
    actor,
    previousValue: existing,
  };
  const next = new Map(store.flags);
  next.delete(name);
  return { flags: next, auditLog: [...store.auditLog, entry] };
}

export function getFlag(
  store: FlagStore,
  name: string,
): FeatureFlag | undefined {
  return store.flags.get(name);
}

export function listFlags(store: FlagStore): FeatureFlag[] {
  return Array.from(store.flags.values());
}

// ──────────────────────────────────────────────
// Evaluation
// ──────────────────────────────────────────────

/**
 * Evaluate whether a feature flag is active for a given context.
 *
 * Order of checks:
 *  1. Flag must exist and be enabled
 *  2. Context must NOT be on the deny list
 *  3. If allow list is non-empty, context must be on the allow list
 *  4. Deterministic hash of `${flagName}:${userId}` must be < rolloutPercentage
 */
export function evaluateFlag(
  store: FlagStore,
  flagName: string,
  context: FlagEvaluationContext,
): boolean {
  const flag = store.flags.get(flagName);
  if (!flag || !flag.enabled) return false;

  // Deny list takes absolute priority
  if (flag.denyList.length > 0 && flag.denyList.includes(context.userId)) {
    return false;
  }

  // Allow list: if provided, only listed users pass
  if (flag.allowList.length > 0) {
    return flag.allowList.includes(context.userId);
  }

  // Percentage rollout — deterministic per (flag, user)
  const bucket = deterministicHash(`${flagName}:${context.userId}`);
  return bucket < flag.rolloutPercentage;
}

/**
 * Same as evaluateFlag but also appends an audit entry.
 */
export function evaluateFlagWithAudit(
  store: FlagStore,
  flagName: string,
  context: FlagEvaluationContext,
): { result: boolean; store: FlagStore } {
  const result = evaluateFlag(store, flagName, context);
  const entry: FlagAuditEntry = {
    flagName,
    action: "evaluated",
    timestamp: new Date().toISOString(),
    actor: context.userId,
    evaluationResult: result,
  };
  return {
    result,
    store: { ...store, auditLog: [...store.auditLog, entry] },
  };
}
