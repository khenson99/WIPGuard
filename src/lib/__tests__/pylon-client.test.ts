import { describe, expect, it, vi } from "vitest";
import {
  __test__,
  fetchPylonIssues,
  getPylonIssuePriority,
  getPylonIssueStatus,
} from "@/lib/integrations/pylon-client";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pylon client", () => {
  it("falls back to /conversations when /issues endpoints 404", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/issues") || url.pathname.endsWith("/v1/issues")) {
        return jsonResponse({ error: "not found" }, 404);
      }
      if (url.pathname.endsWith("/conversations")) {
        return jsonResponse({ conversations: [{ id: "c1" }] });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const issues = await fetchPylonIssues({
      apiKey: "pylon-key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
      limit: 1,
      timeoutMs: 2_000,
    });

    expect(issues).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalled();

    const requestUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestUrls.some((url) => url.includes("/issues?"))).toBe(true);
    expect(requestUrls.some((url) => url.includes("/conversations?"))).toBe(true);
  });

  it("returns no issues when every Pylon endpoint returns 404", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "not found" }, 404));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const issues = await fetchPylonIssues({
      apiKey: "pylon-key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
      limit: 1,
      timeoutMs: 2_000,
    });

    expect(issues).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("normalizes date-only filters to RFC3339 timestamps", () => {
    expect(__test__.normalizePylonTimestamp("2026-03-01", "start")).toBe("2026-03-01T00:00:00.000Z");
    expect(__test__.normalizePylonTimestamp("2026-03-15", "end")).toBe("2026-03-15T23:59:59.999Z");
    expect(__test__.normalizePylonTimestamp("2026-03-01T05:00:00Z", "start")).toBe("2026-03-01T05:00:00Z");
  });

  it("splits long sync windows into 30-day chunks", () => {
    expect(
      __test__.splitPylonDateRange({
        from: "2026-01-01",
        to: "2026-03-16",
      })
    ).toEqual([
      {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-30T23:59:59.999Z",
      },
      {
        from: "2026-01-31T00:00:00.000Z",
        to: "2026-03-01T23:59:59.999Z",
      },
      {
        from: "2026-03-02T00:00:00.000Z",
        to: "2026-03-16T23:59:59.999Z",
      },
    ]);
  });

  it("requests each Pylon window separately and deduplicates issue ids", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/issues")) {
        return jsonResponse({ error: "unexpected fallback" }, 500);
      }

      const startTime = url.searchParams.get("start_time");
      if (startTime === "2026-01-01T00:00:00.000Z") {
        return jsonResponse({ items: [{ id: "i1" }, { id: "i2" }] });
      }
      if (startTime === "2026-01-31T00:00:00.000Z") {
        return jsonResponse({ items: [{ id: "i2" }, { id: "i3" }] });
      }
      return jsonResponse({ items: [{ id: "i4" }] });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const issues = await fetchPylonIssues({
      apiKey: "pylon-key",
      from: "2026-01-01",
      to: "2026-03-16",
      baseUrl: "https://api.example.test",
      limit: 100,
      timeoutMs: 2_000,
    });

    expect(issues.map((issue) => issue.id)).toEqual(["i1", "i2", "i3", "i4"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("parses nested data.items payloads from pylon issue endpoints", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: {
          items: [{ id: "nested-1" }],
        },
      })
    );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const issues = await fetchPylonIssues({
      apiKey: "pylon-key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
      limit: 1,
      timeoutMs: 2_000,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.id).toBe("nested-1");
  });

  it("reads nested status and priority objects", () => {
    const issue = {
      status: { label: "waiting_on_team" },
      priority: { name: "urgent" },
    };

    expect(getPylonIssueStatus(issue)).toBe("waiting_on_team");
    expect(getPylonIssuePriority(issue)).toBe("urgent");
  });
});
