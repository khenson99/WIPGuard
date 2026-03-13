function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickValue(values: Record<string, unknown>, candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (candidate in values) return values[candidate];
  }

  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(values)) {
    normalized.set(normalizeKey(key), value);
  }

  for (const candidate of candidates) {
    const hit = normalized.get(normalizeKey(candidate));
    if (hit !== undefined) return hit;
  }

  return null;
}

export interface NormalizedCodaMasterOrderArchiveRow {
  externalId: string;
  tenantKey: string | null;
  occurredAt: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  payload: Record<string, unknown>;
}

export function normalizeCodaMasterOrderArchiveRow(
  row: Record<string, unknown>
): NormalizedCodaMasterOrderArchiveRow | null {
  const values = asRecord(row.values);
  const externalId = asString(row.id);
  if (!externalId) return null;

  const tenantId = asString(pickValue(values, ["tenant_id", "tenantId", "Tenant ID"]));
  const accountId = asString(pickValue(values, ["account_id", "accountId", "Account ID"]));
  const companyName = asString(pickValue(values, ["company", "Company"]));
  const tenantName =
    asString(pickValue(values, ["tenant_name", "tenantName", "Tenant Name"])) ?? companyName;
  const accountName =
    asString(pickValue(values, ["account_name", "accountName", "Account Name"])) ??
    companyName ??
    tenantName;
  const orderDate = asString(pickValue(values, ["order_date", "orderDate", "Order Date"]));
  const createdAt = asString(
    pickValue(values, ["createdAt", "created_at", "Created on", "Created On"])
  );
  const updatedAt = asString(
    pickValue(values, ["updatedAt", "updated_at", "Updated on", "Updated On"])
  );

  return {
    externalId,
    tenantKey: tenantId ?? accountId,
    occurredAt: orderDate ?? createdAt ?? asString(row.createdAt),
    sourceCreatedAt: asString(row.createdAt) ?? createdAt,
    sourceUpdatedAt: asString(row.updatedAt) ?? updatedAt,
    payload: {
      ...values,
      tenantId,
      accountId,
      tenantName,
      accountName,
      companyName: companyName ?? accountName ?? tenantName,
      orderDate,
      orderStatus: asString(pickValue(values, ["status", "Status"])),
      locationId: asString(pickValue(values, ["location_id", "locationId", "Location ID"])),
      workflowId: asString(pickValue(values, ["workflow_id", "workflowId", "Workflow ID"])),
      plan: asString(pickValue(values, ["plan", "Plan"])),
      quantity: pickValue(values, ["quantity", "Quantity"]),
      createdAt,
      updatedAt,
    },
  };
}
