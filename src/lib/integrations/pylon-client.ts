export type PylonIssue = Record<string, unknown>;

export interface PylonIssuesFetchResult {
  issues: PylonIssue[];
  truncated: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizePylonTimestamp(value: string, boundary: "start" | "end"): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  if (trimmed.includes("T")) return trimmed;
  return boundary === "start"
    ? `${trimmed}T00:00:00.000Z`
    : `${trimmed}T23:59:59.999Z`;
}

function splitPylonDateRange(input: {
  from: string;
  to: string;
  maxWindowDays?: number;
}): Array<{ from: string; to: string }> {
  const maxWindowDays = input.maxWindowDays ?? 30;
  const normalizedFrom = normalizePylonTimestamp(input.from, "start");
  const normalizedTo = normalizePylonTimestamp(input.to, "end");
  const start = new Date(normalizedFrom);
  const end = new Date(normalizedTo);

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() < start.getTime() ||
    maxWindowDays <= 0
  ) {
    return [{ from: normalizedFrom, to: normalizedTo }];
  }

  const maxWindowMs = maxWindowDays * 24 * 60 * 60 * 1000;
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = start.getTime();

  while (cursor <= end.getTime()) {
    const windowEnd = Math.min(end.getTime(), cursor + maxWindowMs - 1);
    windows.push({
      from: new Date(cursor).toISOString(),
      to: new Date(windowEnd).toISOString(),
    });
    cursor = windowEnd + 1;
  }

  return windows;
}

function parseIssueArray(payload: unknown): PylonIssue[] {
  const record = asRecord(payload);
  if (!record) return [];

  const candidates = [record.data, record.items, record.conversations];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item) => item && typeof item === "object") as PylonIssue[];
    }
  }
  return [];
}

function extractNextCursor(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;

  const direct =
    asString(record.next_cursor) ??
    asString(record.nextCursor) ??
    asString(record.cursor) ??
    asString(record.after);
  if (direct) return direct;

  const paging = asRecord(record.paging);
  const next = asRecord(paging?.next);
  return (
    asString(next?.cursor) ??
    asString(next?.after) ??
    asString(next?.next_cursor) ??
    asString(next?.nextCursor)
  );
}

async function fetchJsonWithTimeout(input: {
  url: string;
  apiKey: string;
  timeoutMs: number;
}): Promise<
  | { ok: true; payload: unknown }
  | { ok: false; status: number; message: string; fatal?: boolean }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.url, {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `Pylon request failed (${response.status})`,
      };
    }

    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid JSON";
      return {
        ok: false,
        status: response.status,
        message: `Pylon response parse failed (${response.status}): ${message}`,
        fatal: true,
      };
    }
    return { ok: true, payload };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Pylon request failed (unknown error)";
    return { ok: false, status: 0, message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPylonIssues(input: {
  apiKey: string;
  from: string;
  to: string;
  baseUrl?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<PylonIssue[]> {
  return (await fetchPylonIssuesResult(input)).issues;
}

export async function fetchPylonIssuesResult(input: {
  apiKey: string;
  from: string;
  to: string;
  baseUrl?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<PylonIssuesFetchResult> {
  const baseUrl = input.baseUrl || "https://api.usepylon.com";
  const limit = input.limit ?? 200;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const issuesById = new Map<string, PylonIssue>();
  const issuesWithoutId: PylonIssue[] = [];
  let truncated = false;

  for (const window of splitPylonDateRange({ from: input.from, to: input.to })) {
    const endpoints = [
      `${baseUrl}/issues`,
      `${baseUrl}/v1/issues`,
      // Some Pylon tenants expose the issues collection under conversations.
      `${baseUrl}/conversations`,
      `${baseUrl}/v1/conversations`,
    ];

    let lastError: { status: number; message: string } | null = null;
    let sawNotFound = false;
    let payload: PylonIssue[] | null = null;

    for (const endpoint of endpoints) {
      const endpointIssues: PylonIssue[] = [];
      let cursor: string | null = null;
      let endpointFailed = false;
      let endpointTruncated = false;

      for (let page = 0; page < 100; page += 1) {
        const query = new URLSearchParams({
          limit: String(limit),
          start_time: window.from,
          end_time: window.to,
        });
        if (cursor) query.set("cursor", cursor);

        const result = await fetchJsonWithTimeout({
          url: `${endpoint}?${query.toString()}`,
          apiKey: input.apiKey,
          timeoutMs,
        });
        if (!result.ok) {
          if (result.fatal) {
            throw new Error(result.message);
          }
          if (result.status === 404) {
            sawNotFound = true;
          } else {
            lastError = { status: result.status, message: result.message };
          }
          endpointFailed = true;
          break;
        }

        endpointIssues.push(...parseIssueArray(result.payload));
        const nextCursor = extractNextCursor(result.payload);
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
        if (page === 99) {
          endpointTruncated = true;
        }
      }

      if (endpointFailed) {
        continue;
      }

      if (endpointTruncated) {
        truncated = true;
      }
      payload = endpointIssues;
      break;
    }

    if (!payload) {
      if (sawNotFound && !lastError) {
        continue;
      }
      if (lastError) {
        throw new Error(lastError.message);
      }
      throw new Error("Pylon request failed");
    }

    for (const issue of payload) {
      const issueId = getPylonIssueId(issue);
      if (issueId) {
        issuesById.set(issueId, issue);
      } else {
        issuesWithoutId.push(issue);
      }
    }
  }

  return {
    issues: [...issuesById.values(), ...issuesWithoutId],
    truncated,
  };
}

export function getPylonIssueId(issue: PylonIssue): string | null {
  return (
    asString(issue.id) ??
    asString(issue.issueId) ??
    asString(issue.issue_id) ??
    asString(issue.externalId) ??
    asString(issue.external_id)
  );
}

export function getPylonIssueTitle(issue: PylonIssue): string | null {
  return (
    asString(issue.title) ??
    asString(issue.subject) ??
    asString(issue.name) ??
    asString(issue.summary)
  );
}

export function getPylonIssueStatus(issue: PylonIssue): string | null {
  return asString(issue.status) ?? asString(issue.state);
}

export function getPylonIssuePriority(issue: PylonIssue): string | null {
  return asString(issue.priority);
}

export function getPylonIssueTags(issue: PylonIssue): string[] {
  const tags = issue.tags;
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => {
        if (typeof tag === "string") return tag;
        const record = asRecord(tag);
        return record ? asString(record.name) ?? asString(record.id) : null;
      })
      .filter((tag): tag is string => Boolean(tag));
  }
  return [];
}

export function getPylonIssueUpdatedAt(issue: PylonIssue): string | null {
  return (
    asString(issue.updatedAt) ??
    asString(issue.updated_at) ??
    asString(issue.lastUpdatedAt) ??
    asString(issue.last_updated_at)
  );
}

export function getPylonIssueUrl(issue: PylonIssue): string | null {
  return (
    asString(issue.url) ??
    asString(issue.permalink) ??
    asString(issue.link) ??
    asString(issue.html_url)
  );
}

export const __test__ = {
  normalizePylonTimestamp,
  splitPylonDateRange,
};
