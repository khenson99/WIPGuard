import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchPylonData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses nested status and priority fields without counting generic open issues as waiting on team", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: {
          items: [
            {
              id: "issue-1",
              status: { label: "open" },
              priority: { name: "urgent" },
              first_response_minutes: 30,
              csat: 4,
            },
            {
              id: "issue-2",
              workflow_status: { name: "waiting_on_team" },
              priority: { label: "normal" },
              firstResponseMinutes: 90,
              customerSatisfaction: 5,
            },
            {
              id: "issue-3",
              state: { value: "resolved" },
              priority: { name: "low" },
            },
          ],
        },
      }),
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
    expect(data.waitingOnTeam).toBe(1);
    expect(data.resolvedInRange).toBe(1);
    expect(data.avgFirstResponseMinutes).toBe(60);
    expect(data.csat).toBe(4.5);
  });
});
