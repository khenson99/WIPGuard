export interface ArdaTenantResolutionConfig {
  configuredTenantId: string;
  companyName: string;
  customerName?: string | null;
}

export interface ArdaTenantUserDetailsRow {
  email: string | null;
  tenantId: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_EMAIL_ROOTS = new Set([
  "arda",
  "gmail",
  "yahoo",
  "outlook",
  "hotmail",
  "icloud",
]);

function isUuid(value: string | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeArdaTenantLookupKey(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
}

function simplifyArdaIdentifier(value: string | null): string {
  return normalizeArdaTenantLookupKey(value).replace(
    /(llc|inc|ltd|company|co|mfg|manufacturing|systems|group|services)$/,
    ""
  );
}

function domainRootFromEmail(email: string | null): string | null {
  const raw = asString(email);
  if (!raw || !raw.includes("@")) return null;
  const domain = raw
    .slice(raw.indexOf("@") + 1)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  const parts = domain.split(".").filter(Boolean);
  if (parts.length === 0) return null;
  const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  const normalized = normalizeArdaTenantLookupKey(root);
  if (!normalized || GENERIC_EMAIL_ROOTS.has(normalized)) return null;
  return normalized;
}

function scoreConfigMatch(root: string, config: ArdaTenantResolutionConfig): number {
  const exactIdentifiers = [
    normalizeArdaTenantLookupKey(config.configuredTenantId),
    normalizeArdaTenantLookupKey(config.companyName),
    normalizeArdaTenantLookupKey(config.customerName ?? null),
  ].filter(Boolean);
  const simplifiedIdentifiers = [
    simplifyArdaIdentifier(config.configuredTenantId),
    simplifyArdaIdentifier(config.companyName),
    simplifyArdaIdentifier(config.customerName ?? null),
  ].filter(Boolean);

  let score = 0;
  if (exactIdentifiers.includes(root)) score += 100;
  if (simplifiedIdentifiers.includes(root)) score += 90;
  if (exactIdentifiers.some((identifier) => identifier.includes(root))) score += 40;
  if (exactIdentifiers.some((identifier) => root.includes(identifier))) score += 40;
  if (simplifiedIdentifiers.some((identifier) => identifier.includes(root))) score += 20;
  if (simplifiedIdentifiers.some((identifier) => root.includes(identifier))) score += 20;
  return score;
}

function parseEmbeddedJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function collectResultTenantIds(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") {
    if (isUuid(value)) {
      acc.add(value);
      return;
    }
    const maybeJson = parseEmbeddedJson(value);
    if (maybeJson !== value) collectResultTenantIds(maybeJson, acc);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectResultTenantIds(entry, acc);
    return;
  }

  const record = asRecord(value);
  for (const [key, child] of Object.entries(record)) {
    const loweredKey = key.toLowerCase();
    if (loweredKey === "tenantid" || loweredKey === "eid") {
      const candidate = asString(child);
      if (isUuid(candidate)) acc.add(candidate);
    }
    collectResultTenantIds(child, acc);
  }
}

export function extractArdaTenantIdsFromResult(value: unknown): string[] {
  const tenantIds = new Set<string>();
  collectResultTenantIds(value, tenantIds);
  return [...tenantIds];
}

export function discoverArdaTenantIdsFromUserDetails(
  configs: ArdaTenantResolutionConfig[],
  userDetailsRows: ArdaTenantUserDetailsRow[]
): Map<string, string[]> {
  const rootsByTenantUuid = new Map<string, Set<string>>();

  for (const row of userDetailsRows) {
    if (!isUuid(row.tenantId)) continue;
    const root = domainRootFromEmail(row.email);
    if (!root) continue;
    const existing = rootsByTenantUuid.get(row.tenantId) ?? new Set<string>();
    existing.add(root);
    rootsByTenantUuid.set(row.tenantId, existing);
  }

  const discovered = new Map<string, Set<string>>();

  for (const [tenantUuid, roots] of rootsByTenantUuid.entries()) {
    const scored = configs
      .map((config) => ({
        config,
        score: [...roots].reduce(
          (best, root) => Math.max(best, scoreConfigMatch(root, config)),
          0
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.config.companyName.localeCompare(right.config.companyName)
      );

    const best = scored[0];
    const second = scored[1];
    if (!best || best.score < 90) continue;
    if (second && second.score >= best.score) continue;

    const key = normalizeArdaTenantLookupKey(best.config.configuredTenantId);
    const bucket = discovered.get(key) ?? new Set<string>();
    bucket.add(tenantUuid);
    discovered.set(key, bucket);
  }

  return new Map(
    [...discovered.entries()].map(([key, tenantIds]) => [key, [...tenantIds]])
  );
}
