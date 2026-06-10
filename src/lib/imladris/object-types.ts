export function normalizeImladrisObjectType(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (normalized.endsWith("status")) return normalized;
  if (normalized.endsWith("ss")) return normalized;
  if (normalized.endsWith("sis")) return normalized;
  if (normalized.endsWith("series")) return normalized;
  if (normalized.endsWith("analytics")) return normalized;
  if (normalized === "indices") return "index";
  if (normalized.endsWith("yses")) return `${normalized.slice(0, -3)}sis`;
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("ses")) return normalized.slice(0, -2);
  if (normalized.endsWith("s")) return normalized.slice(0, -1);
  return normalized;
}

function capitalize(value: string): string {
  return value.length === 0 ? "" : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function camelCaseObjectType(value: string): string {
  const parts = value.split("_").filter(Boolean);
  return parts
    .map((part, index) => (index === 0 ? part : capitalize(part)))
    .join("");
}

function pascalCaseObjectType(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map(capitalize)
    .join("");
}

function pluralizeImladrisObjectType(value: string): string {
  if (value === "index") return "indices";
  if (value.endsWith("analysis")) return `${value.slice(0, -2)}es`;
  if (value.endsWith("y")) return `${value.slice(0, -1)}ies`;
  if (
    value.endsWith("s") ||
    value.endsWith("x") ||
    value.endsWith("ch") ||
    value.endsWith("sh")
  ) {
    return `${value}es`;
  }
  return `${value}s`;
}

/**
 * Base object types whose raw records feed point-in-time ("standing")
 * finance metrics regardless of age — `financeWindowWhere` in
 * materialization.ts selects them with `timestamp <= periodEnd`, so rows
 * arbitrarily older than the 13-month lookback window are still read.
 *
 * Shared between materialization (query side) and db-pruning (which must
 * NEVER delete raw records of these types — see src/lib/db-pruning/).
 */
export const IMLADRIS_FINANCE_STANDING_BASE_OBJECT_TYPES = [
  "active_customer_ref",
  "account_balance",
  "balance",
  "deal",
  "snapshot",
  "subscription",
  "subscription_deal",
] as const;

export function imladrisObjectTypeQueryVariants(...objectTypes: string[]): string[] {
  const variants = new Set<string>();

  for (const objectType of objectTypes) {
    const original = objectType.trim();
    const normalized = normalizeImladrisObjectType(original);
    if (!normalized) continue;

    for (const value of [normalized, pluralizeImladrisObjectType(normalized)]) {
      variants.add(value);
      variants.add(value.toUpperCase());
      variants.add(camelCaseObjectType(value));
      variants.add(pascalCaseObjectType(value));
    }

    if (original) variants.add(original);
  }

  return [...variants];
}
