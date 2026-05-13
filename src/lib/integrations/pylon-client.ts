export type PylonIssue = Record<string, unknown>;

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

function asNamedString(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;

  const record = asRecord(value);
  if (!record) return null;

  return (
    asString(record.name) ??
    asString(record.label) ??
    asString(record.value) ??
    asString(record.key) ??
    asString(record.id)
  );
}

function parseIssueArray(payload: unknown): PylonIssue[] {
  const visited = new Set<unknown>();

  function visit(value: unknown): PylonIssue[] {
    if (!value || visited.has(value)) return [];
    if (Array.isArray(value)) {
      return value.filter((item) => item && typeof item === "object") as PylonIssue[];
    }

    const record = asRecord(value);
    if (!record) return [];
    visited.add(value);

    const directCandidates = [
      record.data,
      record.items,
      record.conversations,
      record.results,
      record.records,
      record.edges,
      record.nodes,
    ];

    for (const candidate of directCandidates) {
      const parsed = visit(candidate);
      if (parsed.length > 0) return parsed;
    }

    return [];
  }

  return visit(payload);
}

function parsePagination(payload: unknown): { cursor: string | null; hasNextPage: boolean } {
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const cursor = asString(pagination?.cursor) ?? asString(record?.next_cursor);
  const hasNextPage =
    pagination?.has_next_page === true ||
    pagination?.hasNextPage === true ||
    record?.has_next_page === true ||
    record?.hasNextPage === true;

  return { cursor, hasNextPage };
}

async function fetchJsonWithTimeout(input: {
  url: string;
  apiKey: string;
  timeoutMs: number;
}): Promise<{ ok: true; payload: unknown } | { ok: false; status: number; message: string }> {
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

    const payload = (await response.json()) as unknown;
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
  const baseUrl = input.baseUrl || "https://api.usepylon.com";
  const limit = input.limit ?? 200;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const issuesById = new Map<string, PylonIssue>();
  const issuesWithoutId: PylonIssue[] = [];

  for (const window of splitPylonDateRange({ from: input.from, to: input.to })) {
    const query = new URLSearchParams({
      limit: String(limit),
      start_time: window.from,
      end_time: window.to,
    });

    const endpoints = [
      `${baseUrl}/issues?${query.toString()}`,
      `${baseUrl}/v1/issues?${query.toString()}`,
      // Some Pylon tenants expose the issues collection under conversations.
      `${baseUrl}/conversations?${query.toString()}`,
      `${baseUrl}/v1/conversations?${query.toString()}`,
    ];

    let lastError: { status: number; message: string } | null = null;
    let sawNotFound = false;
    let payload: PylonIssue[] | null = null;
    for (const url of endpoints) {
      const endpointPayload: PylonIssue[] = [];
      let cursor: string | null = null;

      for (let page = 0; page < 100; page += 1) {
        const pageUrl = new URL(url);
        if (cursor) pageUrl.searchParams.set("cursor", cursor);
        const result = await fetchJsonWithTimeout({ url: pageUrl.toString(), apiKey: input.apiKey, timeoutMs });
        if (!result.ok) {
          if (result.status === 404) {
            sawNotFound = true;
            endpointPayload.length = 0;
            break;
          }
          lastError = { status: result.status, message: result.message };
          endpointPayload.length = 0;
          break;
        }

        endpointPayload.push(...parseIssueArray(result.payload));
        const pagination = parsePagination(result.payload);
        if (!pagination.hasNextPage || !pagination.cursor) {
          payload = endpointPayload;
          break;
        }
        cursor = pagination.cursor;
      }

      if (payload) break;
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

  return [...issuesById.values(), ...issuesWithoutId];
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
  return (
    asNamedString(issue.status) ??
    asNamedString(issue.state) ??
    asNamedString(issue.workflowStatus) ??
    asNamedString(issue.workflow_status)
  );
}

export function getPylonIssuePriority(issue: PylonIssue): string | null {
  return (
    asNamedString(issue.priority) ??
    asNamedString(issue.severity)
  );
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
