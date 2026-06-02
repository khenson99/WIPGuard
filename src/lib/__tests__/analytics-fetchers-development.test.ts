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
  it("follows PostHog event pagination so historical syncs do not stop at the first page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{ uuid: "event_1", event: "Signup" }],
        next: "https://app.posthog.com/api/projects/project_1/events?cursor=page_2",
      }))
      .mockResolvedValueOnce(jsonResponse({
        results: [{ uuid: "event_2", event: "Activated" }],
        next: null,
      }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchPostHogData({
      apiKey: "phx_token",
      projectId: "project_1",
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(data.events).toEqual([
      { uuid: "event_1", event: "Signup" },
      { uuid: "event_2", event: "Activated" },
    ]);
    expect(data.eventCount).toBe(2);
    expect(data._meta).toEqual(expect.objectContaining({
      pageCount: 2,
      truncated: false,
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
