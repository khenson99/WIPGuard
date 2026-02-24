import type { PylonData } from "@/lib/analytics/types";
import {
  fetchPylonIssues,
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

function isWaitingOnTeam(issue: PylonIssue): boolean {
  const status = (getPylonIssueStatus(issue) ?? "").toLowerCase();
  return (
    status.includes("waiting_on_team") ||
    status.includes("pending_internal") ||
    status === "open"
  );
}

function isResolved(issue: PylonIssue): boolean {
  const status = (getPylonIssueStatus(issue) ?? "").toLowerCase();
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

export async function fetchPylonData(input: {
  apiKey: string;
  from: string;
  to: string;
  baseUrl?: string;
}): Promise<PylonData> {
  const baseUrl =
    input.baseUrl || process.env.PYLON_API_BASE_URL || "https://api.usepylon.com";

  const issues = await fetchPylonIssues({
    apiKey: input.apiKey,
    from: input.from,
    to: input.to,
    baseUrl,
    limit: 200,
    timeoutMs: 5_000,
  });

  const openConversations = issues.filter((issue) => !isResolved(issue)).length;
  const urgentConversations = issues.filter(
    (issue) => isUrgent(issue) && !isResolved(issue)
  ).length;
  const waitingOnTeam = issues.filter(
    (issue) => isWaitingOnTeam(issue) && !isResolved(issue)
  ).length;
  const resolvedInRange = issues.filter(isResolved).length;

  const firstResponseSamples = issues
    .map((issue) =>
      parseNumber(
        (issue as Record<string, unknown>).firstResponseMinutes ??
          (issue as Record<string, unknown>).first_response_minutes
      )
    )
    .filter((value): value is number => value !== null);

  const csatSamples = issues
    .map((issue) =>
      parseNumber(
        (issue as Record<string, unknown>).csat ??
          (issue as Record<string, unknown>).customerSatisfaction
      )
    )
    .filter((value): value is number => value !== null);

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
