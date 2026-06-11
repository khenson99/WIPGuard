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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function normalizeEventKey(value: unknown): string {
  const eventName = asString(value);
  return eventName ? eventName.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
}

const POSTHOG_PAGEVIEW_EVENT_KEYS = new Set([
  "$pageview",
  "pageview",
  "pageviewed",
  "viewedpage",
]);

const POSTHOG_MARKETING_CONVERSION_EVENT_KEYS = new Set([
  "bookdemo",
  "contactformsubmitted",
  "conversion",
  "demobooked",
  "demorequested",
  "formsubmission",
  "formsubmitted",
  "leadconverted",
  "leadcreated",
  "requestdemo",
  "signup",
  "signedup",
  "trialstarted",
]);

function summarizePostHogEvents(events: unknown[]): {
  pageviewCount: number;
  conversionEventCount: number;
  eventNameCounts: Record<string, number>;
} {
  const eventNameCounts: Record<string, number> = {};
  let pageviewCount = 0;
  let conversionEventCount = 0;

  for (const event of events) {
    const key = normalizeEventKey(asRecord(event).event);
    if (!key) continue;
    eventNameCounts[key] = (eventNameCounts[key] ?? 0) + 1;
    if (POSTHOG_PAGEVIEW_EVENT_KEYS.has(key)) pageviewCount += 1;
    if (POSTHOG_MARKETING_CONVERSION_EVENT_KEYS.has(key)) conversionEventCount += 1;
  }

  return { pageviewCount, conversionEventCount, eventNameCounts };
}

function isoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function dateValue(value: unknown): Date | null {
  const iso = isoDate(value);
  return iso ? new Date(iso) : null;
}

function normalizedProjectState(project: UnknownRecord): string {
  const directState = asString(project.state);
  if (directState) return directState.toLowerCase();
  const status = asRecord(project.status);
  return (asString(status.type) ?? asString(status.name) ?? "unknown").toLowerCase();
}

function issueIsArchived(issue: UnknownRecord): boolean {
  return Boolean(issue.archivedAt ?? issue.archived_at);
}

function issueIsCompleted(issue: UnknownRecord): boolean {
  const state = asRecord(issue.state);
  return Boolean(issue.completedAt ?? issue.completed_at) || asString(state.type)?.toLowerCase() === "completed";
}

function normalizeLinearIssue(issue: unknown): UnknownRecord {
  const record = asRecord(issue);
  return {
    id: asString(record.id),
    identifier: asString(record.identifier),
    title: asString(record.title),
    archivedAt: isoDate(record.archivedAt ?? record.archived_at),
    completedAt: isoDate(record.completedAt ?? record.completed_at),
    updatedAt: isoDate(record.updatedAt ?? record.updated_at),
    estimate: asNumber(record.estimate),
    state: asRecord(record.state),
    team: asRecord(record.team),
    assignee: record.assignee === null ? null : asRecord(record.assignee),
  };
}

function projectIsRecentlyCompleted(project: UnknownRecord, recentThreshold: Date): boolean {
  if (normalizedProjectState(project) !== "completed") return false;
  const completedAt = dateValue(project.completedAt ?? project.completed_at);
  const updatedAt = dateValue(project.updatedAt ?? project.updated_at);
  const completedTimestamp = completedAt?.getTime() ?? updatedAt?.getTime() ?? 0;
  return completedTimestamp >= recentThreshold.getTime();
}

function shouldIncludeProject(project: UnknownRecord, recentThreshold: Date): boolean {
  const state = normalizedProjectState(project);
  return ["planned", "started", "paused"].includes(state) || projectIsRecentlyCompleted(project, recentThreshold);
}

function normalizeLinearProject(project: unknown, issues: UnknownRecord[], recentThreshold: Date): UnknownRecord | null {
  const record = asRecord(project);
  if (!shouldIncludeProject(record, recentThreshold)) return null;

  const nonArchivedIssues = issues.filter((issue) => !issueIsArchived(issue));
  const completedIssueCount = nonArchivedIssues.filter(issueIsCompleted).length;
  const totalIssueCount = nonArchivedIssues.length;
  const archivedIssueCount = issues.length - nonArchivedIssues.length;
  const progressPct =
    totalIssueCount === 0
      ? 0
      : Math.round((completedIssueCount / totalIssueCount) * 10000) / 100;
  const teamsPayload = asRecord(record.teams);
  const warnings = totalIssueCount === 0 ? ["No linked issues."] : [];

  return {
    ...record,
    id: asString(record.id),
    name: asString(record.name),
    description: asString(record.description),
    url: asString(record.url),
    state: normalizedProjectState(record),
    startDate: asString(record.startDate ?? record.start_date),
    targetDate: asString(record.targetDate ?? record.target_date),
    createdAt: isoDate(record.createdAt ?? record.created_at),
    updatedAt: isoDate(record.updatedAt ?? record.updated_at),
    completedAt: isoDate(record.completedAt ?? record.completed_at),
    lead: record.lead === null ? null : asRecord(record.lead),
    teams: asArray(teamsPayload.nodes).map(asRecord),
    issues,
    completedIssueCount,
    totalIssueCount,
    archivedIssueCount,
    progressPct,
    warnings,
  };
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

  const eventSummary = summarizePostHogEvents(events);

  return {
    events,
    eventCount: events.length,
    ...eventSummary,
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
  const projects: UnknownRecord[] = [];
  const maxPages = normalizeMaxPages(input.maxPages);
  let pageCount = 0;
  let issuePageCount = 0;
  let projectPageCount = 0;
  let after: string | null = null;
  let projectAfter: string | null = null;
  let issueHasNextPage = true;
  let projectHasNextPage = true;
  let projectFieldObserved = false;
  let truncated = false;
  const recentCompletedThreshold = new Date(input.toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  while ((issueHasNextPage || projectHasNextPage) && pageCount < maxPages) {
    pageCount += 1;
    const includeIssues = issueHasNextPage;
    const includeProjects = projectHasNextPage;
    const response = await fetchJsonResponse("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: input.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query ImladrisLinear(
            $updatedAfter: DateTimeOrDuration!
            $updatedBefore: DateTimeOrDuration!
            $after: String
            $projectAfter: String
            $includeIssues: Boolean!
            $includeProjects: Boolean!
          ) {
            issues(
              first: 100
              after: $after
              filter: { updatedAt: { gte: $updatedAfter, lte: $updatedBefore } }
              orderBy: updatedAt
            ) @include(if: $includeIssues) {
              nodes {
                id
                identifier
                title
                createdAt
                updatedAt
                completedAt
                archivedAt
                estimate
                state { id name type }
                team { id key name }
                assignee { id name email }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
            # Page sizes are complexity-bounded: Linear caps query complexity
            # at 10,000 and the original projects(first: 50) x issues(first: 100)
            # shape scored ~37,578 ("Query too complex"). projects(20) with
            # nested issues(25) measures comfortably under the cap; deeper
            # projects continue via $projectAfter and the ImladrisProjectIssues
            # follow-up pagination, so nothing is truncated.
            projects(
              first: 20
              after: $projectAfter
              includeArchived: false
              orderBy: updatedAt
            ) @include(if: $includeProjects) {
              nodes {
                id
                name
                description
                url
                progress
                state
                startDate
                targetDate
                createdAt
                updatedAt
                completedAt
                lead { id name email }
                teams { nodes { id key name } }
                issues(first: 25) {
                  nodes {
                    id
                    identifier
                    title
                    archivedAt
                    completedAt
                    updatedAt
                    estimate
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
          projectAfter,
          includeIssues,
          includeProjects,
        },
      }),
      cache: "no-store",
    });
    const payload = asRecord(await readJson(response));
    const errors = asArray(payload.errors);
    if (errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(errors.slice(0, 3))}`);
    }
    const data = asRecord(payload.data);
    if (includeIssues && "issues" in data) {
      const issuesPayload = asRecord(data.issues);
      issues.push(...asArray(issuesPayload.nodes));
      issuePageCount += 1;
      const pageInfo = asRecord(issuesPayload.pageInfo);
      issueHasNextPage = asBoolean(pageInfo.hasNextPage);
      after = asString(pageInfo.endCursor);
      if (issueHasNextPage && !after) {
        truncated = true;
        issueHasNextPage = false;
      }
    } else {
      issueHasNextPage = false;
    }

    if (includeProjects && "projects" in data) {
      projectFieldObserved = true;
      const projectsPayload = asRecord(data.projects);
      projectPageCount += 1;
      for (const project of asArray(projectsPayload.nodes)) {
        const projectRecord = asRecord(project);
        const initialIssuesPayload = asRecord(projectRecord.issues);
        const projectIssues = asArray(initialIssuesPayload.nodes).map(normalizeLinearIssue);
        let issueAfter = asString(asRecord(initialIssuesPayload.pageInfo).endCursor);
        let hasMoreProjectIssues = asBoolean(asRecord(initialIssuesPayload.pageInfo).hasNextPage);
        while (hasMoreProjectIssues && pageCount + issuePageCount < maxPages) {
          issuePageCount += 1;
          const issueResponse = await fetchJsonResponse("https://api.linear.app/graphql", {
            method: "POST",
            headers: {
              Authorization: input.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `
                query ImladrisProjectIssues($projectId: String!, $after: String) {
                  project(id: $projectId) {
                    issues(first: 100, after: $after) {
                      nodes {
                        id
                        identifier
                        title
                        archivedAt
                        completedAt
                        updatedAt
                        estimate
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
                }
              `,
              variables: {
                projectId: asString(projectRecord.id),
                after: issueAfter,
              },
            }),
            cache: "no-store",
          });
          const issuePayload = asRecord(await readJson(issueResponse));
          const issueErrors = asArray(issuePayload.errors);
          if (issueErrors.length > 0) {
            throw new Error(`Linear GraphQL error: ${JSON.stringify(issueErrors.slice(0, 3))}`);
          }
          const nextIssuesPayload = asRecord(asRecord(asRecord(issuePayload.data).project).issues);
          projectIssues.push(...asArray(nextIssuesPayload.nodes).map(normalizeLinearIssue));
          const issuePageInfo = asRecord(nextIssuesPayload.pageInfo);
          hasMoreProjectIssues = asBoolean(issuePageInfo.hasNextPage);
          issueAfter = asString(issuePageInfo.endCursor);
          if (hasMoreProjectIssues && !issueAfter) {
            truncated = true;
            hasMoreProjectIssues = false;
          }
        }
        if (hasMoreProjectIssues) truncated = true;
        const normalizedProject = normalizeLinearProject(projectRecord, projectIssues, recentCompletedThreshold);
        if (normalizedProject) projects.push(normalizedProject);
      }
      const pageInfo = asRecord(projectsPayload.pageInfo);
      projectHasNextPage = asBoolean(pageInfo.hasNextPage);
      projectAfter = asString(pageInfo.endCursor);
      if (projectHasNextPage && !projectAfter) {
        truncated = true;
        projectHasNextPage = false;
      }
    } else {
      projectHasNextPage = false;
    }
  }
  if (issueHasNextPage || projectHasNextPage) truncated = true;

  return {
    issues,
    issueCount: issues.length,
    ...(projectFieldObserved
      ? {
          projects,
          projectCount: projects.length,
        }
      : {}),
    _meta: {
      fetchedAt: new Date().toISOString(),
      source: "live",
      pageCount,
      issuePageCount,
      projectPageCount,
      truncated,
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
