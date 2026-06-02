import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pylon analytics fetcher", () => {
  it("preserves Pylon response metrics when numeric fields arrive as formatted strings", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: "issue_1",
            status: "resolved",
            priority: "normal",
            first_response_minutes: "1,200.5",
            csat: "98%",
          },
          {
            id: "issue_2",
            status: "open",
            priority: "urgent",
            firstResponseMinutes: "30.5",
            customerSatisfaction: "90%",
          },
          {
            id: "issue_bad",
            status: "open",
            priority: "normal",
            first_response_minutes: "not-a-number",
            csat: "unavailable",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchPylonData({
      apiKey: "pylon-key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
    });

    expect(data.openConversations).toBe(2);
    expect(data.urgentConversations).toBe(1);
    expect(data.resolvedInRange).toBe(1);
    expect(data.avgFirstResponseMinutes).toBe(615.5);
    expect(data.csat).toBe(94);
  });

  it("marks Pylon payloads truncated when page caps stop before cursors are exhausted", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get("cursor");
      const page = cursor ? Number(cursor.replace("cursor_", "")) : 1;
      const nextPage = page + 1;

      return jsonResponse({
        data: [
          {
            id: `issue_${page}`,
            status: "open",
            priority: page === 1 ? "urgent" : "normal",
          },
        ],
        next_cursor: `cursor_${nextPage}`,
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchPylonData({
      apiKey: "pylon-key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(100);
    expect(data.openConversations).toBe(100);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["issues"],
    }));
  });
});
