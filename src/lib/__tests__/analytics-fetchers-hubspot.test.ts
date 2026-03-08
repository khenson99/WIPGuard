import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHubSpotData } from "@/lib/analytics/fetchers";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createPipelineResponse() {
  return {
    results: [
      {
        id: "default",
        label: " Deals pipeline",
        stages: [
          { id: "presentationscheduled", label: "Demo Scheduled", displayOrder: 0 },
          { id: "1955958510", label: "No-Show/Reschedule Demo", displayOrder: 1 },
          { id: "decisionmakerboughtin", label: "Demo Follow-Up", displayOrder: 2 },
          { id: "contractsent", label: "Ping Later", displayOrder: 3 },
          { id: "closedwon", label: "Closed Won", displayOrder: 4 },
          { id: "closedlost", label: "Closed Lost", displayOrder: 5 },
          { id: "1499784890", label: "Churn", displayOrder: 6 },
          { id: "1499784891", label: "Unlikely", displayOrder: 7 },
        ],
      },
      {
        id: "1390107368",
        label: "Zaybra Subscriptions",
        stages: [{ id: "2239936224", label: "Subscriptions", displayOrder: 0 }],
      },
    ],
  };
}

function createHubSpotFetchMock(input: {
  activeDeals?: unknown[];
  archivedDeals?: unknown[];
  totalContacts?: number;
  owners?: unknown[];
}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);

    if (parsed.pathname === "/crm/v3/pipelines/deals") {
      return jsonResponse(createPipelineResponse());
    }

    if (parsed.pathname === "/crm/v3/objects/deals") {
      const archived = parsed.searchParams.get("archived") === "true";
      return jsonResponse({
        results: archived ? input.archivedDeals ?? [] : input.activeDeals ?? [],
      });
    }

    if (parsed.pathname === "/crm/v3/owners/") {
      return jsonResponse({ results: input.owners ?? [] });
    }

    if (parsed.pathname === "/crm/v3/objects/contacts" && parsed.searchParams.get("limit") === "1") {
      return jsonResponse({ total: input.totalContacts ?? 0 });
    }

    if (parsed.pathname === "/crm/v4/associations/deal/contact/batch/read") {
      return jsonResponse({ results: [] });
    }

    if (parsed.pathname === "/crm/v3/objects/contacts/batch/read") {
      return jsonResponse({ results: [] });
    }

    throw new Error(`Unexpected fetch: ${parsed.pathname} ${init?.method ?? "GET"}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analytics hubspot fetcher", () => {
  it("loads live pipeline metadata and still requests history pages with limit=50", async () => {
    const fetchMock = createHubSpotFetchMock({});
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token");

    const dealsRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/crm/v3/objects/deals"),
    );

    expect(String(dealsRequest?.[0] ?? "")).toContain("propertiesWithHistory=dealstage");
    expect(String(dealsRequest?.[0] ?? "")).toContain("limit=50");
    expect(data.pipelineStageLabelsSource).toBe("api");
    expect(data.pipelineDetected).toEqual({ pipelineId: "default", dealCount: 0 });
  });

  it("filters non-default pipelines and resolves contractsent to Ping Later from live metadata", async () => {
    const fetchMock = createHubSpotFetchMock({
      activeDeals: [
        {
          id: "deal-default",
          properties: {
            pipeline: "default",
            dealstage: "contractsent",
            amount: "20",
            dealname: "Main Pipeline Deal",
            hs_lastmodifieddate: "2026-03-04T12:00:00.000Z",
            createdate: "2026-03-01T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "contractsent", timestamp: "2026-03-04T12:00:00.000Z" }],
          },
        },
        {
          id: "deal-subscription",
          properties: {
            pipeline: "1390107368",
            dealstage: "2239936224",
            amount: "99",
            dealname: "Zaybra Subscription",
            hs_lastmodifieddate: "2026-03-04T12:30:00.000Z",
            createdate: "2026-03-01T12:30:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "2239936224", timestamp: "2026-03-04T12:30:00.000Z" }],
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token");

    expect(data.deals?.map((deal) => deal.dealId)).toEqual(["deal-default"]);
    expect(data.deals?.[0]?.stageLabel).toBe("Ping Later");
    expect(data.pipelineStages?.find((stage) => stage.stageId === "contractsent")?.label).toBe("Ping Later");
    expect(data.funnel.activeSubscriptions).toBe(0);
  });

  it("keeps funnel metrics activity-based but builds display deals from last-modified recency", async () => {
    const fetchMock = createHubSpotFetchMock({
      activeDeals: [
        {
          id: "deal-history",
          properties: {
            pipeline: "default",
            dealstage: "closedwon",
            amount: "100",
            dealname: "History Deal",
            hs_lastmodifieddate: "2026-01-15T12:00:00.000Z",
            createdate: "2026-01-01T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [
              { value: "presentationscheduled", timestamp: "2026-02-10T12:00:00.000Z" },
              { value: "closedwon", timestamp: "2026-02-11T12:00:00.000Z" },
            ],
          },
        },
        {
          id: "deal-recent-b",
          properties: {
            pipeline: "default",
            dealstage: "presentationscheduled",
            amount: "50",
            dealname: "Recent Deal B",
            hs_lastmodifieddate: "2026-02-15T12:00:00.000Z",
            createdate: "2026-02-01T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "presentationscheduled", timestamp: "2026-01-15T12:00:00.000Z" }],
          },
        },
        {
          id: "deal-recent-c",
          properties: {
            pipeline: "default",
            dealstage: "closedlost",
            amount: "75",
            dealname: "Recent Deal C",
            hs_lastmodifieddate: "2026-02-20T12:00:00.000Z",
            createdate: "2026-02-05T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "closedlost", timestamp: "2026-01-20T12:00:00.000Z" }],
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const fromDate = new Date("2026-02-01T00:00:00.000Z");
    const toDate = new Date("2026-02-28T23:59:59.999Z");
    const data = await fetchHubSpotData("hs-token", { fromDate, toDate });

    expect(data._meta.diagnostics?.activityMode).toBe("activity_in_range");
    expect(data.funnel.totalDeals).toBe(1);
    expect(data.funnel.demoScheduled).toBe(1);
    expect(data.funnel.closedWon).toBe(1);
    expect(data.deals?.map((deal) => deal.dealId)).toEqual([
      "deal-recent-c",
      "deal-recent-b",
      "deal-history",
    ]);
    expect(data.displayDeals?.map((deal) => deal.dealId)).toEqual([
      "deal-recent-c",
      "deal-recent-b",
    ]);
  });
});
