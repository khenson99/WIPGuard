import { IntegrationProvider } from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

type GoalStatus = "on_track" | "at_risk" | "completed";

interface UserContext {
  userId: string | null;
  organizationId: string | null;
}

interface RawProjectRecord {
  id: string;
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
  warnings: string[];
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
  emptyState: {
    title: string;
    description: string;
  } | null;
}

export type CompanyGoalsPrisma = Pick<PrismaClientType, "imladrisRawSourceRecord">;

const PROJECT_OBJECT_TYPES = ["project", "Project", "PROJECT"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const timestampMs = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
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

function normalizeObjectType(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
    : "";
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
  const payload = asRecord(record.payload);
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
  return (asString(payload.state) ?? asString(asRecord(payload.status).type) ?? "unknown").toLowerCase();
}

function issueIsArchived(issue: Record<string, unknown>): boolean {
  return Boolean(issue.archivedAt ?? issue.archived_at);
}

function issueIsCompleted(issue: Record<string, unknown>, now: Date): boolean {
  const state = asRecord(issue.state);
  if (asString(state.type)?.toLowerCase() === "completed") return true;
  const completedAt = toDate(issue.completedAt ?? issue.completed_at);
  return completedAt !== null && completedAt.getTime() <= now.getTime();
}

function issueIsBlocked(issue: Record<string, unknown>): boolean {
  const state = asRecord(issue.state);
  const stateType = asString(state.type)?.toLowerCase() ?? "";
  const stateName = asString(state.name)?.toLowerCase() ?? "";
  return stateType === "blocked" || stateName.includes("blocked");
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

function aggregateIssueCount(value: unknown): number {
  const count = asNumber(value);
  return count !== null && count > 0 ? Math.floor(count) : 0;
}

function clampCount(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

function countIssues(payload: Record<string, unknown>, now: Date): {
  totalIssueCount: number;
  completedIssueCount: number;
  blockedIssueCount: number;
} {
  const issues = asArray(payload.issues).map(asRecord);
  if (issues.length === 0) {
    const totalIssueCount = aggregateIssueCount(payload.totalIssueCount);
    return {
      totalIssueCount,
      completedIssueCount: clampCount(aggregateIssueCount(payload.completedIssueCount), totalIssueCount),
      blockedIssueCount: clampCount(aggregateIssueCount(payload.blockedIssueCount), totalIssueCount),
    };
  }

  const nonArchivedIssues = issues.filter((issue) => !issueIsArchived(issue));
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
  for (const warning of asArray(input.payload.warnings)) {
    const text = asString(warning);
    if (text) warnings.add(text);
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

function goalFromRawRecord(record: RawProjectRecord, now: Date): CompanyGoalRow | null {
  const payload = asRecord(record.payload);
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
    updatedAt: toIso(payload.updatedAt ?? payload.updated_at),
    completedAt: toIso(payload.completedAt ?? payload.completed_at),
    progressPct: progress,
    completedIssueCount: issueCounts.completedIssueCount,
    totalIssueCount: issueCounts.totalIssueCount,
    blockedIssueCount: issueCounts.blockedIssueCount,
    warnings,
  };
}

function latestSyncAt(records: RawProjectRecord[], asOf: Date): string | null {
  const latest = records
    .map((record) => toDate(record.updatedAt) ?? toDate(record.sourceUpdatedAt))
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
  const rawRecords = await input.prisma.imladrisRawSourceRecord.findMany({
    where: {
      provider: IntegrationProvider.LINEAR,
      objectType: { in: PROJECT_OBJECT_TYPES },
      ...rawProjectScopeWhere(context),
    },
    orderBy: [{ sourceUpdatedAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
  const records = dedupeRawProjects(
    (rawRecords as RawProjectRecord[]).filter(rawProjectIsProject),
    context,
    now,
  );
  const goals = records
    .map((record) => goalFromRawRecord(record, now))
    .filter((goal): goal is CompanyGoalRow => Boolean(goal));
  const activeGoals = goals.filter((goal) => goal.status !== "completed");

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
    emptyState:
      goals.length === 0
        ? {
            title: "No Linear goals synced",
            description: "Connect Linear in Settings > Integrations or run the Linear sync to populate company goals.",
          }
        : null,
  };
}
