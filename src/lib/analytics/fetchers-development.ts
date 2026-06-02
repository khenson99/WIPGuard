import { fetchWithResilience } from "@/lib/integrations/http-client";

type UnknownRecord = Record<string, unknown>;
const DEFAULT_MAX_PAGES = 100;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }
  return text ? JSON.parse(text) as unknown : null;
}

async function fetchJsonResponse(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithResilience({
    url,
    init,
    timeoutMs: 12_000,
    maxAttempts: 3,
  });
}

function normalizeMaxPages(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_PAGES;
  return Math.max(1, Math.floor(value));
}

function normalizePostHogHost(host: string | null | undefined): string {
  const trimmed = host?.trim().replace(/\/+$/g, "");
  return trimmed || "https://app.posthog.com";
}

export async function fetchPostHogData(input: {
  apiKey: string;
  projectId: string;
  host?: string | null;
  fromDate: Date;
  toDate: Date;
  maxPages?: number;
}): Promise<UnknownRecord> {
  const host = normalizePostHogHost(input.host);
  const params = new URLSearchParams({
    after: toDateKey(input.fromDate),
    before: toDateKey(input.toDate),
    limit: "1000",
  });
  const events: unknown[] = [];
  const maxPages = normalizeMaxPages(input.maxPages);
  let pageCount = 0;
  let nextUrl: string | null =
    `${host}/api/projects/${encodeURIComponent(input.projectId)}/events?${params.toString()}`;

  while (nextUrl && pageCount < maxPages) {
    pageCount += 1;
    const response = await fetchJsonResponse(nextUrl, {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      cache: "no-store",
    });
    const payload = asRecord(await readJson(response));
    events.push(...asArray(payload.results));
    nextUrl = asString(payload.next);
  }

  return {
    events,
    eventCount: events.length,
    _meta: {
      fetchedAt: new Date().toISOString(),
      source: "live",
      pageCount,
      truncated: Boolean(nextUrl),
    },
  };
}

export async function fetchLinearData(input: {
  apiKey: string;
  fromDate: Date;
  toDate: Date;
  maxPages?: number;
}): Promise<UnknownRecord> {
  const issues: unknown[] = [];
  const maxPages = normalizeMaxPages(input.maxPages);
  let pageCount = 0;
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && pageCount < maxPages) {
    pageCount += 1;
    const response = await fetchJsonResponse("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: input.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query ImladrisIssues($updatedAfter: DateTime!, $updatedBefore: DateTime!, $after: String) {
            issues(
              first: 100
              after: $after
              filter: { updatedAt: { gte: $updatedAfter, lte: $updatedBefore } }
              orderBy: updatedAt
            ) {
              nodes {
                id
                identifier
                title
                createdAt
                updatedAt
                completedAt
                state { id name type }
                team { id key name }
                assignee { id name email }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        variables: {
          updatedAfter: input.fromDate.toISOString(),
          updatedBefore: input.toDate.toISOString(),
          after,
        },
      }),
      cache: "no-store",
    });
    const payload = asRecord(await readJson(response));
    const errors = asArray(payload.errors);
    if (errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(errors.slice(0, 3))}`);
    }
    const issuesPayload = asRecord(asRecord(payload.data).issues);
    issues.push(...asArray(issuesPayload.nodes));
    const pageInfo = asRecord(issuesPayload.pageInfo);
    hasNextPage = asBoolean(pageInfo.hasNextPage);
    after = asString(pageInfo.endCursor);
    if (hasNextPage && !after) break;
  }

  return {
    issues,
    issueCount: issues.length,
    _meta: {
      fetchedAt: new Date().toISOString(),
      source: "live",
      pageCount,
      truncated: hasNextPage,
    },
  };
}

export async function fetchGitHubData(input: {
  token: string;
  owner: string;
  repo: string;
  fromDate: Date;
  toDate: Date;
  maxPages?: number;
}): Promise<UnknownRecord> {
  const maxPages = normalizeMaxPages(input.maxPages);
  const pageSize = 100;
  const maxSearchPages = Math.min(maxPages, 10);
  const pullRequestsPayload: unknown[] = [];
  let pageCount = 0;
  let totalCount: number | null = null;
  let incompleteResults = false;
  let hasMorePages = true;

  while (hasMorePages && pageCount < maxSearchPages) {
    pageCount += 1;
    const params = new URLSearchParams({
      q: `repo:${input.owner}/${input.repo} is:pr updated:${toDateKey(input.fromDate)}..${toDateKey(input.toDate)}`,
      sort: "updated",
      order: "desc",
      per_page: String(pageSize),
      page: String(pageCount),
    });
    const response = await fetchJsonResponse(`https://api.github.com/search/issues?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    const payload = asRecord(await readJson(response));
    const items = asArray(payload.items);
    pullRequestsPayload.push(...items);
    totalCount = typeof payload.total_count === "number" && Number.isFinite(payload.total_count)
      ? payload.total_count
      : totalCount;
    incompleteResults = incompleteResults || payload.incomplete_results === true;
    hasMorePages = items.length === pageSize && (totalCount === null || pullRequestsPayload.length < totalCount);
  }

  const pullRequests = pullRequestsPayload
    .map(asRecord)
    .filter((pullRequest) => {
      const updatedAt = new Date(String(pullRequest.updated_at ?? pullRequest.updatedAt ?? ""));
      return (
        !Number.isNaN(updatedAt.getTime()) &&
        updatedAt >= input.fromDate &&
        updatedAt <= input.toDate
      );
    })
    .map((pullRequest) => ({
      ...pullRequest,
      merged: Boolean(
        pullRequest.merged_at ??
          pullRequest.mergedAt ??
          asRecord(pullRequest.pull_request).merged_at ??
          asRecord(pullRequest.pull_request).mergedAt,
      ),
    }));
  const searchResultCapReached =
    totalCount !== null && totalCount > pageSize * maxSearchPages;

  return {
    pullRequests,
    pullRequestCount: pullRequests.length,
    _meta: {
      fetchedAt: new Date().toISOString(),
      source: "live",
      pageCount,
      totalCount,
      incompleteResults,
      truncated: incompleteResults || hasMorePages || searchResultCapReached,
    },
  };
}
