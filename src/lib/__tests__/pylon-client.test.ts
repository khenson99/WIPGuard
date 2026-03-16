import { describe, expect, it, vi } from "vitest";
import { fetchPylonIssues } from "@/lib/integrations/pylon-client";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pylon client", () => {
  it("follows pagination cursors on the issues endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/issues")) {
        if (url.searchParams.get("cursor") === "cursor-2") {
          return jsonResponse({
            data: [{ id: "i2" }],
            pagination: { has_next_page: false, cursor: null },
          });
        }

        return jsonResponse({
          data: [{ id: "i1" }],
          pagination: { has_next_page: true, cursor: "cursor-2" },
        });
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

    expect(issues).toEqual([{ id: "i1" }, { id: "i2" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(firstUrl.searchParams.get("cursor")).toBeNull();
    expect(secondUrl.searchParams.get("cursor")).toBe("cursor-2");
  });

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
    expect(requestUrls.some((u) => u.includes("/issues?"))).toBe(true);
    expect(requestUrls.some((u) => u.includes("/conversations?"))).toBe(true);
  });

  it("does not return partial results when a later page fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/issues")) {
        if (url.searchParams.get("cursor") === "cursor-2") {
          return jsonResponse({ error: "rate limited" }, 429);
        }

        return jsonResponse({
          data: [{ id: "i1" }],
          pagination: { has_next_page: true, cursor: "cursor-2" },
        });
      }

      return jsonResponse({ error: "unexpected" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchPylonIssues({
        apiKey: "pylon-key",
        from: "2026-02-01",
        to: "2026-02-28",
        baseUrl: "https://api.example.test",
        limit: 1,
        timeoutMs: 2_000,
      })
    ).rejects.toThrow("Pylon request failed (429)");
  });
});
