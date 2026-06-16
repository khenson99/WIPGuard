/**
 * Canonical stage-key normalizer shared across the analytics modules: trims,
 * lower-cases, and collapses runs of whitespace / underscores / hyphens, so
 * "Closed Won", "closed_won", and "closed-won" all map to "closedwon". Returns
 * "" for null/undefined.
 *
 * This is the single source of truth for the comparison key used to build each
 * module's CANONICAL_STAGE_*_BY_KEY lookup map. It is deliberately NOT used by
 * the callers whose semantics differ on purpose:
 *   - analytics/subscription-mrr.ts      (returns null for an empty key)
 *   - analytics/customer-journey-conversion.ts (keeps separators — no replace)
 *   - imladris/materialization.ts & imladris/investor-dashboard-export.ts
 *       (preprocess `unknown` input via their own `stageText` helper first)
 */
export function normalizeStageKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
}
