import { describe, expect, it, vi } from "vitest";
import { fetchPylonIssues } from "@/lib/integrations/pylon-client";

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
    expect(requestUrls.some((u) => u.includes("/issues?"))).toBe(true);
    expect(requestUrls.some((u) => u.includes("/conversations?"))).toBe(true);
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
});
