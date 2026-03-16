import type { PylonData } from "@/lib/analytics/types";
import {
  fetchPylonIssues,
  getPylonIssueId,
  getPylonIssuePriority,
  getPylonIssueStatus,
  getPylonIssueTags,
  type PylonIssue,
} from "@/lib/integrations/pylon-client";

function nowMeta(source: "live" | "cached"): PylonData["_meta"] {
  const fetchedAt = new Date().toISOString();
  return {
    fetchedAt,
    nextRefresh: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    source,
  };
}

function isUrgent(issue: PylonIssue): boolean {
  const priority = (getPylonIssuePriority(issue) ?? "").toLowerCase();
  const tags = getPylonIssueTags(issue).map((tag) => tag.toLowerCase());
  return priority === "urgent" || priority === "high" || tags.includes("urgent");
}

function normalizePylonStatus(issue: PylonIssue): string {
  const raw = (getPylonIssueStatus(issue) ?? "").trim().toLowerCase();
  if (!raw) return "";

  const normalized = raw.replace(/[\s-]+/g, "_");
  if (normalized === "on_you") return "waiting_on_you";
  if (normalized === "on_customer") return "waiting_on_customer";
  return normalized;
}

function isWaitingOnTeam(issue: PylonIssue): boolean {
  const status = normalizePylonStatus(issue);
  return (
    status === "new" ||
    status === "waiting_on_you" ||
    status === "on_hold" ||
    status.includes("waiting_on_team") ||
    status.includes("pending_internal") ||
    status.includes("engineering") ||
    status.includes("internal")
  );
}

function isResolved(issue: PylonIssue): boolean {
  const status = normalizePylonStatus(issue);
  return status.includes("resolved") || status.includes("closed");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractFirstResponseMinutes(issue: PylonIssue): number | null {
  const record = issue as Record<string, unknown>;
  const directMinutes = parseNumber(
    record.firstResponseMinutes ?? record.first_response_minutes
  );
  if (directMinutes !== null) {
    return directMinutes;
  }

  const responseSeconds = parseNumber(
    record.first_response_seconds ?? record.business_hours_first_response_seconds
  );
  if (responseSeconds === null) {
    return null;
  }

  return Math.round((responseSeconds / 60) * 100) / 100;
}

function extractCsatScores(issue: PylonIssue): number[] {
  const record = issue as Record<string, unknown>;
  const direct = parseNumber(record.csat ?? record.customerSatisfaction);
  if (direct !== null) {
    return [direct];
  }

  const responses = record.csat_responses;
  if (!Array.isArray(responses)) {
    return [];
  }

  return responses
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      return parseNumber((entry as Record<string, unknown>).score);
    })
    .filter((score): score is number => score !== null);
}

function normalizePylonTimestamp(
  value: string | Date,
  boundary: "start" | "end",
): string {
  if (value instanceof Date) {
    const date = new Date(value.getTime());
    if (boundary === "start") {
      date.setUTCHours(0, 0, 0, 0);
    } else {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date.toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return boundary === "start"
      ? `${trimmed}T00:00:00.000Z`
      : `${trimmed}T23:59:59.999Z`;
  }

  return trimmed;
}

function buildPylonWindows(fromIso: string, toIso: string): Array<{ from: string; to: string }> {
  const startMs = Date.parse(fromIso);
  const endMs = Date.parse(toIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return [{ from: fromIso, to: toIso }];
  }

  const maxWindowMs = 30 * 24 * 60 * 60 * 1000 - 1;
  const windows: Array<{ from: string; to: string }> = [];
  let cursorMs = startMs;

  while (cursorMs <= endMs) {
    const windowEndMs = Math.min(cursorMs + maxWindowMs, endMs);
    windows.push({
      from: new Date(cursorMs).toISOString(),
      to: new Date(windowEndMs).toISOString(),
    });
    cursorMs = windowEndMs + 1;
  }

  return windows;
}

function dedupeIssues(issues: PylonIssue[]): PylonIssue[] {
  const byId = new Map<string, PylonIssue>();
  const withoutId: PylonIssue[] = [];

  for (const issue of issues) {
    const issueId = getPylonIssueId(issue);
    if (!issueId) {
      withoutId.push(issue);
      continue;
    }
    if (!byId.has(issueId)) {
      byId.set(issueId, issue);
    }
  }

  return [...byId.values(), ...withoutId];
}

export async function fetchPylonData(input: {
  apiKey: string;
  from: string | Date;
  to: string | Date;
  baseUrl?: string;
}): Promise<PylonData> {
  const baseUrl =
    input.baseUrl || process.env.PYLON_API_BASE_URL || "https://api.usepylon.com";
  const from = normalizePylonTimestamp(input.from, "start");
  const to = normalizePylonTimestamp(input.to, "end");
  const windows = buildPylonWindows(from, to);
  const batches = await Promise.all(
    windows.map((window) =>
      fetchPylonIssues({
        apiKey: input.apiKey,
        from: window.from,
        to: window.to,
        baseUrl,
        limit: 200,
        timeoutMs: 5_000,
      })
    )
  );
  const issues = dedupeIssues(batches.flat());

  const openConversations = issues.filter((issue) => !isResolved(issue)).length;
  const urgentConversations = issues.filter(
    (issue) => isUrgent(issue) && !isResolved(issue)
  ).length;
  const waitingOnTeam = issues.filter(
    (issue) => isWaitingOnTeam(issue) && !isResolved(issue)
  ).length;
  const resolvedInRange = issues.filter(isResolved).length;

  const firstResponseSamples = issues
    .map(extractFirstResponseMinutes)
    .filter((value): value is number => value !== null);

  const csatSamples = issues.flatMap(extractCsatScores);

  return {
    openConversations,
    urgentConversations,
    waitingOnTeam,
    resolvedInRange,
    avgFirstResponseMinutes:
      firstResponseSamples.length > 0
        ? Math.round(
            (firstResponseSamples.reduce((sum, value) => sum + value, 0) /
              firstResponseSamples.length) *
              100
          ) / 100
        : null,
    csat:
      csatSamples.length > 0
        ? Math.round(
            (csatSamples.reduce((sum, value) => sum + value, 0) / csatSamples.length) *
              100
          ) / 100
        : null,
    _meta: nowMeta("live"),
  };
}
