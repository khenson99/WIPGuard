import { REQUIRED_IMLADRIS_PROVIDERS, IMLADRIS_METRIC_DEFINITIONS, getImladrisDashboardDefinition } from "@/lib/imladris/catalog";
import type { ImladrisProviderKey } from "@/lib/imladris/catalog";
import { normalizeMetricConfidence, normalizeMetricStatus, normalizeMetricWarnings } from "@/lib/imladris/confidence";
import {
  buildDerivedImladrisMetricRows,
  extractImladrisScalar,
  type DerivedMetricInput,
} from "@/lib/imladris/derived-metrics";
import { getImladrisHistoricalWindow } from "@/lib/imladris/ingestion";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import { attachWinnerLineage } from "@/lib/imladris/winner-lineage";
import { snapshotKeyQueryVariants } from "@/lib/integrations/provider-registry";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import type { IntegrationProvider } from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

type SourceStatus = "connected" | "missing" | "partial" | "stale" | "error";
type MetricStatus = "ready" | "missing" | "partial" | "stale" | "error";

interface UserContext {
  userId: string | null;
  organizationId: string | null;
}

interface SourceRow {
  provider: unknown;
  status: unknown;
  userId?: string | null;
  organizationId?: string | null;
  connectedAt: Date | string | null;
  lastSyncedAt: Date | string | null;
  expiresAt?: Date | string | null;
  lastError: string | null;
}

interface SnapshotRow {
  userId?: string | null;
  providerKey: string;
  status: unknown;
  capturedAt: Date | string;
  expiresAt: Date | string;
  lastError: string | null;
}

interface SourceSyncRunRow {
  provider: unknown;
  status: unknown;
  userId?: string | null;
  organizationId?: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  windowStart: Date | string | null;
  windowEnd: Date | string | null;
  checkpoint: unknown;
  recordCount: unknown;
  acceptedCount: unknown;
  errorCount: unknown;
  lastError: string | null;
}

interface MetricLineageRow {
  sourceKey: string;
  sourceType: string;
  sourceId: string | null;
  rawRecordId: string | null;
  capturedAt: Date | string | null;
  metadata: unknown;
}

interface CanonicalMetricRow {
  id: string;
  metricKey: string;
  department: string;
  unit: string;
  value: unknown;
  periodStart: Date | string;
  periodEnd: Date | string;
  status: unknown;
  confidence: number;
  warnings: string[];
  calculationVersion: string;
  computedAt: Date | string;
  userId?: string | null;
  organizationId?: string | null;
  /**
   * Lineage is intentionally NOT eagerly included on canonical metric queries.
   * It is loaded separately for the small set of "winner" rows only — the
   * lineage table can hold millions of rows across historical metric values,
   * and `include: { lineage }` over the full history caused multi-minute
   * queries and pgsql_tmp disk exhaustion in production (2026-06-11 incident).
   */
  lineage?: MetricLineageRow[];
}

function scalarDateValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarDateValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.date,
    record.timestamp,
    record.time,
    record.iso,
    record.isoString,
    record.iso_string,
    record.milliseconds,
    record.millis,
    record.seconds,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarDateValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
    if (normalized instanceof Date) return normalized;
  }

  return value;
}

function toDate(value: unknown): Date | null {
  const normalizedValue = scalarDateValue(value);
  if (normalizedValue === null || normalizedValue === undefined) return null;
  if (normalizedValue instanceof Date) {
    return Number.isNaN(normalizedValue.getTime()) ? null : normalizedValue;
  }
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue) && normalizedValue > 0) {
    const timestampMs = normalizedValue < 10_000_000_000 ? normalizedValue * 1000 : normalizedValue;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof normalizedValue === "string") {
    const normalized = normalizedValue.trim();
    if (!normalized) return null;
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const timestamp = Number(normalized);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        const timestampMs = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        const date = new Date(timestampMs);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIso(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function ageHours(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * 60 * 1000);
}

function canonicalMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(date: Date): string {
  return canonicalMonthKey(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)),
  );
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeContext(context: UserContext): UserContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
}

function sourceStatusValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? sourceStatusValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.status,
    record.state,
    record.result,
    record.code,
    record.name,
    data.status,
    data.state,
    data.result,
    data.code,
    data.name,
    data.attributes,
    data.value,
    record.value,
    record.sourceStatus,
    record.source_status,
    record.connectionStatus,
    record.connection_status,
    record.syncStatus,
    record.sync_status,
    record.providerStatus,
    record.provider_status,
    record.rawStatus,
    record.raw_status,
  ];
  for (const candidate of candidates) {
    const normalized = sourceStatusValue(candidate, seen);
    if (typeof normalized === "string" && normalized.trim().length > 0) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function normalizeSourceStateStatus(status: unknown): string {
  const statusText = sourceStatusValue(status);
  if (typeof statusText !== "string") return "";
  const normalized = statusText.trim().toUpperCase().replace(/[\s_-]+/g, "_");
  if (
    [
      "COMPLETED_WITH_ERRORS",
      "COMPLETE_WITH_ERRORS",
      "DONE_WITH_ERRORS",
      "SUCCESS_WITH_ERRORS",
      "WARNING",
      "WARN",
      "PENDING",
      "QUEUED",
      "RUNNING",
      "IN_PROGRESS",
      "PROCESSING",
      "STARTED",
    ].includes(normalized)
  ) {
    return "PARTIAL";
  }
  if (["COMPLETED", "COMPLETE", "DONE", "OK"].includes(normalized)) {
    return "SUCCESS";
  }
  if (["ACTIVE", "AUTHORIZED", "AUTHENTICATED", "ENABLED"].includes(normalized)) {
    return "CONNECTED";
  }
  if (["DISABLED", "REVOKED", "REMOVED"].includes(normalized)) {
    return "DISCONNECTED";
  }
  if (
    ["FAILED", "EXPIRED", "TIMED_OUT", "TIMEOUT", "CANCELED", "CANCELLED", "ABORTED", "TERMINATED"].includes(
      normalized,
    )
  ) {
    return "ERROR";
  }
  return normalized;
}

function displaySourceStateStatus(status: unknown): string {
  return normalizeSourceStateStatus(status) || (typeof status === "string" && status.trim()) || "UNKNOWN";
}

function normalizedErrorMessage(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function directMetricValueFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !["properties", "values", "fields", "attributes", "data"].includes(key)),
  );
}

function directDataMetricValueFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !["id", "type", "properties", "values", "fields", "attributes", "data"].includes(key),
    ),
  );
}

function publicMetricValue(value: unknown): unknown {
  const payload = asRecord(value);
  if (Object.keys(payload).length === 0) return value ?? null;
  const data = asRecord(payload.data);
  const sources = [
    directMetricValueFields(payload),
    asRecord(payload.properties),
    asRecord(payload.values),
    asRecord(payload.fields),
    asRecord(payload.attributes),
    directDataMetricValueFields(data),
    asRecord(data.properties),
    asRecord(data.values),
    asRecord(data.fields),
    asRecord(data.attributes),
  ].filter((source) => Object.keys(source).length > 0);
  const merged = Object.assign({}, ...sources.reverse());
  const entries = Object.entries(merged);
  if (entries.length === 1 && ["value", "metricValue", "metric_value"].includes(entries[0][0])) {
    return entries[0][1];
  }
  return merged;
}

function lineageTextValue(value: unknown, seen = new WeakSet<object>()): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? lineageTextValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.key,
    record.id,
    record.type,
    record.name,
    data.key,
    data.id,
    data.type,
    data.name,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];
  for (const candidate of candidates) {
    const normalized = lineageTextValue(candidate, seen);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeProviderAlias(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  if (value === null || value === undefined || typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.length === 1 ? normalizeProviderAlias(value[0], seen) : "";
  }

  const providerRecord = asRecord(value);
  const data = asRecord(providerRecord.data);
  const candidates = [
    providerRecord.key,
    providerRecord.provider,
    providerRecord.providerKey,
    providerRecord.provider_key,
    providerRecord.name,
    providerRecord.label,
    providerRecord.value,
    providerRecord.id,
    data.key,
    data.id,
    data.type,
    data.name,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    providerRecord.attributes,
    providerRecord.values,
    providerRecord.fields,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeProviderAlias(candidate, seen);
    if (normalized) return normalized;
  }
  return "";
}

function providerAliasMatches(value: unknown, aliases: string[]): boolean {
  const normalizedValue = normalizeProviderAlias(value);
  return normalizedValue.length > 0 &&
    aliases.some((alias) => normalizeProviderAlias(alias) === normalizedValue);
}

function isUnknownCompletedSyncRunStatus(status: string): boolean {
  return !["SUCCESS", "PARTIAL", "ERROR"].includes(status);
}

function connectionExpired(connection: SourceRow | null, now: Date): boolean {
  if (!connection?.expiresAt) return false;
  const expiresAt = toDate(connection.expiresAt);
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function connectionExpiryInvalid(connection: SourceRow | null): boolean {
  return Boolean(connection?.expiresAt && toDate(connection.expiresAt) === null);
}

function canonicalMetricScopeWhere(context: UserContext) {
  if (context.organizationId) {
    const scopedRows = context.userId ? [{ userId: context.userId, organizationId: context.organizationId }] : [];
    const legacyUserRows = context.userId ? [{ userId: context.userId, organizationId: null }] : [];
    return {
      OR: [
        ...scopedRows,
        { userId: null, organizationId: context.organizationId },
        ...legacyUserRows,
        { userId: null, organizationId: null },
      ],
    };
  }

  if (!context.userId) {
    return {
      OR: [{ userId: null, organizationId: null }],
    };
  }

  return {
    OR: [
      { userId: context.userId, organizationId: null },
      { userId: null, organizationId: null },
    ],
  };
}

function canonicalMetricMatchesContext(row: CanonicalMetricRow, context: UserContext): boolean {
  if (row.userId === undefined && row.organizationId === undefined) return true;

  const rowUserId = row.userId ?? null;
  const rowOrganizationId = row.organizationId ?? null;

  if (context.organizationId) {
    if (rowOrganizationId === context.organizationId) {
      return rowUserId === null || rowUserId === context.userId;
    }
    if (rowOrganizationId === null) {
      return rowUserId === null || Boolean(context.userId && rowUserId === context.userId);
    }
    return false;
  }

  if (context.userId) {
    return rowOrganizationId === null && (rowUserId === null || rowUserId === context.userId);
  }

  return rowUserId === null && rowOrganizationId === null;
}

function canonicalMetricScopeSpecificity(row: CanonicalMetricRow, context: UserContext): number {
  if (row.userId === undefined && row.organizationId === undefined) return 1;

  const rowUserId = row.userId ?? null;
  const rowOrganizationId = row.organizationId ?? null;

  if (context.organizationId) {
    if (rowUserId === context.userId && rowOrganizationId === context.organizationId) return 4;
    if (context.userId && rowUserId === context.userId && rowOrganizationId === null) return 3;
    if (rowUserId === null && rowOrganizationId === context.organizationId) return 2;
    if (rowUserId === null && rowOrganizationId === null) return 1;
    return 0;
  }

  if (context.userId) {
    if (rowUserId === context.userId && rowOrganizationId === null) return 3;
    if (rowUserId === null && rowOrganizationId === null) return 1;
    return 0;
  }

  return rowUserId === null && rowOrganizationId === null ? 1 : 0;
}

function contextQueryOr(context: UserContext): Array<Record<string, string | null>> {
  if (context.userId && context.organizationId) {
    return [
      { userId: context.userId, organizationId: context.organizationId },
      { userId: null, organizationId: context.organizationId },
      { userId: context.userId, organizationId: null },
      { userId: null, organizationId: null },
    ];
  }
  if (context.organizationId) {
    return [
      { userId: null, organizationId: context.organizationId },
      { userId: null, organizationId: null },
    ];
  }
  if (context.userId) {
    return [
      { userId: context.userId, organizationId: null },
      { userId: null, organizationId: null },
    ];
  }
  return [{ userId: null, organizationId: null }];
}

function sourceEvidenceOwnerUserId(context: UserContext): string | null {
  if (!context.userId) return null;
  const ownerUserId = resolveIntegrationOwnerUserId(context.userId);
  return ownerUserId !== context.userId ? ownerUserId : null;
}

function sourceEvidenceQueryOr(context: UserContext): Array<Record<string, string | null>> {
  const scopes = contextQueryOr(context);
  const ownerUserId = sourceEvidenceOwnerUserId(context);
  if (!ownerUserId) return scopes;
  return [
    ...scopes,
    {
      userId: ownerUserId,
      organizationId: null,
    },
  ];
}

function compareCanonicalMetricRows(
  left: CanonicalMetricRow,
  right: CanonicalMetricRow,
  context: UserContext,
): number {
  const scopeDelta =
    canonicalMetricScopeSpecificity(right, context) -
    canonicalMetricScopeSpecificity(left, context);
  if (scopeDelta !== 0) return scopeDelta;
  const periodDelta =
    (toDate(right.periodEnd)?.getTime() ?? 0) - (toDate(left.periodEnd)?.getTime() ?? 0);
  if (periodDelta !== 0) return periodDelta;
  return (toDate(right.computedAt)?.getTime() ?? 0) - (toDate(left.computedAt)?.getTime() ?? 0);
}

function canonicalMetricAvailableAt(row: CanonicalMetricRow, now: Date): boolean {
  const periodStart = toDate(row.periodStart);
  const periodEnd = toDate(row.periodEnd);
  const computedAt = toDate(row.computedAt);
  return (
    periodStart !== null &&
    periodEnd !== null &&
    periodStart.getTime() <= periodEnd.getTime() &&
    periodEnd.getTime() <= now.getTime() &&
    computedAt !== null &&
    computedAt.getTime() <= now.getTime()
  );
}

function scalarNumberValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarNumberValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.count,
    record.number,
    record.total,
    record.recordCount,
    record.record_count,
    record.acceptedCount,
    record.accepted_count,
    record.errorCount,
    record.error_count,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];
  for (const candidate of candidates) {
    const normalized = scalarNumberValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
  }
  return value;
}

function syncRunCount(value: unknown): number | null {
  return parseImladrisNumber(scalarNumberValue(value) ?? value);
}

function syncRunCounts(syncRun: SourceSyncRunRow): {
  recordCount: number | null;
  acceptedCount: number | null;
  errorCount: number | null;
} {
  return {
    recordCount: syncRunCount(syncRun.recordCount),
    acceptedCount: syncRunCount(syncRun.acceptedCount),
    errorCount: syncRunCount(syncRun.errorCount),
  };
}

function syncRunCountsAreIncomplete(counts: ReturnType<typeof syncRunCounts> | null): boolean {
  return counts?.acceptedCount !== null &&
    counts?.recordCount !== null &&
    counts?.acceptedCount !== undefined &&
    counts?.recordCount !== undefined &&
    counts.acceptedCount < counts.recordCount;
}

function syncRunCountsHaveErrors(counts: ReturnType<typeof syncRunCounts> | null): boolean {
  return (counts?.errorCount ?? 0) > 0;
}

function hasInvalidSyncRunAccounting(syncRun: SourceSyncRunRow): boolean {
  const { recordCount, acceptedCount, errorCount } = syncRunCounts(syncRun);
  const counts = [recordCount, acceptedCount, errorCount];
  if (counts.some((count) => count === null || !Number.isInteger(count) || count < 0)) return true;
  return (
    acceptedCount! > recordCount! ||
    acceptedCount! + errorCount! > recordCount!
  );
}

function syncRunAccountingError(syncRun: SourceSyncRunRow): string | null {
  const { recordCount, acceptedCount, errorCount } = syncRunCounts(syncRun);
  const counts = [recordCount, acceptedCount, errorCount];
  if (counts.some((count) => count === null || !Number.isInteger(count) || count < 0)) {
    return "Sync run record counts are invalid.";
  }
  if (acceptedCount! > recordCount!) {
    return "Sync run accepted count exceeds record count.";
  }
  if (acceptedCount! + errorCount! > recordCount!) {
    return "Sync run accepted and error counts exceed record count.";
  }
  return null;
}

function syncRunCoverageError(counts: ReturnType<typeof syncRunCounts> | null): string | null {
  if (
    counts?.errorCount !== null &&
    counts?.errorCount !== undefined &&
    counts.errorCount > 0
  ) {
    const noun = counts.errorCount === 1 ? "record" : "records";
    return `Sync run reported ${counts.errorCount} errored ${noun}.`;
  }
  if (
    counts?.recordCount !== null &&
    counts?.acceptedCount !== null &&
    counts?.recordCount !== undefined &&
    counts?.acceptedCount !== undefined &&
    counts.acceptedCount < counts.recordCount
  ) {
    return `Sync run accepted ${counts.acceptedCount} of ${counts.recordCount} observed records.`;
  }
  return null;
}

function hasInvalidSyncRunWindow(syncRun: SourceSyncRunRow, now: Date): boolean {
  const windowStart = toDate(syncRun.windowStart);
  const windowEnd = toDate(syncRun.windowEnd);
  if (!windowStart || !windowEnd) return true;
  if (windowStart.getTime() > windowEnd.getTime()) return true;
  return windowEnd.getTime() > now.getTime();
}

function syncRunWindowError(syncRun: SourceSyncRunRow, now: Date): string | null {
  const windowStart = toDate(syncRun.windowStart);
  const windowEnd = toDate(syncRun.windowEnd);
  if (!windowStart || !windowEnd) return "Sync run data window is invalid.";
  if (windowStart.getTime() > windowEnd.getTime()) {
    return "Sync run data window starts after it ends.";
  }
  if (windowEnd.getTime() > now.getTime()) {
    return "Sync run data window ends in the future.";
  }
  return null;
}

function sourceStatus(input: {
  connection: SourceRow | null;
  snapshot: SnapshotRow | null;
  syncRun: SourceSyncRunRow | null;
  now: Date;
  freshnessSlaHours: number;
  lastSyncedAt: Date | null;
  hasRequiredLookback: boolean | null;
  hasFreshWindowEnd: boolean | null;
}): SourceStatus {
  const connectionStatus = normalizeSourceStateStatus(input.connection?.status);
  const snapshotStatus = normalizeSourceStateStatus(input.snapshot?.status);
  const syncRunStatus = normalizeSourceStateStatus(input.syncRun?.status);
  const counts = input.syncRun ? syncRunCounts(input.syncRun) : null;
  if (connectionStatus === "DISCONNECTED") {
    return "missing";
  }
  if (
    connectionExpiryInvalid(input.connection) ||
    connectionExpired(input.connection, input.now) ||
    connectionStatus === "ERROR" ||
    (!input.syncRun && snapshotStatus === "ERROR") ||
    syncRunStatus === "ERROR"
  ) {
    return "error";
  }
  if (input.syncRun && !toDate(input.syncRun.completedAt)) {
    return "partial";
  }
  if (!input.connection && !input.snapshot && !input.syncRun) return "missing";
  if (input.connection && !input.snapshot && !input.syncRun && !input.lastSyncedAt) {
    if (connectionStatus === "CONNECTED") return "partial";
    return "missing";
  }
  if (
    syncRunStatus === "PARTIAL" ||
    (input.syncRun && isUnknownCompletedSyncRunStatus(syncRunStatus)) ||
    (input.syncRun && hasInvalidSyncRunAccounting(input.syncRun)) ||
    (input.syncRun && hasInvalidSyncRunWindow(input.syncRun, input.now)) ||
    syncRunCountsAreIncomplete(counts) ||
    syncRunCountsHaveErrors(counts)
  ) {
    return "partial";
  }
  if (input.hasRequiredLookback === false) {
    return "stale";
  }
  if (input.hasFreshWindowEnd === false) {
    return "stale";
  }
  if (
    input.lastSyncedAt &&
    addHours(input.lastSyncedAt, input.freshnessSlaHours).getTime() < input.now.getTime()
  ) {
    return "stale";
  }
  if (
    !input.syncRun &&
    input.snapshot
  ) {
    const snapshotExpiresAt = toDate(input.snapshot.expiresAt);
    if (!snapshotExpiresAt || snapshotExpiresAt.getTime() < input.now.getTime()) {
      return "stale";
    }
  }
  return "connected";
}

function sourceLastError(input: {
  sourceKey: ImladrisProviderKey;
  status: SourceStatus;
  connection: SourceRow | null;
  snapshot: SnapshotRow | null;
  syncRun: SourceSyncRunRow | null;
  now: Date;
}): string | null {
  const connectionStatus = normalizeSourceStateStatus(input.connection?.status);
  const snapshotStatus = normalizeSourceStateStatus(input.snapshot?.status);
  const syncRunStatus = normalizeSourceStateStatus(input.syncRun?.status);
  const counts = input.syncRun ? syncRunCounts(input.syncRun) : null;

  if (connectionStatus === "DISCONNECTED") {
    return normalizedErrorMessage(input.connection?.lastError);
  }

  if (input.status === "error") {
    if (connectionExpiryInvalid(input.connection)) {
      return normalizedErrorMessage(input.connection?.lastError) ?? "Integration credential expiry is invalid.";
    }
    if (connectionExpired(input.connection, input.now)) {
      return normalizedErrorMessage(input.connection?.lastError) ?? "Integration credentials expired.";
    }
    const syncRunLastError = normalizedErrorMessage(input.syncRun?.lastError);
    if (syncRunStatus === "ERROR" && syncRunLastError) {
      return syncRunLastError;
    }
    const snapshotLastError = normalizedErrorMessage(input.snapshot?.lastError);
    if (!input.syncRun && snapshotStatus === "ERROR" && snapshotLastError) {
      return snapshotLastError;
    }
    const connectionLastError = normalizedErrorMessage(input.connection?.lastError);
    if (connectionStatus === "ERROR" && connectionLastError) {
      return connectionLastError;
    }
  }

  const syncRunLastError = normalizedErrorMessage(input.syncRun?.lastError);
  if (
    input.status === "partial" &&
    input.syncRun &&
    (!toDate(input.syncRun.completedAt) ||
      syncRunStatus === "PARTIAL" ||
      isUnknownCompletedSyncRunStatus(syncRunStatus) ||
      hasInvalidSyncRunAccounting(input.syncRun) ||
      hasInvalidSyncRunWindow(input.syncRun, input.now) ||
      syncRunCountsAreIncomplete(counts) ||
      syncRunCountsHaveErrors(counts)) &&
    syncRunLastError
  ) {
    return syncRunLastError;
  }

  if (input.status === "partial" && input.syncRun) {
    return (
      (!toDate(input.syncRun.completedAt) ? "Sync run has not completed." : null) ??
      syncRunAccountingError(input.syncRun) ??
      syncRunCoverageError(counts) ??
      syncRunWindowError(input.syncRun, input.now)
    );
  }

  if (
    input.status === "partial" &&
    input.connection &&
    !input.snapshot &&
    !input.syncRun &&
    connectionStatus === "CONNECTED"
  ) {
    return normalizedErrorMessage(input.connection.lastError) ?? `${sourceLabel(input.sourceKey)} is connected but no raw sync has completed yet.`;
  }

  const snapshotLastError = input.syncRun ? null : normalizedErrorMessage(input.snapshot?.lastError);
  return (
    normalizedErrorMessage(input.connection?.lastError) ??
    normalizedErrorMessage(input.syncRun?.lastError) ??
    snapshotLastError
  );
}

function canonicalMetricStatus(sourceKeys: ImladrisProviderKey[], sourceStatuses: Map<ImladrisProviderKey, SourceStatus>) {
  if (sourceKeys.every((sourceKey) => sourceStatuses.get(sourceKey) === "connected")) return "ready";
  if (sourceKeys.some((sourceKey) => sourceStatuses.get(sourceKey) === "error")) return "error";
  if (sourceKeys.some((sourceKey) => sourceStatuses.get(sourceKey) === "partial")) return "partial";
  if (sourceKeys.some((sourceKey) => sourceStatuses.get(sourceKey) === "stale")) return "stale";
  return "missing";
}

function canonicalStatus(status: unknown): MetricStatus {
  return normalizeMetricStatus(status);
}

function formatList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function sourceLabel(sourceKey: ImladrisProviderKey): string {
  return (
    REQUIRED_IMLADRIS_PROVIDERS.find((provider) => provider.key === sourceKey)?.label ??
    sourceKey
  );
}

function canonicalLineageSourceKey(value: unknown): ImladrisProviderKey | null {
  const normalized = normalizeProviderAlias(lineageTextValue(value) ?? value);
  if (!normalized) return null;
  return (
    REQUIRED_IMLADRIS_PROVIDERS.find((provider) =>
      [provider.key, ...provider.providerAliases, ...provider.snapshotKeys].some(
        (alias) => normalizeProviderAlias(alias) === normalized,
      ),
    )?.key ?? null
  );
}

function sourceHealthDescription(status: MetricStatus, sourceCount: number): string {
  switch (status) {
    case "partial":
      return sourceCount === 1 ? "has partial sync coverage" : "have partial sync coverage";
    case "error":
      return sourceCount === 1 ? "has errors" : "have errors";
    case "stale":
      return "is stale";
    case "missing":
      return "is missing";
    default:
      return status;
  }
}

function metricSourceHealthWarnings(input: {
  status: MetricStatus;
  sourceKeys: ImladrisProviderKey[];
  sourceStatuses: Map<ImladrisProviderKey, SourceStatus>;
}): string[] {
  const affectedSources = input.sourceKeys.filter((sourceKey) => {
    const sourceStatus = input.sourceStatuses.get(sourceKey) ?? "missing";
    return sourceStatus === input.status;
  });
  if (affectedSources.length === 0) return [];

  const sourceNames = affectedSources.map(sourceLabel);
  return [
    `Metric is ${input.status} because ${formatList(sourceNames)} source data ${sourceHealthDescription(input.status, sourceNames.length)}.`,
  ];
}

function metricStatusWithSourceHealth(input: {
  canonicalStatus: MetricStatus;
  sourceKeys: ImladrisProviderKey[];
  sourceStatuses: Map<ImladrisProviderKey, SourceStatus>;
}): MetricStatus {
  if (input.canonicalStatus !== "ready") return input.canonicalStatus;
  const dependencyStatuses = input.sourceKeys
    .map((sourceKey) => input.sourceStatuses.get(sourceKey))
    .filter((status): status is SourceStatus => Boolean(status));
  if (dependencyStatuses.some((status) => status === "error")) return "error";
  if (dependencyStatuses.some((status) => status === "partial")) return "partial";
  if (dependencyStatuses.some((status) => status === "stale")) return "stale";
  if (
    dependencyStatuses.length < input.sourceKeys.length ||
    dependencyStatuses.some((status) => status === "missing")
  ) {
    return "missing";
  }
  return input.canonicalStatus;
}

function metricLineageWarnings(
  lineage: MetricLineageRow[] | undefined,
  now: Date,
  expectedSourceKeys: ImladrisProviderKey[],
): string[] {
  if (!lineage?.length) return [];
  const warnings: string[] = [];
  const expectedSourceKeySet = new Set<string>(expectedSourceKeys);
  const lineageSourceKeySet = new Set(
    lineage.map((row) => canonicalLineageSourceKey(row.sourceKey)).filter((sourceKey): sourceKey is ImladrisProviderKey => Boolean(sourceKey)),
  );
  const hasUnexpectedSource = lineage.some((row) => {
    const sourceKey = canonicalLineageSourceKey(row.sourceKey);
    return sourceKey === null || !expectedSourceKeySet.has(sourceKey);
  });
  const hasMissingEvidenceTimestamp = lineage.some((row) => row.capturedAt === null || row.capturedAt === undefined);
  const hasMalformedEvidenceTimestamp = lineage.some(
    (row) => row.capturedAt !== null && row.capturedAt !== undefined && toDate(row.capturedAt) === null,
  );
  const hasFutureEvidence = lineage.some((row) => {
    const capturedAt = toDate(row.capturedAt);
    return capturedAt !== null && capturedAt.getTime() > now.getTime();
  });
  const hasMissingRequiredSource =
    !hasUnexpectedSource &&
    !hasMalformedEvidenceTimestamp &&
    !hasFutureEvidence &&
    expectedSourceKeys.some((sourceKey) => !lineageSourceKeySet.has(sourceKey));
  if (hasUnexpectedSource) warnings.push("Metric lineage references sources outside this metric definition.");
  if (hasMissingRequiredSource) warnings.push("Metric lineage is missing required source evidence.");
  if (hasMissingEvidenceTimestamp) warnings.push("Metric lineage is missing source evidence timestamps.");
  if (hasMalformedEvidenceTimestamp) warnings.push("Metric lineage includes malformed source evidence timestamps.");
  if (hasFutureEvidence) warnings.push("Metric lineage includes future-dated source evidence.");
  return warnings;
}

function sourceConnectionStatusRank(status: unknown): number {
  switch (normalizeSourceStateStatus(status)) {
    case "CONNECTED":
      return 0;
    case "ERROR":
      return 1;
    case "DISCONNECTED":
      return 2;
    default:
      return 3;
  }
}

function dateAtOrBefore(value: Date | string | null | undefined, now: Date): Date | null {
  const date = toDate(value);
  return date !== null && date.getTime() <= now.getTime() ? date : null;
}

function connectionTimestamp(connection: SourceRow, now: Date): number {
  if (normalizeSourceStateStatus(connection.status) === "DISCONNECTED") {
    return (
      dateAtOrBefore(connection.connectedAt, now)?.getTime() ??
      dateAtOrBefore(connection.lastSyncedAt, now)?.getTime() ??
      0
    );
  }
  return (
    dateAtOrBefore(connection.lastSyncedAt, now)?.getTime() ??
    dateAtOrBefore(connection.connectedAt, now)?.getTime() ??
    0
  );
}

function connectionScopeSpecificity(
  connection: SourceRow,
  context: UserContext,
  ownerUserId: string | null,
): number {
  const userId = connection.userId ?? null;
  const organizationId = connection.organizationId ?? null;

  if (context.organizationId) {
    if (userId === context.userId && organizationId === context.organizationId) return 4;
    if (context.userId && userId === context.userId && organizationId === null) return 3;
    if (ownerUserId && userId === ownerUserId && organizationId === null) return 3;
    if (userId === null && organizationId === context.organizationId) return 2;
    if (userId === null && organizationId === null) return 1;
    return 0;
  }

  if (context.userId) {
    if (userId === context.userId && organizationId === null) return 3;
    if (ownerUserId && userId === ownerUserId && organizationId === null) return 3;
    if (userId === null && organizationId === null) return 1;
    return 0;
  }

  return userId === null && organizationId === null ? 1 : 0;
}

function sameConnectionScope(left: SourceRow, right: SourceRow): boolean {
  return (left.userId ?? null) === (right.userId ?? null) &&
    (left.organizationId ?? null) === (right.organizationId ?? null);
}

function isAtOrBefore(value: Date | string | null | undefined, now: Date): boolean {
  const date = toDate(value);
  return date !== null && date.getTime() <= now.getTime();
}

function isAfter(value: Date | string | null | undefined, now: Date): boolean {
  const date = toDate(value);
  return date !== null && date.getTime() > now.getTime();
}

function connectionAvailableAt(connection: SourceRow, now: Date): boolean {
  if (dateAtOrBefore(connection.lastSyncedAt, now)) return true;
  if (dateAtOrBefore(connection.connectedAt, now)) return true;
  if (isAfter(connection.lastSyncedAt, now) || isAfter(connection.connectedAt, now)) return false;
  return true;
}

function connectionMatchesContext(
  connection: SourceRow,
  context: UserContext,
  ownerUserId: string | null,
): boolean {
  if (connection.userId === undefined && connection.organizationId === undefined) return true;

  const userId = connection.userId ?? null;
  const organizationId = connection.organizationId ?? null;

  if (context.organizationId) {
    if (organizationId === context.organizationId) {
      return userId === null || userId === context.userId;
    }
    if (organizationId === null) {
      return userId === null ||
        Boolean(context.userId && userId === context.userId) ||
        Boolean(ownerUserId && userId === ownerUserId);
    }
    return false;
  }

  if (context.userId) {
    return organizationId === null &&
      (userId === null || userId === context.userId || userId === ownerUserId);
  }

  return userId === null && organizationId === null;
}

function compareSourceConnections(
  left: SourceRow,
  right: SourceRow,
  context: UserContext,
  now: Date,
  ownerUserId: string | null,
): number {
  const scopeDifference =
    connectionScopeSpecificity(right, context, ownerUserId) -
    connectionScopeSpecificity(left, context, ownerUserId);
  if (scopeDifference !== 0) return scopeDifference;

  if (sameConnectionScope(left, right)) {
    const timestampDifference = connectionTimestamp(right, now) - connectionTimestamp(left, now);
    if (timestampDifference !== 0) return timestampDifference;
  }

  const statusDifference =
    sourceConnectionStatusRank(left.status) - sourceConnectionStatusRank(right.status);
  if (statusDifference !== 0) return statusDifference;

  return connectionTimestamp(right, now) - connectionTimestamp(left, now);
}

function bestConnectionForProvider(input: {
  connections: SourceRow[];
  providerAliases: string[];
  context: UserContext;
  now: Date;
  ownerUserId: string | null;
}): SourceRow | null {
  const candidates = input.connections.filter(
    (candidate) =>
      providerAliasMatches(candidate.provider, input.providerAliases) &&
      connectionMatchesContext(candidate, input.context, input.ownerUserId) &&
      connectionAvailableAt(candidate, input.now),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) =>
    compareSourceConnections(left, right, input.context, input.now, input.ownerUserId),
  )[0] ?? null;
}

function syncRunTimestamp(syncRun: SourceSyncRunRow): number {
  return (
    toDate(syncRun.completedAt)?.getTime() ??
    toDate(syncRun.startedAt)?.getTime() ??
    0
  );
}

function syncRunMatchesContext(
  syncRun: SourceSyncRunRow,
  context: UserContext,
  ownerUserId: string | null,
): boolean {
  if (syncRun.userId === undefined && syncRun.organizationId === undefined) return true;

  const userId = syncRun.userId ?? null;
  const organizationId = syncRun.organizationId ?? null;

  if (context.organizationId) {
    if (organizationId === context.organizationId) {
      return userId === null || userId === context.userId;
    }
    if (organizationId === null) {
      return userId === null ||
        Boolean(context.userId && userId === context.userId) ||
        Boolean(ownerUserId && userId === ownerUserId);
    }
    return false;
  }

  if (context.userId) {
    return organizationId === null &&
      (userId === null || userId === context.userId || userId === ownerUserId);
  }

  return userId === null && organizationId === null;
}

function syncRunScopeSpecificity(
  syncRun: SourceSyncRunRow,
  context: UserContext,
  ownerUserId: string | null,
): number {
  if (syncRun.userId === undefined && syncRun.organizationId === undefined) return 1;

  const userId = syncRun.userId ?? null;
  const organizationId = syncRun.organizationId ?? null;

  if (context.organizationId) {
    if (userId === context.userId && organizationId === context.organizationId) return 4;
    if (context.userId && userId === context.userId && organizationId === null) return 3;
    if (ownerUserId && userId === ownerUserId && organizationId === null) return 3;
    if (userId === null && organizationId === context.organizationId) return 2;
    if (userId === null && organizationId === null) return 1;
    return 0;
  }

  if (context.userId) {
    if (userId === context.userId && organizationId === null) return 3;
    if (ownerUserId && userId === ownerUserId && organizationId === null) return 3;
    if (userId === null && organizationId === null) return 1;
    return 0;
  }

  return userId === null && organizationId === null ? 1 : 0;
}

function syncRunAvailableAt(syncRun: SourceSyncRunRow, now: Date): boolean {
  const completedAt = toDate(syncRun.completedAt);
  if (completedAt) return completedAt.getTime() <= now.getTime();
  const startedAt = toDate(syncRun.startedAt);
  if (startedAt) return startedAt.getTime() <= now.getTime();
  return false;
}

function hasFreshCompletedSyncRunEvidence(
  syncRun: SourceSyncRunRow,
  now: Date,
  freshnessSlaHours: number,
  expectedWindowStart: Date,
): boolean {
  const completedAt = toDate(syncRun.completedAt);
  const windowStart = toDate(syncRun.windowStart);
  const windowEnd = toDate(syncRun.windowEnd);
  return (
    completedAt !== null &&
    windowStart !== null &&
    windowEnd !== null &&
    !hasInvalidSyncRunAccounting(syncRun) &&
    !hasInvalidSyncRunWindow(syncRun, now) &&
    windowStart.getTime() <= expectedWindowStart.getTime() &&
    addHours(completedAt, freshnessSlaHours).getTime() >= now.getTime() &&
    addHours(windowEnd, freshnessSlaHours).getTime() >= now.getTime()
  );
}

function syncRunSelectionRank(
  syncRun: SourceSyncRunRow,
  now: Date,
  freshnessSlaHours: number,
  expectedWindowStart: Date,
): number {
  const completedAt = toDate(syncRun.completedAt);
  const status = normalizeSourceStateStatus(syncRun.status);
  if (completedAt && status && status !== "SUCCESS") {
    return addHours(completedAt, freshnessSlaHours).getTime() >= now.getTime() ? 0 : 2;
  }
  if (hasFreshCompletedSyncRunEvidence(syncRun, now, freshnessSlaHours, expectedWindowStart)) {
    return 0;
  }
  return completedAt ? 2 : 1;
}

function bestSyncRunForProvider(input: {
  syncRuns: SourceSyncRunRow[];
  providerAliases: string[];
  context: UserContext;
  now: Date;
  freshnessSlaHours: number;
  expectedWindowStart: Date;
  ownerUserId: string | null;
}): SourceSyncRunRow | null {
  const candidates = input.syncRuns.filter(
    (candidate) =>
      providerAliasMatches(candidate.provider, input.providerAliases) &&
      syncRunMatchesContext(candidate, input.context, input.ownerUserId) &&
      syncRunAvailableAt(candidate, input.now),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const scopeDifference =
      syncRunScopeSpecificity(right, input.context, input.ownerUserId) -
      syncRunScopeSpecificity(left, input.context, input.ownerUserId);
    if (scopeDifference !== 0) return scopeDifference;

    const completionDifference =
      syncRunSelectionRank(left, input.now, input.freshnessSlaHours, input.expectedWindowStart) -
      syncRunSelectionRank(right, input.now, input.freshnessSlaHours, input.expectedWindowStart);
    if (completionDifference !== 0) return completionDifference;

    return syncRunTimestamp(right) - syncRunTimestamp(left);
  })[0] ?? null;
}

function snapshotTimestamp(snapshot: SnapshotRow): number {
  return toDate(snapshot.capturedAt)?.getTime() ?? 0;
}

function snapshotScopeUserIds(context: UserContext): string[] {
  if (!context.userId) return [];
  return Array.from(new Set([resolveIntegrationOwnerUserId(context.userId), context.userId]));
}

function snapshotMatchesContext(snapshot: SnapshotRow, allowedUserIds: Set<string>): boolean {
  return snapshot.userId === undefined || allowedUserIds.has(snapshot.userId ?? "");
}

function snapshotAvailableAt(snapshot: SnapshotRow, now: Date): boolean {
  return isAtOrBefore(snapshot.capturedAt, now);
}

function bestSnapshotForProvider(input: {
  snapshots: SnapshotRow[];
  snapshotKeys: string[];
  allowedUserIds: Set<string>;
  now: Date;
}): SnapshotRow | null {
  const candidates = input.snapshots.filter(
    (candidate) =>
      providerAliasMatches(candidate.providerKey, input.snapshotKeys) &&
      snapshotMatchesContext(candidate, input.allowedUserIds) &&
      snapshotAvailableAt(candidate, input.now),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (left, right) => snapshotTimestamp(right) - snapshotTimestamp(left),
  )[0] ?? null;
}

export async function buildImladrisSources(input: {
  prisma: PrismaClientType;
  context: UserContext;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const context = normalizeContext(input.context);
  const providerAliases = REQUIRED_IMLADRIS_PROVIDERS.flatMap(
    (provider) => provider.providerAliases,
  ) as IntegrationProvider[];
  const snapshotKeys = snapshotKeyQueryVariants(
    REQUIRED_IMLADRIS_PROVIDERS.flatMap((provider) => provider.snapshotKeys),
  );
  const snapshotUserIds = snapshotScopeUserIds(context);
  const sourceEvidenceScopes = sourceEvidenceQueryOr(context);
  const sourceEvidenceOwnerId = sourceEvidenceOwnerUserId(context);
  // IntegrationConnection.userId is non-nullable, so it must never be filtered with
  // `userId: null` — Prisma rejects that as "Argument `userId` is missing" (crashing the
  // Imladris metrics/sources endpoints with a 500). Connections are per-user
  // (@@unique([userId, provider])), so fetch the candidate user IDs directly and let
  // connectionMatchesContext() narrow by organization below.
  const connectionUserIds = Array.from(
    new Set(
      [context.userId, sourceEvidenceOwnerId].filter((id): id is string => Boolean(id)),
    ),
  );
  const snapshotQuery = snapshotUserIds.length > 0
    ? input.prisma.analyticsSnapshot.findMany({
        where: {
          userId: {
            in: snapshotUserIds,
          },
          providerKey: {
            in: snapshotKeys,
          },
          capturedAt: {
            lte: now,
          },
        },
        select: {
          userId: true,
          providerKey: true,
          status: true,
          capturedAt: true,
          expiresAt: true,
          lastError: true,
        },
        orderBy: [{ capturedAt: "desc" }],
      })
    : Promise.resolve([]);
  const [connections, snapshots, syncRuns] = await Promise.all([
    input.prisma.integrationConnection.findMany({
      where: {
        provider: {
          in: providerAliases,
        },
        userId: {
          in: connectionUserIds,
        },
      },
      select: {
        provider: true,
        status: true,
        userId: true,
        organizationId: true,
        connectedAt: true,
        lastSyncedAt: true,
        expiresAt: true,
        lastError: true,
      },
    }),
    snapshotQuery,
    input.prisma.imladrisSourceSyncRun.findMany({
      where: {
        provider: {
          in: providerAliases,
        },
        startedAt: {
          lte: now,
        },
        OR: sourceEvidenceScopes,
      },
      select: {
        provider: true,
        status: true,
        userId: true,
        organizationId: true,
        startedAt: true,
        completedAt: true,
        windowStart: true,
        windowEnd: true,
        checkpoint: true,
        recordCount: true,
        acceptedCount: true,
        errorCount: true,
        lastError: true,
      },
      orderBy: [{ startedAt: "desc" }],
    }),
  ]);

  const typedConnections = connections as SourceRow[];
  const typedSnapshots = snapshots as SnapshotRow[];
  const typedSyncRuns = syncRuns as SourceSyncRunRow[];
  const allowedSnapshotUserIds = new Set(snapshotUserIds);

  return REQUIRED_IMLADRIS_PROVIDERS.map((provider) => {
    const connection = bestConnectionForProvider({
      connections: typedConnections,
      providerAliases: provider.providerAliases,
      context,
      now,
      ownerUserId: sourceEvidenceOwnerId,
    });
    const snapshot = bestSnapshotForProvider({
      snapshots: typedSnapshots,
      snapshotKeys: provider.snapshotKeys,
      allowedUserIds: allowedSnapshotUserIds,
      now,
    });
    const expectedWindow = getImladrisHistoricalWindow(now);
    const syncRun = bestSyncRunForProvider({
      syncRuns: typedSyncRuns,
      providerAliases: provider.providerAliases,
      context,
      now,
      freshnessSlaHours: provider.freshnessSlaHours,
      expectedWindowStart: expectedWindow.windowStart,
      ownerUserId: sourceEvidenceOwnerId,
    });
    const counts = syncRun ? syncRunCounts(syncRun) : null;
    const lastSyncedAt =
      toDate(syncRun?.completedAt) ??
      toDate(snapshot?.capturedAt) ??
      (connectionExpired(connection, now) || connectionExpiryInvalid(connection)
        ? null
        : dateAtOrBefore(connection?.lastSyncedAt, now));
    const staleAfter = lastSyncedAt
      ? addHours(lastSyncedAt, provider.freshnessSlaHours)
      : null;
    const latestWindowStart = toDate(syncRun?.windowStart);
    const latestWindowEnd = toDate(syncRun?.windowEnd);
    const hasRequiredLookback =
      latestWindowStart != null &&
      latestWindowStart.getTime() <= expectedWindow.windowStart.getTime();
    const hasFreshWindowEnd =
      latestWindowEnd != null &&
      latestWindowEnd.getTime() <= now.getTime() &&
      addHours(latestWindowEnd, provider.freshnessSlaHours).getTime() >= now.getTime();
    const status = sourceStatus({
      connection,
      snapshot,
      syncRun,
      now,
      freshnessSlaHours: provider.freshnessSlaHours,
      lastSyncedAt,
      hasRequiredLookback: syncRun ? hasRequiredLookback : null,
      hasFreshWindowEnd: syncRun ? hasFreshWindowEnd : null,
    });

    return {
      key: provider.key,
      label: provider.label,
      status,
      connected: status === "connected",
      lastSyncedAt: toIso(lastSyncedAt),
      lastSnapshotAt: toIso(snapshot?.capturedAt),
      lastError: sourceLastError({
        sourceKey: provider.key,
        status,
        connection,
        snapshot,
        syncRun,
        now,
      }),
      snapshotKeys: provider.snapshotKeys,
      freshness: {
        slaHours: provider.freshnessSlaHours,
        lastSyncedAt: toIso(lastSyncedAt),
        staleAfter: toIso(staleAfter),
        ageHours: lastSyncedAt ? ageHours(lastSyncedAt, now) : null,
      },
      historicalCoverage: {
        requiredLookbackMonths: provider.historicalLookbackMonths,
        expectedWindowStart: toIso(expectedWindow.windowStart),
        expectedWindowEnd: toIso(expectedWindow.windowEnd),
        latestWindowStart: toIso(latestWindowStart),
        latestWindowEnd: toIso(latestWindowEnd),
        hasRequiredLookback,
        hasFreshWindowEnd,
      },
      latestSyncRun: syncRun
        ? {
            status: displaySourceStateStatus(syncRun.status),
            startedAt: toIso(syncRun.startedAt),
            completedAt: toIso(syncRun.completedAt),
            windowStart: toIso(syncRun.windowStart),
            windowEnd: toIso(syncRun.windowEnd),
            checkpoint: syncRun.checkpoint,
            recordCount: counts?.recordCount,
            acceptedCount: counts?.acceptedCount,
            errorCount: counts?.errorCount,
            lastError: syncRun.lastError,
          }
        : null,
    };
  });
}

export async function buildImladrisMetrics(input: {
  prisma: PrismaClientType;
  context: UserContext;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const context = normalizeContext(input.context);
  const [sources, canonicalRows] = await Promise.all([
    buildImladrisSources({ ...input, context, now }),
    input.prisma.imladrisCanonicalMetricValue.findMany({
      where: {
        metricKey: {
          in: IMLADRIS_METRIC_DEFINITIONS.map((definition) => definition.key),
        },
        periodEnd: {
          lte: now,
        },
        computedAt: {
          lte: now,
        },
        ...canonicalMetricScopeWhere(context),
      },
      orderBy: [{ periodEnd: "desc" }, { computedAt: "desc" }],
    }),
  ]);
  const sourceStatuses = new Map(
    sources.map((source) => [source.key, source.status] as const),
  );
  const canonicalByMetricKey = new Map<string, CanonicalMetricRow>();
  const sortedCanonicalRows = [...(canonicalRows as CanonicalMetricRow[])].sort((left, right) =>
    compareCanonicalMetricRows(left, right, context),
  );
  for (const row of sortedCanonicalRows) {
    if (!canonicalMetricAvailableAt(row, now)) continue;
    if (!canonicalMetricMatchesContext(row, context)) continue;
    if (!canonicalByMetricKey.has(row.metricKey)) {
      canonicalByMetricKey.set(row.metricKey, row);
    }
  }

  // Best-scoped row for the calendar month immediately before each metric's
  // current period (derived metrics use it for period-over-period deltas).
  const previousCanonicalByMetricKey = new Map<string, CanonicalMetricRow>();
  for (const row of sortedCanonicalRows) {
    if (previousCanonicalByMetricKey.has(row.metricKey)) continue;
    if (!canonicalMetricAvailableAt(row, now)) continue;
    if (!canonicalMetricMatchesContext(row, context)) continue;
    const current = canonicalByMetricKey.get(row.metricKey);
    const currentPeriodEnd = current ? toDate(current.periodEnd) : null;
    const rowPeriodEnd = toDate(row.periodEnd);
    if (!currentPeriodEnd || !rowPeriodEnd) continue;
    if (canonicalMonthKey(rowPeriodEnd) !== previousMonthKey(currentPeriodEnd)) continue;
    previousCanonicalByMetricKey.set(row.metricKey, row);
  }

  // Load lineage only for the winning row per metric, via a second query
  // bounded to those ids. The full-history query above intentionally omits
  // lineage: `include: { lineage }` over the whole history pulls every
  // historical lineage row (millions) through pgsql_tmp and caused the
  // 2026-06-11 disk-exhaustion incident.
  await attachWinnerLineage(input.prisma, [...canonicalByMetricKey.values()]);

  const baseMetrics = IMLADRIS_METRIC_DEFINITIONS.map((definition) => {
    const canonicalRow = canonicalByMetricKey.get(definition.key);
    const storedStatus = canonicalRow
      ? canonicalStatus(canonicalRow.status)
      : canonicalMetricStatus(definition.sourceKeys, sourceStatuses);
    const sourceHealthStatus = canonicalRow
      ? metricStatusWithSourceHealth({
          canonicalStatus: storedStatus,
          sourceKeys: definition.sourceKeys,
          sourceStatuses,
        })
      : storedStatus;
    const lineageWarnings = canonicalRow ? metricLineageWarnings(canonicalRow.lineage, now, definition.sourceKeys) : [];
    const status =
      canonicalRow && sourceHealthStatus === "ready" && lineageWarnings.length > 0
        ? "partial"
        : sourceHealthStatus;
    const sourceHealthWarnings =
      canonicalRow && storedStatus === "ready" && sourceHealthStatus !== "ready"
        ? metricSourceHealthWarnings({
            status: sourceHealthStatus,
            sourceKeys: definition.sourceKeys,
            sourceStatuses,
          })
        : [];
    const warnings = canonicalRow
      ? [...normalizeMetricWarnings(canonicalRow.warnings), ...sourceHealthWarnings, ...lineageWarnings]
      : status === "ready"
        ? []
        : ["Canonical provider materialization is required before this metric is board-ready."];
    return {
      key: definition.key,
      label: definition.label,
      department: definition.department,
      unit: definition.unit,
      value: publicMetricValue(canonicalRow?.value),
      periodStart: toIso(canonicalRow?.periodStart),
      periodEnd: toIso(canonicalRow?.periodEnd),
      status,
      confidence: normalizeMetricConfidence(
        canonicalRow?.confidence,
        status === "ready" ? 0.8 : 0,
      ),
      calculationVersion: canonicalRow?.calculationVersion ?? null,
      computedAt: toIso(canonicalRow?.computedAt),
      sourceLineage: canonicalRow?.lineage?.length
        ? canonicalRow.lineage.map((lineage) => {
            const canonicalSourceKey = canonicalLineageSourceKey(lineage.sourceKey);
            const sourceKey = canonicalSourceKey ?? lineageTextValue(lineage.sourceKey) ?? "unknown";
            return {
              sourceKey,
              sourceType: lineageTextValue(lineage.sourceType) ?? "unknown",
              sourceId: lineageTextValue(lineage.sourceId),
              rawRecordId: lineageTextValue(lineage.rawRecordId),
              capturedAt: toIso(lineage.capturedAt),
              metadata: lineage.metadata,
              status: canonicalSourceKey ? sourceStatuses.get(canonicalSourceKey) ?? "missing" : "missing",
            };
          })
        : definition.sourceKeys.map((sourceKey) => ({
            sourceKey,
            status: sourceStatuses.get(sourceKey) ?? "missing",
          })),
      warnings,
    };
  });

  const derivedInputsByKey = new Map<string, DerivedMetricInput>(
    baseMetrics.map((metric) => [
      metric.key,
      {
        key: metric.key,
        status: metric.status,
        confidence: metric.confidence,
        value: extractImladrisScalar(canonicalByMetricKey.get(metric.key)?.value),
        previousValue: extractImladrisScalar(previousCanonicalByMetricKey.get(metric.key)?.value),
        periodStart: metric.periodStart,
        periodEnd: metric.periodEnd,
        computedAt: metric.computedAt,
      },
    ]),
  );
  const derivedMetrics = buildDerivedImladrisMetricRows({
    inputsByKey: derivedInputsByKey,
    sourceStatuses,
  });

  return [...baseMetrics, ...derivedMetrics];
}

export async function buildImladrisDashboard(input: {
  prisma: PrismaClientType;
  context: UserContext;
  dashboardId: string;
  now?: Date;
}) {
  const dashboard = getImladrisDashboardDefinition(input.dashboardId);
  if (!dashboard) return null;
  const metrics = await buildImladrisMetrics(input);
  const metricSet = new Set(dashboard.metricKeys);
  return {
    dashboard,
    metrics: metrics.filter((metric) => metricSet.has(metric.key)),
  };
}
