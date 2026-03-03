import { describe, expect, it, vi } from "vitest";
import { searchDealsIncremental } from "@/lib/integrations/hubspot-search";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hubspot search helper", () => {
  it("paginates until maxResults and forwards paging.after", async () => {
    const fetchMock = vi.fn();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: "1", properties: { hs_lastmodifieddate: "1000", dealname: "A" } },
            { id: "2", properties: { hs_lastmodifieddate: "2000", dealname: "B" } },
          ],
          paging: { next: { after: "p2" } },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: "3", properties: { hs_lastmodifieddate: "3000", dealname: "C" } }],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await searchDealsIncremental({
      accessToken: "hs-token",
      properties: ["dealname"],
      monitoredPipelines: [],
      checkpoint: {},
      maxResults: 3,
    });

    expect(result.deals.map((d) => d.id)).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(firstBody.limit).toBe(3);
    expect(firstBody.after).toBeUndefined();

    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(secondBody.limit).toBe(1);
    expect(secondBody.after).toBe("p2");
  });

  it("applies strict checkpoint filtering and advances checkpoint", async () => {
    const fetchMock = vi.fn();

    const checkpointIso = "2026-03-01T00:00:00.000Z";
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          { id: "100", properties: { hs_lastmodifieddate: checkpointIso } },
          { id: "200", properties: { hs_lastmodifieddate: checkpointIso } },
          { id: "300", properties: { hs_lastmodifieddate: "2026-03-02T00:00:00.000Z" } },
        ],
      })
    );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await searchDealsIncremental({
      accessToken: "hs-token",
      properties: ["dealstage"],
      monitoredPipelines: ["default"],
      monitoredStages: ["appointmentscheduled"],
      checkpoint: { lastModifiedAt: checkpointIso, lastDealId: "150" },
      maxResults: 10,
    });

    // id=100 excluded (same timestamp, id <= lastDealId); id=200 included (same ts, id > lastDealId)
    expect(result.deals.map((d) => d.id)).toEqual(["200", "300"]);
    expect(result.checkpoint.lastModifiedAt).toBe("2026-03-02T00:00:00.000Z");
    expect(result.checkpoint.lastDealId).toBe("300");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    const filters = body.filterGroups?.[0]?.filters ?? [];
    const pipelineFilter = filters.find((f: any) => f.propertyName === "pipeline");
    const stageFilter = filters.find((f: any) => f.propertyName === "dealstage");
    expect(pipelineFilter?.operator).toBe("IN");
    expect(stageFilter?.operator).toBe("IN");
  });
});

