import { describe, expect, it, vi } from "vitest";
import { fetchHubSpotData } from "@/lib/analytics/fetchers";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("analytics hubspot fetcher", () => {
  it("paginates active+archived, dedupes by id, and emits diagnostics", async () => {
    const fetchMock = vi.fn();

    // Active page 1
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          { id: "1", properties: { dealstage: "presentationscheduled", amount: "10", dealname: "A" } },
          { id: "2", properties: { dealstage: "closedwon", amount: "20", dealname: "B" } },
        ],
        paging: { next: { after: "p2" } },
      })
    );
    // Active page 2
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [{ id: "3", properties: { dealstage: "closedlost", amount: "5", dealname: "C" } }],
      })
    );

    // Archived page 1 includes an overlap id=2 (should dedupe)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          { id: "2", properties: { dealstage: "closedwon", amount: "20", dealname: "B" } },
          { id: "4", properties: { dealstage: "1499784891", amount: "7", dealname: "D" } },
        ],
      })
    );

    // Contacts endpoint (best-effort)
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 999 }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token");
    expect(data.funnel.totalDeals).toBe(4);
    expect(data._meta.diagnostics?.archivedIncluded).toBe(true);
    expect((data._meta.diagnostics?.pagesFetched as any)?.active).toBe(2);
    expect((data._meta.diagnostics?.pagesFetched as any)?.archived).toBe(1);
  });

  it("computes activity-in-range metrics from stage history", async () => {
    const fetchMock = vi.fn();

    // Active deals: one deal with stage history entering demo + won in range.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: "10",
            properties: {
              dealstage: "closedwon",
              amount: "100",
              dealname: "Deal 10",
              hubspot_owner_id: "o1",
              hs_analytics_source: "Ads",
            },
            propertiesWithHistory: {
              dealstage: [
                { value: "presentationscheduled", timestamp: "2026-02-10T12:00:00.000Z" },
                { value: "closedwon", timestamp: "2026-02-11T12:00:00.000Z" },
              ],
            },
          },
        ],
      })
    );

    // Archived deals empty
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    // Owners endpoint can fail or return empty; not required for counts
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    // Contacts endpoint
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const fromDate = new Date("2026-02-01T00:00:00.000Z");
    const toDate = new Date("2026-02-28T23:59:59.999Z");
    const data = await fetchHubSpotData("hs-token", { fromDate, toDate });

    expect(data._meta.diagnostics?.activityMode).toBe("activity_in_range");
    expect(data.funnel.totalDeals).toBe(1);
    expect(data.funnel.demoScheduled).toBe(1);
    expect(data.funnel.closedWon).toBe(1);
    expect(data.funnel.winRate).toBe(100);
    expect(data.repScoreboard?.[0]?.ownerName).toBeTruthy();
    expect(data.repScoreboard?.[0]?.wonCount).toBe(1);
  });
});

