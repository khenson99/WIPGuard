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

  const query = new URLSearchParams({
    limit: String(limit),
    start_time: input.from,
    end_time: input.to,
  });

  const endpoints = [
    `${baseUrl}/issues?${query.toString()}`,
    `${baseUrl}/v1/issues?${query.toString()}`,
  ];

  let lastError: { status: number; message: string } | null = null;
  for (const url of endpoints) {
    const result = await fetchJsonWithTimeout({ url, apiKey: input.apiKey, timeoutMs });
    if (result.ok) {
      return parseIssueArray(result.payload);
    }
    lastError = { status: result.status, message: result.message };
  }

  if (lastError) {
    throw new Error(lastError.message);
  }
  throw new Error("Pylon request failed");
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

