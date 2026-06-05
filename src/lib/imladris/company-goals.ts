import { IntegrationProvider } from "@/generated/prisma/client";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import {
  imladrisObjectTypeQueryVariants,
  normalizeImladrisObjectType,
} from "@/lib/imladris/object-types";
import type { PrismaClientType } from "@/lib/prisma";

type GoalStatus = "on_track" | "at_risk" | "completed";

interface UserContext {
  userId: string | null;
  organizationId: string | null;
}

interface RawProjectRecord {
  id: string;
  provider?: unknown;
  objectType?: string | null;
  externalId?: string | null;
  payload: unknown;
  scopeKey?: string | null;
  sourceCreatedAt?: Date | string | number | null;
  sourceUpdatedAt: Date | string | number | null;
  updatedAt: Date | string | number;
  userId?: string | null;
  organizationId?: string | null;
}

interface CompanyGoalTrackingRow {
  linearProjectId: string;
  sortOrder: number;
  enabled: boolean;
}

export interface CompanyGoalRow {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  state: string;
  status: GoalStatus;
  leadName: string | null;
  teamLabels: string[];
  targetDate: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  progressPct: number;
  completedIssueCount: number;
  totalIssueCount: number;
  blockedIssueCount: number;
  trackingEnabled: boolean;
  warnings: string[];
}

export interface CompanyGoalSetupOption {
  id: string;
  name: string;
  state: string;
  tracked: boolean;
}

export interface CompanyGoalsDashboardData {
  generatedAt: string;
  summary: {
    totalActiveGoals: number;
    onTrackGoals: number;
    atRiskGoals: number;
    completedRecently: number;
    latestSyncAt: string | null;
  };
  goals: CompanyGoalRow[];
  trackingSetup: {
    configured: boolean;
    options: CompanyGoalSetupOption[];
  };
  emptyState: {
    title: string;
    description: string;
  } | null;
}

export type CompanyGoalsPrisma = Pick<PrismaClientType, "imladrisRawSourceRecord" | "companyGoalTracking">;

const PROJECT_OBJECT_TYPES = imladrisObjectTypeQueryVariants("project");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function directDataFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !["type", "properties", "values", "fields", "attributes", "data"].includes(key),
    ),
  );
}

function expandSingleValueSource(source: Record<string, unknown>): Record<string, unknown>[] {
  const entries = Object.entries(source);
  if (entries.length !== 1) return [source];

  const [key, value] = entries[0];
  const nestedValue = asRecord(value);
  if (!["value", "metricValue", "metric_value"].includes(key) || Object.keys(nestedValue).length === 0) {
    return [source];
  }

  return [nestedValue, source];
}

function wrapperSources(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = asRecord(payload.data);
  return [
    payload,
    asRecord(payload.properties),
    asRecord(payload.values),
    asRecord(payload.fields),
    asRecord(payload.attributes),
    directDataFields(data),
    asRecord(data.properties),
    asRecord(data.values),
    asRecord(data.fields),
    asRecord(data.attributes),
  ]
    .flatMap(expandSingleValueSource)
    .filter((source) => Object.keys(source).length > 0);
}

function projectPayloadView(payload: unknown): Record<string, unknown> {
  const sources = wrapperSources(asRecord(payload));
  return Object.assign({}, ...sources.reverse());
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function scalarStringValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarStringValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.metricValue,
    record.metric_value,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];
  for (const candidate of candidates) {
    const normalized = scalarStringValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
  }
  return value;
}

function asString(value: unknown): string | null {
  const normalized = scalarStringValue(value);
  if (typeof normalized === "string" && normalized.trim()) return normalized.trim();
  if (typeof normalized === "number" || typeof normalized === "boolean") return String(normalized);
  return null;
}

function warningValues(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    const values = value.flatMap((item) => warningValues(item, seen));
    seen.delete(value);
    return values;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const values = [
    data.attributes,
    asRecord(data.attributes).warnings,
    asRecord(data.attributes).messages,
    data.warnings,
    data.warning,
    data.messages,
    data.message,
    data.errors,
    data.error,
    data.issues,
    data.issue,
    data.details,
    data.detail,
    record.warnings,
    record.warning,
    record.messages,
    record.message,
    record.errors,
    record.error,
    record.issues,
    record.issue,
    record.details,
    record.detail,
    record.value,
    record.metricValue,
    record.metric_value,
  ].flatMap((item) => warningValues(item, seen));

  seen.delete(value);
  return values;
}

function normalizedWarnings(value: unknown): string[] {
  return warningValues(value)
    .filter((warning): warning is string => typeof warning === "string")
    .map((warning) => warning.trim())
    .filter(Boolean);
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
    record.metricValue,
    record.metric_value,
    record.count,
    record.number,
    record.total,
    record.totalIssueCount,
    record.total_issue_count,
    record.completedIssueCount,
    record.completed_issue_count,
    record.blockedIssueCount,
    record.blocked_issue_count,
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

function asNumber(value: unknown): number | null {
  return parseImladrisNumber(scalarNumberValue(value) ?? value);
}

function scalarDateValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
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
    record.datetime,
    record.dateTime,
    record.date_time,
    record.timestamp,
    record.time,
    record.iso,
    record.isoString,
    record.iso_string,
    record.seconds,
    record.milliseconds,
    record.millis,
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
  if (normalizedValue instanceof Date) return Number.isNaN(normalizedValue.getTime()) ? null : normalizedValue;
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
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toIso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function targetDateValue(payload: Record<string, unknown>): unknown {
  return payload.targetDate ?? payload.target_date;
}

function hasPresentDateValue(value: unknown): boolean {
  const normalizedValue = scalarDateValue(value);
  if (normalizedValue !== value) return hasPresentDateValue(normalizedValue);
  if (value instanceof Date) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function normalizedTargetDate(payload: Record<string, unknown>): string | null {
  const rawTargetDate = targetDateValue(payload);
  const parsedTargetDate = toDate(rawTargetDate);
  if (!parsedTargetDate) return null;
  return asString(rawTargetDate) ?? parsedTargetDate.toISOString();
}

function targetDateIsInvalid(payload: Record<string, unknown>): boolean {
  const rawTargetDate = targetDateValue(payload);
  return hasPresentDateValue(rawTargetDate) && toDate(rawTargetDate) === null;
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizedContext(context: UserContext): UserContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
}

function scopeKeyForContext(context: UserContext): string {
  if (context.organizationId) return `org:${context.organizationId}`;
  if (context.userId) return `user:${context.userId}`;
  return "global";
}

function rawProjectScopeWhere(context: UserContext) {
  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({ userId: null, organizationId: context.organizationId });
    return {
      OR: [
        { scopeKey: organizationScopeKey, organizationId: context.organizationId },
        ...(context.userId
          ? [
              { scopeKey: organizationScopeKey, userId: context.userId },
              {
                scopeKey: scopeKeyForContext({ userId: context.userId, organizationId: null }),
                userId: context.userId,
              },
            ]
          : []),
        { scopeKey: "global", userId: null, organizationId: null },
      ],
    };
  }

  if (context.userId) {
    return {
      OR: [
        { scopeKey: scopeKeyForContext(context), userId: context.userId },
        { scopeKey: "global", userId: null, organizationId: null },
      ],
    };
  }

  return {
    OR: [{ scopeKey: "global", userId: null, organizationId: null }],
  };
}

function rawProjectScopeRank(record: RawProjectRecord, context: UserContext): number {
  if (record.userId === undefined && record.organizationId === undefined && record.scopeKey === undefined) {
    return 1;
  }

  const rowUserId = record.userId ?? null;
  const rowOrganizationId = record.organizationId ?? null;
  const scopeKey = record.scopeKey ?? null;

  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({ userId: null, organizationId: context.organizationId });
    if (
      context.userId &&
      rowUserId === context.userId &&
      (rowOrganizationId === context.organizationId || rowOrganizationId === null) &&
      scopeKey === organizationScopeKey
    ) {
      return 4;
    }
    if (rowUserId === null && rowOrganizationId === context.organizationId && scopeKey === organizationScopeKey) {
      return 3;
    }
    if (
      context.userId &&
      rowUserId === context.userId &&
      rowOrganizationId === null &&
      scopeKey === scopeKeyForContext({ userId: context.userId, organizationId: null })
    ) {
      return 2;
    }
    if (rowUserId === null && rowOrganizationId === null && scopeKey === "global") return 1;
    return 0;
  }

  if (context.userId) {
    if (rowUserId === context.userId && rowOrganizationId === null && scopeKey === scopeKeyForContext(context)) {
      return 3;
    }
    if (rowUserId === null && rowOrganizationId === null && scopeKey === "global") return 1;
    return 0;
  }

  return rowUserId === null && rowOrganizationId === null && scopeKey === "global" ? 1 : 0;
}

function rawProjectMatchesContext(record: RawProjectRecord, context: UserContext): boolean {
  return rawProjectScopeRank(record, context) > 0;
}

function objectTypeStringValue(value: unknown, seen = new WeakSet<object>()): unknown {
  const normalizedValue = scalarStringValue(value);
  if (normalizedValue !== null && normalizedValue !== undefined && typeof normalizedValue !== "object") {
    return normalizedValue;
  }
  if (value === null || value === undefined || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? objectTypeStringValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const dataAttributes = asRecord(data.attributes);
  const candidates = [
    record.objectType,
    record.object_type,
    record.type,
    data.objectType,
    data.object_type,
    data.type,
    dataAttributes.objectType,
    dataAttributes.object_type,
    dataAttributes.type,
  ];
  for (const candidate of candidates) {
    const normalized = scalarStringValue(candidate);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function normalizeObjectType(value: unknown): string {
  const normalizedValue = objectTypeStringValue(value);
  return typeof normalizedValue === "string" ? normalizeImladrisObjectType(normalizedValue) : "";
}

function normalizeProviderKey(value: unknown): string {
  const normalizedValue = scalarStringValue(value);
  return typeof normalizedValue === "string"
    ? normalizedValue
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase()
    : "";
}

function rawProjectIsProvider(record: RawProjectRecord, provider: IntegrationProvider): boolean {
  const normalized = normalizeProviderKey(record.provider);
  const expected = normalizeProviderKey(provider);
  if (!normalized || !expected) return false;
  return normalized === expected || normalized.replaceAll("_", "") === expected.replaceAll("_", "");
}

function rawProjectIsProject(record: RawProjectRecord): boolean {
  return normalizeObjectType(record.objectType ?? "project") === "project";
}

function rawProjectTimestamp(record: RawProjectRecord, asOf?: Date): number {
  const sourceUpdatedAt = toDate(record.sourceUpdatedAt);
  if (sourceUpdatedAt) {
    return !asOf || sourceUpdatedAt.getTime() <= asOf.getTime() ? sourceUpdatedAt.getTime() : 0;
  }

  const timestamps = [toDate(record.updatedAt), toDate(record.sourceCreatedAt)].filter(
    (date): date is Date => date !== null && (!asOf || date.getTime() <= asOf.getTime()),
  );
  return timestamps[0]?.getTime() ?? 0;
}

function rawProjectKey(record: RawProjectRecord): string {
  const payload = projectPayloadView(record.payload);
  return asString(payload.id) ?? asString(record.externalId) ?? record.id;
}

function dedupeRawProjects(records: RawProjectRecord[], context: UserContext, asOf?: Date): RawProjectRecord[] {
  const byKey = new Map<string, RawProjectRecord>();
  for (const record of records) {
    if (!rawProjectMatchesContext(record, context)) continue;
    const key = rawProjectKey(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }

    const scopeDelta = rawProjectScopeRank(record, context) - rawProjectScopeRank(existing, context);
    if (
      scopeDelta > 0 ||
      (scopeDelta === 0 && rawProjectTimestamp(record, asOf) > rawProjectTimestamp(existing, asOf))
    ) {
      byKey.set(key, record);
    }
  }

  return [...byKey.values()];
}

function normalizeState(payload: Record<string, unknown>): string {
  const state = asRecord(payload.state);
  const status = asRecord(payload.status);
  return (
    asString(payload.state) ??
    asString(state.type) ??
    asString(state.name) ??
    asString(payload.status) ??
    asString(status.type) ??
    asString(status.name) ??
    "unknown"
  ).toLowerCase();
}

function unwrapBooleanValue(value: unknown, seen = new Set<unknown>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  const record = asRecord(value);
  for (const field of ["value", "boolean", "booleanValue", "boolean_value", "flag", "enabled", "active"]) {
    if (field in record) return unwrapBooleanValue(record[field], seen);
  }

  const data = asRecord(record.data);
  if (Object.keys(data).length > 0) return unwrapBooleanValue(data, seen);

  const attributes = asRecord(record.attributes);
  if (Object.keys(attributes).length > 0) return unwrapBooleanValue(attributes, seen);

  return value;
}

function booleanFrom(value: unknown): boolean | null {
  const unwrapped = unwrapBooleanValue(value);
  if (typeof unwrapped === "boolean") return unwrapped;
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) {
    if (unwrapped === 1) return true;
    if (unwrapped === 0) return false;
  }
  if (typeof unwrapped !== "string") return null;

  const normalized = unwrapped.trim().toLowerCase();
  if (["true", "1", "yes", "y", "blocked"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "unblocked", "not_blocked", "not blocked"].includes(normalized)) return false;
  return null;
}

function issueIsArchived(issue: Record<string, unknown>, now: Date): boolean {
  const archivedAt = toDate(issue.archivedAt ?? issue.archived_at);
  if (archivedAt !== null) return archivedAt.getTime() <= now.getTime();
  return ["archived", "isArchived", "is_archived"].some((field) => booleanFrom(issue[field]) === true);
}

function issueIsCompleted(issue: Record<string, unknown>, now: Date): boolean {
  const completedStateNames = ["done", "completed", "complete"];
  const stringState = asString(issue.state)?.toLowerCase();
  if (stringState && completedStateNames.includes(stringState)) return true;
  if (["completed", "complete", "done", "isCompleted", "is_completed"].some((field) => booleanFrom(issue[field]) === true)) {
    return true;
  }
  const state = asRecord(issue.state);
  const stateType = asString(state.type)?.toLowerCase();
  if (stateType === "completed") return true;
  const stateName = asString(state.name)?.toLowerCase();
  if (stateName && completedStateNames.includes(stateName)) return true;
  const completedAt = toDate(issue.completedAt ?? issue.completed_at);
  return completedAt !== null && completedAt.getTime() <= now.getTime();
}

function issueHasBlockedFlag(issue: Record<string, unknown>): boolean {
  return ["blocked", "isBlocked", "is_blocked"].some((field) => booleanFrom(issue[field]) === true);
}

function hasCollectionItems(value: unknown, seen = new Set<unknown>()): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  const record = asRecord(value);
  for (const field of ["count", "totalCount", "total_count", "length", "size"]) {
    const count = asNumber(record[field]);
    if (count !== null && count > 0) return true;
  }

  for (const field of ["nodes", "edges", "items", "records", "values", "data"]) {
    if (hasCollectionItems(record[field], seen)) return true;
  }

  return Boolean(asString(record.id) ?? asString(record.externalId) ?? asString(record.external_id));
}

function issueHasBlockingRelation(issue: Record<string, unknown>): boolean {
  const relations = asRecord(issue.relations);
  const relationships = asRecord(issue.relationships);
  return [
    issue.blockedBy,
    issue.blocked_by,
    issue.blockers,
    issue.blockerIssues,
    issue.blocker_issues,
    relations.blockedBy,
    relations.blocked_by,
    relations.blockers,
    relationships.blockedBy,
    relationships.blocked_by,
    relationships.blockers,
  ].some((value) => hasCollectionItems(value));
}

function issueIsBlocked(issue: Record<string, unknown>): boolean {
  const stringState = asString(issue.state)?.toLowerCase() ?? "";
  const state = asRecord(issue.state);
  const stateType = asString(state.type)?.toLowerCase() ?? "";
  const stateName = asString(state.name)?.toLowerCase() ?? "";
  return (
    stringState === "blocked" ||
    stateType === "blocked" ||
    stateName.includes("blocked") ||
    issueHasBlockedFlag(issue) ||
    issueHasBlockingRelation(issue)
  );
}

function recentThreshold(now: Date): Date {
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

function staleThreshold(now: Date): Date {
  return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
}

function firstDateAtOrBefore(now: Date, ...values: Array<Date | null>): Date | null {
  return values.find((date): date is Date => date !== null && date.getTime() <= now.getTime()) ?? null;
}

function projectIsRecentlyCompleted(
  payload: Record<string, unknown>,
  now: Date,
  fallbackTimestamp?: Date | null,
): boolean {
  if (normalizeState(payload) !== "completed") return false;
  const timestamp = firstDateAtOrBefore(
    now,
    toDate(payload.completedAt ?? payload.completed_at),
    toDate(payload.updatedAt ?? payload.updated_at),
    fallbackTimestamp ?? null,
  );
  return (timestamp?.getTime() ?? 0) >= recentThreshold(now).getTime();
}

function projectIsVisible(payload: Record<string, unknown>, now: Date, fallbackTimestamp?: Date | null): boolean {
  const state = normalizeState(payload);
  return ["planned", "started", "paused"].includes(state) || projectIsRecentlyCompleted(payload, now, fallbackTimestamp);
}

function projectTeams(payload: Record<string, unknown>): string[] {
  const teams = asArray(payload.teams);
  return teams
    .map((team) => {
      const teamRecord = asRecord(team);
      return asString(teamRecord.key) ?? asString(teamRecord.name);
    })
    .filter((team): team is string => Boolean(team));
}

function projectLeadName(payload: Record<string, unknown>): string | null {
  return asString(asRecord(payload.lead).name);
}

function aggregateIssueCountFrom(payload: Record<string, unknown>, ...fields: string[]): number {
  for (const field of fields) {
    const count = asNumber(payload[field]);
    if (count !== null) return count > 0 ? Math.floor(count) : 0;
  }
  return 0;
}

function clampCount(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

function countIssues(payload: Record<string, unknown>, now: Date): {
  totalIssueCount: number;
  completedIssueCount: number;
  blockedIssueCount: number;
} {
  const issues = asArray(payload.issues).map(projectPayloadView);
  if (issues.length === 0) {
    const totalIssueCount = aggregateIssueCountFrom(payload, "totalIssueCount", "total_issue_count");
    return {
      totalIssueCount,
      completedIssueCount: clampCount(
        aggregateIssueCountFrom(payload, "completedIssueCount", "completed_issue_count"),
        totalIssueCount,
      ),
      blockedIssueCount: clampCount(
        aggregateIssueCountFrom(payload, "blockedIssueCount", "blocked_issue_count"),
        totalIssueCount,
      ),
    };
  }

  const nonArchivedIssues = issues.filter((issue) => !issueIsArchived(issue, now));
  return {
    totalIssueCount: nonArchivedIssues.length,
    completedIssueCount: nonArchivedIssues.filter((issue) => issueIsCompleted(issue, now)).length,
    blockedIssueCount: nonArchivedIssues.filter(issueIsBlocked).length,
  };
}

function progressPct(input: { totalIssueCount: number; completedIssueCount: number }): number {
  if (input.totalIssueCount <= 0) return 0;
  return Math.round((input.completedIssueCount / input.totalIssueCount) * 10000) / 100;
}

function warningsFor(input: {
  payload: Record<string, unknown>;
  now: Date;
  fallbackTimestamp?: Date | null;
  progressPct: number;
  totalIssueCount: number;
  blockedIssueCount: number;
}): string[] {
  const warnings = new Set<string>();
  for (const warning of normalizedWarnings(input.payload.warnings)) {
    if (warning) warnings.add(warning);
  }

  if (input.totalIssueCount === 0) warnings.add("No linked issues.");

  if (targetDateIsInvalid(input.payload)) warnings.add("Target date is invalid.");

  const targetDate = toDate(targetDateValue(input.payload));
  if (targetDate && targetDate.getTime() < input.now.getTime() && input.progressPct < 100) {
    warnings.add("Target date has passed.");
  }

  const updatedAt = firstDateAtOrBefore(
    input.now,
    toDate(input.payload.updatedAt ?? input.payload.updated_at),
    input.fallbackTimestamp ?? null,
  );
  if (updatedAt && updatedAt.getTime() < staleThreshold(input.now).getTime() && input.progressPct < 100) {
    warnings.add("No Linear activity in the last 14 days.");
  }

  if (input.blockedIssueCount > 0) {
    warnings.add(`${input.blockedIssueCount} blocked ${input.blockedIssueCount === 1 ? "issue" : "issues"}.`);
  }

  return [...warnings];
}

function observableProjectUpdatedAt(
  payload: Record<string, unknown>,
  record: RawProjectRecord,
  now: Date,
): string | null {
  return toIso(
    firstDateAtOrBefore(
      now,
      toDate(payload.updatedAt ?? payload.updated_at),
      toDate(record.sourceUpdatedAt),
      toDate(record.updatedAt),
      toDate(record.sourceCreatedAt),
    ),
  );
}

function observableProjectCompletedAt(payload: Record<string, unknown>, now: Date): string | null {
  return toIso(
    firstDateAtOrBefore(
      now,
      toDate(payload.completedAt ?? payload.completed_at),
    ),
  );
}

function goalFromRawRecord(record: RawProjectRecord, now: Date, trackedProjectIds = new Set<string>()): CompanyGoalRow | null {
  const payload = projectPayloadView(record.payload);
  const recordTimestamp = toDate(record.sourceUpdatedAt) ?? toDate(record.updatedAt) ?? toDate(record.sourceCreatedAt);
  if (!projectIsVisible(payload, now, recordTimestamp)) return null;

  const state = normalizeState(payload);
  const issueCounts = countIssues(payload, now);
  const progress = progressPct(issueCounts);
  const warnings = warningsFor({
    payload,
    now,
    fallbackTimestamp: recordTimestamp,
    progressPct: progress,
    totalIssueCount: issueCounts.totalIssueCount,
    blockedIssueCount: issueCounts.blockedIssueCount,
  });
  const status: GoalStatus =
    state === "completed"
      ? "completed"
      : warnings.some((warning) => warning !== "No linked issues.")
        ? "at_risk"
        : "on_track";

  return {
    id: asString(payload.id) ?? record.id,
    name: asString(payload.name) ?? "Untitled Linear project",
    description: asString(payload.description),
    url: asString(payload.url),
    state,
    status,
    leadName: projectLeadName(payload),
    teamLabels: projectTeams(payload),
    targetDate: normalizedTargetDate(payload),
    updatedAt: observableProjectUpdatedAt(payload, record, now),
    completedAt: observableProjectCompletedAt(payload, now),
    progressPct: progress,
    completedIssueCount: issueCounts.completedIssueCount,
    totalIssueCount: issueCounts.totalIssueCount,
    blockedIssueCount: issueCounts.blockedIssueCount,
    trackingEnabled: trackedProjectIds.has(asString(payload.id) ?? record.id),
    warnings,
  };
}

function latestSyncAt(records: RawProjectRecord[], asOf: Date): string | null {
  const latest = records
    .map((record) =>
      firstDateAtOrBefore(
        asOf,
        toDate(record.updatedAt),
        toDate(record.sourceUpdatedAt),
        toDate(record.sourceCreatedAt),
      ),
    )
    .filter((date): date is Date => date !== null && date.getTime() <= asOf.getTime())
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return latest?.toISOString() ?? null;
}

export async function buildCompanyGoalsDashboard(input: {
  prisma: CompanyGoalsPrisma;
  context: UserContext;
  now?: Date;
}): Promise<CompanyGoalsDashboardData> {
  const now = input.now ?? new Date();
  const context = normalizedContext(input.context);
  const scopeKey = scopeKeyForContext(context);
  const [rawRecords, trackedRows] = await Promise.all([
    input.prisma.imladrisRawSourceRecord.findMany({
      where: {
        provider: IntegrationProvider.LINEAR,
        objectType: { in: PROJECT_OBJECT_TYPES },
        ...rawProjectScopeWhere(context),
      },
      orderBy: [{ sourceUpdatedAt: "desc" }, { updatedAt: "desc" }],
      take: 200,
    }),
    context.userId
      ? input.prisma.companyGoalTracking.findMany({
          where: {
            userId: context.userId,
            scopeKey,
            enabled: true,
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const typedTrackedRows = trackedRows as CompanyGoalTrackingRow[];
  const trackedProjectIds = new Set(typedTrackedRows.map((row) => row.linearProjectId));
  const trackedSortOrder = new Map(typedTrackedRows.map((row) => [row.linearProjectId, row.sortOrder]));
  const records = dedupeRawProjects(
    (rawRecords as RawProjectRecord[]).filter((record) =>
      rawProjectIsProvider(record, IntegrationProvider.LINEAR) && rawProjectIsProject(record),
    ),
    context,
    now,
  );
  const allGoals = records
    .map((record) => goalFromRawRecord(record, now, trackedProjectIds))
    .filter((goal): goal is CompanyGoalRow => Boolean(goal));
  const trackingConfigured = trackedProjectIds.size > 0;
  const goals = trackingConfigured
    ? allGoals
        .filter((goal) => trackedProjectIds.has(goal.id))
        .sort((left, right) => {
          const leftOrder = trackedSortOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = trackedSortOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder || left.name.localeCompare(right.name);
        })
    : allGoals;
  const activeGoals = goals.filter((goal) => goal.status !== "completed");
  const setupOptions = allGoals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    state: goal.state,
    tracked: trackedProjectIds.has(goal.id),
  }));

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalActiveGoals: activeGoals.length,
      onTrackGoals: activeGoals.filter((goal) => goal.status === "on_track").length,
      atRiskGoals: activeGoals.filter((goal) => goal.status === "at_risk").length,
      completedRecently: goals.filter((goal) => goal.status === "completed").length,
      latestSyncAt: latestSyncAt(records, now),
    },
    goals,
    trackingSetup: {
      configured: trackingConfigured,
      options: setupOptions,
    },
    emptyState:
      goals.length === 0
        ? {
            title: allGoals.length > 0 && trackingConfigured ? "No tracked goals selected" : "No Linear goals synced",
            description:
              allGoals.length > 0 && trackingConfigured
                ? "Choose at least one synced Linear project in Goal Setup to track it here."
                : "Connect Linear in Settings > Integrations or run the Linear sync to populate company goals.",
          }
        : null,
  };
}
