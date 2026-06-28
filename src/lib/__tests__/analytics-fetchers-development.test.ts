import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGitHubData,
  fetchLinearData,
  fetchPostHogData,
} from "@/lib/analytics/fetchers-development";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("development analytics fetchers", () => {
  // The PostHog fetcher issues two HogQL queries against /api/projects/:id/query/
  // — an aggregate "GROUP BY event" count and a bounded recent-events sample.
  function hogqlBody(req: RequestInit | undefined): string {
    return typeof req?.body === "string" ? req.body : "";
  }

  it("aggregates PostHog event counts via the HogQL query API and keeps a bounded sample", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, req?: RequestInit) => {
      if (hogqlBody(req).includes("GROUP BY event")) {
        return jsonResponse({
          columns: ["event", "count"],
          results: [["$pageview", 5], ["demo_booked", 2], ["feature_clicked", 9]],
        });
      }
      return jsonResponse({
        columns: ["uuid", "event", "timestamp", "distinct_id"],
        results: [["evt-1", "$pageview", "2026-05-30 12:00:00", "person-1"]],
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchPostHogData({
      apiKey: "phx_token",
      projectId: "project_1",
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/project_1/query/"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer phx_token" }),
      }),
    );
    // Aggregate totals are complete for the window (not bounded by the sample).
    expect(data.eventCount).toBe(16);
    expect(data.events).toEqual([
      { id: "evt-1", uuid: "evt-1", event: "$pageview", timestamp: "2026-05-30 12:00:00", distinct_id: "person-1" },
    ]);
    expect(data._meta).toEqual(expect.objectContaining({
      queryMode: "hogql",
      truncated: false,
      sampleSize: 1,
      totalEvents: 16,
    }));
  });

  it("classifies aggregated pageview and conversion counts for downstream Imladris metrics", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, req?: RequestInit) => {
      if (hogqlBody(req).includes("GROUP BY event")) {
        return jsonResponse({
          columns: ["event", "count"],
          results: [
            ["$pageview", 3],
            ["page_view", 1],
            ["demo_booked", 2],
            ["trial_started", 4],
            ["feature_clicked", 7],
          ],
        });
      }
      return jsonResponse({ columns: ["uuid", "event", "timestamp", "distinct_id"], results: [] });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchPostHogData({
      apiKey: "phx_token",
      projectId: "project_1",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(data).toEqual(expect.objectContaining({
      pageviewCount: 4,
      conversionEventCount: 6,
      eventNameCounts: {
        "$pageview": 3,
        pageview: 1,
        demobooked: 2,
        trialstarted: 4,
        featureclicked: 7,
      },
    }));
  });

  it("follows Linear issue cursors across all pages in the requested update window", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          issues: {
            nodes: [{ id: "issue_1", identifier: "ENG-1", updatedAt: "2026-05-30T00:00:00.000Z" }],
            pageInfo: { hasNextPage: true, endCursor: "cursor_2" },
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          issues: {
            nodes: [{ id: "issue_2", identifier: "ENG-2", updatedAt: "2026-05-31T00:00:00.000Z" }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchLinearData({
      apiKey: "lin_api_key",
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(expect.objectContaining({
      variables: expect.objectContaining({ after: "cursor_2" }),
    }));
    expect(data.issues).toEqual([
      { id: "issue_1", identifier: "ENG-1", updatedAt: "2026-05-30T00:00:00.000Z" },
      { id: "issue_2", identifier: "ENG-2", updatedAt: "2026-05-31T00:00:00.000Z" },
    ]);
    expect(data.issueCount).toBe(2);
    expect(data._meta).toEqual(expect.objectContaining({
      pageCount: 2,
      truncated: false,
    }));
  });

  it("marks Linear payloads truncated when the provider has more pages but omits the cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        issues: {
          nodes: [{ id: "issue_1", identifier: "ENG-1", updatedAt: "2026-05-30T00:00:00.000Z" }],
          pageInfo: { hasNextPage: true, endCursor: null },
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchLinearData({
      apiKey: "lin_api_key",
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.issues).toEqual([
      { id: "issue_1", identifier: "ENG-1", updatedAt: "2026-05-30T00:00:00.000Z" },
    ]);
    expect(data._meta).toEqual(expect.objectContaining({
      pageCount: 1,
      truncated: true,
    }));
  });

  it("fetches Linear projects as company goals and computes issue-count progress", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          projects: {
            nodes: [
              {
                id: "project_1",
                name: "Launch self-serve onboarding",
                description: "Ship the onboarding project.",
                url: "https://linear.app/acme/project/self-serve-onboarding",
                progress: 0.5,
                state: "started",
                startDate: "2026-05-01",
                targetDate: "2026-06-30",
                createdAt: "2026-04-20T00:00:00.000Z",
                updatedAt: "2026-05-31T00:00:00.000Z",
                completedAt: null,
                lead: { id: "user_1", name: "Ada Lovelace", email: "ada@example.com" },
                teams: {
                  nodes: [{ id: "team_1", key: "ENG", name: "Engineering" }],
                },
                issues: {
                  nodes: [
                    {
                      id: "issue_1",
                      identifier: "ENG-1",
                      title: "Design onboarding checklist",
                      archivedAt: null,
                      completedAt: "2026-05-20T00:00:00.000Z",
                      updatedAt: "2026-05-20T00:00:00.000Z",
                      estimate: 2,
                      state: { id: "state_1", name: "Done", type: "completed" },
                      team: { id: "team_1", key: "ENG", name: "Engineering" },
                      assignee: { id: "user_1", name: "Ada Lovelace", email: "ada@example.com" },
                    },
                    {
                      id: "issue_2",
                      identifier: "ENG-2",
                      title: "Instrument activation event",
                      archivedAt: null,
                      completedAt: null,
                      updatedAt: "2026-05-28T00:00:00.000Z",
                      estimate: 3,
                      state: { id: "state_2", name: "In Progress", type: "started" },
                      team: { id: "team_1", key: "ENG", name: "Engineering" },
                      assignee: null,
                    },
                    {
                      id: "issue_3",
                      identifier: "ENG-3",
                      title: "Archived implementation note",
                      archivedAt: "2026-05-29T00:00:00.000Z",
                      completedAt: null,
                      updatedAt: "2026-05-29T00:00:00.000Z",
                      estimate: 1,
                      state: { id: "state_3", name: "Canceled", type: "canceled" },
                      team: { id: "team_1", key: "ENG", name: "Engineering" },
                      assignee: null,
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: "issue_cursor_2" },
                },
              },
              {
                id: "project_2",
                name: "Recently completed reporting",
                url: "https://linear.app/acme/project/reporting",
                progress: 1,
                state: "completed",
                startDate: "2026-04-01",
                targetDate: "2026-05-15",
                createdAt: "2026-04-01T00:00:00.000Z",
                updatedAt: "2026-05-22T00:00:00.000Z",
                completedAt: "2026-05-22T00:00:00.000Z",
                lead: null,
                teams: { nodes: [] },
                issues: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
              {
                id: "project_3",
                name: "Canceled migration",
                url: "https://linear.app/acme/project/canceled",
                state: "canceled",
                updatedAt: "2026-05-31T00:00:00.000Z",
                teams: { nodes: [] },
                issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          project: {
            issues: {
              nodes: [
                {
                  id: "issue_4",
                  identifier: "ENG-4",
                  title: "QA activation event",
                  archivedAt: null,
                  completedAt: "2026-05-30T00:00:00.000Z",
                  updatedAt: "2026-05-30T00:00:00.000Z",
                  estimate: 1,
                  state: { id: "state_1", name: "Done", type: "completed" },
                  team: { id: "team_1", key: "ENG", name: "Engineering" },
                  assignee: { id: "user_2", name: "Grace Hopper", email: "grace@example.com" },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchLinearData({
      apiKey: "lin_api_key",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(expect.objectContaining({
      variables: expect.objectContaining({
        projectId: "project_1",
        after: "issue_cursor_2",
      }),
    }));
    expect(data.projects).toEqual([
      expect.objectContaining({
        id: "project_1",
        name: "Launch self-serve onboarding",
        state: "started",
        completedIssueCount: 2,
        totalIssueCount: 3,
        archivedIssueCount: 1,
        progressPct: 66.67,
        issues: expect.arrayContaining([
          expect.objectContaining({ identifier: "ENG-1", state: expect.objectContaining({ type: "completed" }) }),
          expect.objectContaining({ identifier: "ENG-4", state: expect.objectContaining({ type: "completed" }) }),
        ]),
      }),
      expect.objectContaining({
        id: "project_2",
        state: "completed",
        completedIssueCount: 0,
        totalIssueCount: 0,
        progressPct: 0,
        warnings: ["No linked issues."],
      }),
    ]);
    expect(data.projects).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "project_3" }),
    ]));
    expect(data.projectCount).toBe(2);
    expect(data._meta).toEqual(expect.objectContaining({
      projectPageCount: 1,
      issuePageCount: 1,
      truncated: false,
    }));
  });

  it("marks Linear project sync truncated when project pages exceed the max page budget", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        projects: {
          nodes: [
            {
              id: "project_1",
              name: "Started project",
              state: "started",
              updatedAt: "2026-05-31T00:00:00.000Z",
              teams: { nodes: [] },
              issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: "project_cursor_2" },
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchLinearData({
      apiKey: "lin_api_key",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      maxPages: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.projects).toEqual([
      expect.objectContaining({ id: "project_1" }),
    ]);
    expect(data._meta).toEqual(expect.objectContaining({
      projectPageCount: 1,
      truncated: true,
    }));
  });

  it("surfaces Linear GraphQL errors before reading project payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      errors: [{ message: "Cannot query field projects" }],
      data: null,
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(fetchLinearData({
      apiKey: "lin_api_key",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    })).rejects.toThrow(/Linear GraphQL error/);
  });

  it("follows GitHub search pagination within the requested update window", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      html_url: `https://github.com/acme/app/pull/${index + 1}`,
      updated_at: "2026-05-31T12:00:00.000Z",
      pull_request: { merged_at: index === 0 ? "2026-05-31T13:00:00.000Z" : null },
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        total_count: 101,
        incomplete_results: false,
        items: firstPageItems,
      }))
      .mockResolvedValueOnce(jsonResponse({
        total_count: 101,
        incomplete_results: false,
        items: [
          {
            id: 101,
            html_url: "https://github.com/acme/app/pull/101",
            updated_at: "2026-05-30T12:00:00.000Z",
            pull_request: { merged_at: null },
          },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGitHubData({
      token: "ghp_token",
      owner: "acme",
      repo: "app",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("page")).toBe("1");
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("page")).toBe("2");
    const pullRequests = data.pullRequests as Array<Record<string, unknown>>;
    expect(pullRequests[0]).toEqual(expect.objectContaining({ id: 1, merged: true }));
    expect(pullRequests.at(-1)).toEqual(expect.objectContaining({ id: 101, merged: false }));
    expect(data.pullRequestCount).toBe(101);
    expect(data._meta).toEqual(expect.objectContaining({
      pageCount: 2,
      truncated: false,
    }));
  });

  it("queries GitHub pull requests with the requested update window", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      total_count: 1,
      incomplete_results: false,
      items: [
        {
          id: 1,
          html_url: "https://github.com/acme/app/pull/1",
          updated_at: "2026-05-31T12:00:00.000Z",
          pull_request: {
            url: "https://api.github.com/repos/acme/app/pulls/1",
            merged_at: "2026-05-31T13:00:00.000Z",
          },
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGitHubData({
      token: "ghp_token",
      owner: "acme",
      repo: "app",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    const parsed = new URL(requestedUrl);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://api.github.com/search/issues");
    expect(parsed.searchParams.get("q")).toBe("repo:acme/app is:pr updated:2026-05-01..2026-06-01");
    expect(data.pullRequests).toEqual([
      expect.objectContaining({ id: 1, merged: true }),
    ]);
    expect(data.pullRequestCount).toBe(1);
    expect(data._meta).toEqual(expect.objectContaining({
      pageCount: 1,
      truncated: false,
    }));
  });
});
