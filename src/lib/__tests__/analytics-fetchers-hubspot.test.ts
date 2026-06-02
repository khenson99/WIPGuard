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
  ownerV3Status?: number;
  ownerV2Pages?: Record<string, unknown[]>;
  dealContactAssociations?: Record<string, string[]>;
  contactsById?: Record<string, Record<string, string>>;
  forms?: unknown[];
  formsStatus?: number;
  formsPages?: Record<string, unknown>;
  submissionsByFormGuid?: Record<string, unknown[]>;
  submissionPagesByFormGuid?: Record<string, Record<string, unknown>>;
  submissionPageStatusesByFormGuid?: Record<string, Record<string, number>>;
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
      if (input.ownerV3Status && input.ownerV3Status >= 400) {
        return jsonResponse({ error: "owners unavailable" }, input.ownerV3Status);
      }
      return jsonResponse({ results: input.owners ?? [] });
    }

    if (parsed.pathname === "/owners/v2/owners") {
      const offset = parsed.searchParams.get("offset") ?? "0";
      return jsonResponse(input.ownerV2Pages?.[offset] ?? []);
    }

    if (parsed.pathname === "/crm/v3/objects/contacts" && parsed.searchParams.get("limit") === "1") {
      return jsonResponse({ total: input.totalContacts ?? 0 });
    }

    if (parsed.pathname === "/crm/v4/associations/deal/contact/batch/read") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { inputs?: Array<{ id?: string }> };
      return jsonResponse({
        results: (body.inputs ?? []).map((entry) => ({
          from: { id: entry.id },
          to: (input.dealContactAssociations?.[String(entry.id ?? "")] ?? []).map((contactId) => ({
            toObjectId: contactId,
          })),
        })),
      });
    }

    if (parsed.pathname === "/crm/v3/objects/contacts/batch/read") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { inputs?: Array<{ id?: string }> };
      return jsonResponse({
        results: (body.inputs ?? []).map((entry) => ({
          id: entry.id,
          properties: input.contactsById?.[String(entry.id ?? "")] ?? {},
        })),
      });
    }

    if (parsed.pathname === "/forms/v2/forms") {
      if (input.formsStatus && input.formsStatus >= 400) {
        return jsonResponse({ error: "forms unavailable" }, input.formsStatus);
      }
      if (input.formsPages) {
        const offset = parsed.searchParams.get("offset");
        const after = parsed.searchParams.get("after");
        const pageKey = offset && offset !== "0" ? offset : after ?? "initial";
        return jsonResponse(input.formsPages[pageKey] ?? { results: [] });
      }
      return jsonResponse(input.forms ?? []);
    }

    const submissionMatch = parsed.pathname.match(/^\/form-integrations\/v1\/submissions\/forms\/([^/]+)$/);
    if (submissionMatch) {
      const formGuid = submissionMatch[1] ?? "";
      const pageKey = parsed.searchParams.get("after") ?? "initial";
      const pageStatus = input.submissionPageStatusesByFormGuid?.[formGuid]?.[pageKey];
      if (pageStatus && pageStatus >= 400) {
        return jsonResponse({ error: "submissions unavailable" }, pageStatus);
      }
      const pagedSubmissions = input.submissionPagesByFormGuid?.[formGuid];
      if (pagedSubmissions) {
        return jsonResponse(pagedSubmissions[pageKey] ?? { results: [] });
      }
      return jsonResponse({
        results: input.submissionsByFormGuid?.[formGuid] ?? [],
      });
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

  it("keeps subscription pipeline deals out of main deals while exposing active subscriptions", async () => {
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
    expect(data.subscriptionDeals?.map((deal) => deal.dealId)).toEqual(["deal-subscription"]);
    expect(data.subscriptionDeals?.[0]?.stageLabel).toBe("Subscriptions");
    expect(data.subscriptionPipelineDetected).toEqual({ pipelineId: "1390107368", dealCount: 1 });
    expect(data.pipelineStages?.find((stage) => stage.stageId === "contractsent")?.label).toBe("Ping Later");
    expect(data.funnel.activeSubscriptions).toBe(1);
    expect(data._meta.diagnostics?.subscriptionDealsFetched).toBe(1);
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

  it("keeps HubSpot deals when provider date fields are malformed", async () => {
    const fetchMock = createHubSpotFetchMock({
      activeDeals: [
        {
          id: "deal-bad-date",
          properties: {
            pipeline: "default",
            dealstage: "presentationscheduled",
            amount: "50",
            dealname: "Malformed Date Deal",
            hs_lastmodifieddate: "not-a-date",
            createdate: "999999999999999999999999",
            closedate: "also-not-a-date",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "presentationscheduled", timestamp: "not-a-date" }],
          },
        },
        {
          id: "deal-good-date",
          properties: {
            pipeline: "default",
            dealstage: "closedwon",
            amount: "100",
            dealname: "Valid Date Deal",
            hs_lastmodifieddate: "2026-02-15T12:00:00.000Z",
            createdate: "2026-02-10T12:00:00.000Z",
            closedate: "2026-02-20T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "closedwon", timestamp: "2026-02-20T12:00:00.000Z" }],
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.deals?.map((deal) => deal.dealId)).toContain("deal-bad-date");
    expect(data.deals?.find((deal) => deal.dealId === "deal-bad-date")).toEqual(expect.objectContaining({
      updatedAt: null,
      createdAt: null,
      closedAt: null,
      stageHistory: [],
    }));
    expect(data.deals?.find((deal) => deal.dealId === "deal-good-date")).toEqual(expect.objectContaining({
      updatedAt: "2026-02-15T12:00:00.000Z",
      createdAt: "2026-02-10T12:00:00.000Z",
      closedAt: "2026-02-20T12:00:00.000Z",
      stageHistory: [
        {
          occurredAt: "2026-02-20T12:00:00.000Z",
          stageId: "closedwon",
          stageLabel: "Closed Won",
        },
      ],
    }));
  });

  it("bypasses fetch cache for HubSpot contact count and enrichment requests", async () => {
    const fetchMock = createHubSpotFetchMock({
      totalContacts: 7,
      activeDeals: [
        {
          id: "deal-contact-backed",
          properties: {
            pipeline: "default",
            dealstage: "presentationscheduled",
            amount: "5000",
            dealname: "Contact Backed Deal",
            hs_lastmodifieddate: "2026-05-08T12:00:00.000Z",
            createdate: "2026-05-08T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "presentationscheduled", timestamp: "2026-05-08T12:00:00.000Z" }],
          },
        },
      ],
      dealContactAssociations: {
        "deal-contact-backed": ["contact-1"],
      },
      contactsById: {
        "contact-1": {
          email: "buyer@example.com",
          createdate: "2026-05-08T12:00:00.000Z",
          hs_analytics_num_visits: "3",
          hs_analytics_num_page_views: "8",
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-08T00:00:00.000Z"),
      toDate: new Date("2026-05-08T23:59:59.999Z"),
    });

    const calls = fetchMock.mock.calls;
    const contactCountCall = calls.find(([url]) =>
      String(url).includes("/crm/v3/objects/contacts?limit=1"),
    );
    const associationCall = calls.find(([url]) =>
      String(url).includes("/crm/v4/associations/deal/contact/batch/read"),
    );
    const contactBatchCall = calls.find(([url]) =>
      String(url).includes("/crm/v3/objects/contacts/batch/read"),
    );

    expect(contactCountCall?.[1]).toEqual(expect.objectContaining({
      cache: "no-store",
    }));
    expect(associationCall?.[1]).toEqual(expect.objectContaining({
      cache: "no-store",
    }));
    expect(contactBatchCall?.[1]).toEqual(expect.objectContaining({
      cache: "no-store",
    }));
  });

  it("excludes suspicious contact-backed HubSpot leads from funnel and churn metrics", async () => {
    const fetchMock = createHubSpotFetchMock({
      activeDeals: [
        {
          id: "clean-demo",
          properties: {
            pipeline: "default",
            dealstage: "presentationscheduled",
            amount: "5000",
            dealname: "Acme Expansion",
            hs_analytics_source: "ORGANIC_SEARCH",
            hs_lastmodifieddate: "2026-05-08T12:00:00.000Z",
            createdate: "2026-05-08T12:00:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "presentationscheduled", timestamp: "2026-05-08T12:00:00.000Z" }],
          },
        },
        {
          id: "junk-demo",
          properties: {
            pipeline: "default",
            dealstage: "presentationscheduled",
            amount: "0",
            dealname: "asdf",
            hs_analytics_source: "Unknown",
            hs_lastmodifieddate: "2026-05-08T12:10:00.000Z",
            createdate: "2026-05-08T12:10:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [{ value: "presentationscheduled", timestamp: "2026-05-08T12:10:00.000Z" }],
          },
        },
        {
          id: "junk-churn",
          properties: {
            pipeline: "default",
            dealstage: "1499784890",
            amount: "0",
            dealname: "test lead",
            hs_analytics_source: "Unknown",
            hs_lastmodifieddate: "2026-05-08T12:20:00.000Z",
            createdate: "2026-05-08T12:20:00.000Z",
          },
          propertiesWithHistory: {
            dealstage: [
              { value: "closedwon", timestamp: "2026-05-08T12:15:00.000Z" },
              { value: "1499784890", timestamp: "2026-05-08T12:20:00.000Z" },
            ],
          },
        },
      ],
      dealContactAssociations: {
        "clean-demo": ["contact-clean"],
        "junk-demo": ["contact-junk-demo"],
        "junk-churn": ["contact-junk-churn"],
      },
      contactsById: {
        "contact-clean": {
          email: "buyer@acme.example",
          createdate: "2026-05-08T12:00:00.000Z",
          hs_analytics_num_visits: "4",
          hs_analytics_num_page_views: "9",
        },
        "contact-junk-demo": {
          email: "asdf@mailinator.com",
          createdate: "2026-05-08T12:10:00.000Z",
          hs_analytics_num_visits: "0",
          hs_analytics_num_page_views: "0",
        },
        "contact-junk-churn": {
          email: "test@example.com",
          createdate: "2026-05-08T12:20:00.000Z",
          hs_analytics_num_visits: "0",
          hs_analytics_num_page_views: "0",
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-08T00:00:00.000Z"),
      toDate: new Date("2026-05-08T23:59:59.999Z"),
    });

    expect(data.funnel.totalDeals).toBe(1);
    expect(data.funnel.demoScheduled).toBe(1);
    expect(data.funnel.churn).toBe(0);
    expect(data.funnel.excludedSuspiciousLeads).toBe(2);
    expect(data.deals?.map((deal) => deal.dealId)).toEqual(["clean-demo"]);
    expect(data.displayDeals?.map((deal) => deal.dealId)).toEqual(["clean-demo"]);
    expect(data._meta.diagnostics?.suspiciousLeadExclusions).toBe(2);
  });

  it("maps HubSpot collected Kanban Generator and Get in Touch submissions into funnel form counts", async () => {
    const fetchMock = createHubSpotFetchMock({
      forms: [
        { guid: "kanban-form", name: "Kanban Generator" },
        { guid: "contact-form", name: "Get in Touch" },
      ],
      submissionsByFormGuid: {
        "kanban-form": [
          {
            submittedAt: 1779296400000,
            values: [{ name: "email", value: "ops@example.com" }],
            pageUrl: "https://wipguard.example/kanban-generator",
          },
          {
            submittedAt: 1779298200000,
            values: [{ name: "email", value: "planner@example.com" }],
            pageUrl: "https://wipguard.example/kanban-generator",
          },
        ],
        "contact-form": [
          {
            submittedAt: 1779300000000,
            values: [{ name: "email", value: "buyer@example.com" }],
            pageUrl: "https://wipguard.example/contact",
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-20T00:00:00.000Z"),
      toDate: new Date("2026-05-20T23:59:59.999Z"),
    });

    expect(data.collectedForms?.formSubmissions).toEqual([
      {
        formName: "Kanban Generator",
        count: 2,
        funnelCategory: "lead_magnet",
      },
      {
        formName: "Get in Touch",
        count: 1,
        funnelCategory: "contact_request",
      },
    ]);
    expect(data.collectedForms?.totalFormSubmissions).toBe(3);
    expect(data.collectedForms?.leadMagnetSubmissions).toBe(2);
    expect(data.collectedForms?.contactRequestSubmissions).toBe(1);
    expect(data.funnel.collectedFormSubmissions).toBe(3);
    expect(data.funnel.leadMagnetSubmissions).toBe(2);
    expect(data.funnel.contactRequestSubmissions).toBe(1);
  });

  it("paginates HubSpot collected forms and form submissions before computing funnel form counts", async () => {
    const fetchMock = createHubSpotFetchMock({
      formsPages: {
        initial: {
          results: [{ guid: "kanban-form", name: "Kanban Generator" }],
          hasMore: true,
          offset: 100,
        },
        "100": {
          results: [{ guid: "contact-form", name: "Get in Touch" }],
          hasMore: false,
        },
      },
      submissionPagesByFormGuid: {
        "kanban-form": {
          initial: {
            results: [
              {
                submittedAt: 1779296400000,
                values: [{ name: "email", value: "ops@example.com" }],
                pageUrl: "https://wipguard.example/kanban-generator",
              },
            ],
            paging: { next: { after: "submission_page_2" } },
          },
          submission_page_2: {
            results: [
              {
                submittedAt: 1779298200000,
                values: [{ name: "email", value: "planner@example.com" }],
                pageUrl: "https://wipguard.example/kanban-generator",
              },
            ],
          },
        },
        "contact-form": {
          initial: {
            results: [
              {
                submittedAt: 1779300000000,
                values: [{ name: "email", value: "buyer@example.com" }],
                pageUrl: "https://wipguard.example/contact",
              },
            ],
          },
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-20T00:00:00.000Z"),
      toDate: new Date("2026-05-20T23:59:59.999Z"),
    });
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    const formsRequests = urls.filter((url) => url.pathname === "/forms/v2/forms");
    const kanbanSubmissionRequests = urls.filter((url) =>
      url.pathname === "/form-integrations/v1/submissions/forms/kanban-form",
    );

    expect(formsRequests).toHaveLength(2);
    expect(formsRequests[1]?.searchParams.get("offset")).toBe("100");
    expect(kanbanSubmissionRequests).toHaveLength(2);
    expect(kanbanSubmissionRequests[1]?.searchParams.get("after")).toBe("submission_page_2");
    expect(data.collectedForms?.formSubmissions).toEqual([
      {
        formName: "Kanban Generator",
        count: 2,
        funnelCategory: "lead_magnet",
      },
      {
        formName: "Get in Touch",
        count: 1,
        funnelCategory: "contact_request",
      },
    ]);
    expect(data.funnel.collectedFormSubmissions).toBe(3);
  });

  it("marks HubSpot collected forms unavailable when the forms endpoint fails", async () => {
    const fetchMock = createHubSpotFetchMock({
      formsStatus: 403,
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-20T00:00:00.000Z"),
      toDate: new Date("2026-05-20T23:59:59.999Z"),
    });

    expect(data.funnel.totalDeals).toBe(0);
    expect(data.collectedForms).toBeUndefined();
    expect(data._meta.diagnostics).toEqual(expect.objectContaining({
      collectedFormsAvailable: false,
      collectedFormsError: expect.stringContaining("403"),
    }));
  });

  it("marks HubSpot collected forms unavailable when a paginated submission page fails", async () => {
    const fetchMock = createHubSpotFetchMock({
      forms: [{ guid: "kanban-form", name: "Kanban Generator" }],
      submissionPagesByFormGuid: {
        "kanban-form": {
          initial: {
            results: [
              {
                submittedAt: 1779296400000,
                values: [{ name: "email", value: "ops@example.com" }],
                pageUrl: "https://wipguard.example/kanban-generator",
              },
            ],
            paging: { next: { after: "submission_page_2" } },
          },
        },
      },
      submissionPageStatusesByFormGuid: {
        "kanban-form": {
          submission_page_2: 503,
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-20T00:00:00.000Z"),
      toDate: new Date("2026-05-20T23:59:59.999Z"),
    });

    expect(data.collectedForms).toBeUndefined();
    expect(data.funnel.collectedFormSubmissions).toBe(0);
    expect(data._meta.diagnostics).toEqual(expect.objectContaining({
      collectedFormsAvailable: false,
      collectedFormsError: expect.stringContaining("503"),
      collectedFormsFetched: 0,
    }));
  });

  it("marks HubSpot payloads truncated when collected form pagination still has a cursor at the page cap", async () => {
    const formPages: Record<string, unknown> = {};
    for (let index = 0; index < 100; index += 1) {
      const currentKey = index === 0 ? "initial" : String(index * 100);
      const nextOffset = (index + 1) * 100;
      formPages[currentKey] = {
        results: [{ guid: `other-form-${index}`, name: `Other Form ${index}` }],
        hasMore: true,
        offset: nextOffset,
      };
    }

    const fetchMock = createHubSpotFetchMock({
      formsPages: formPages,
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-20T00:00:00.000Z"),
      toDate: new Date("2026-05-20T23:59:59.999Z"),
    });
    const formRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/forms/v2/forms");

    expect(formRequests).toHaveLength(100);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["collectedForms"],
    }));
    expect(data._meta.diagnostics?.collectedFormsTruncated).toBe(true);
  });

  it("paginates HubSpot v2 owner fallback before labeling rep-owned deals", async () => {
    const fetchMock = createHubSpotFetchMock({
      ownerV3Status: 403,
      ownerV2Pages: {
        "0": Array.from({ length: 500 }, (_, index) => ({
          ownerId: index + 1,
          firstName: "Owner",
          lastName: String(index + 1),
          email: `owner${index + 1}@example.com`,
        })),
        "500": [
          {
            ownerId: 501,
            firstName: "Second",
            lastName: "Page",
            email: "second.page@example.com",
          },
        ],
      },
      activeDeals: [
        {
          id: "deal-second-page-owner",
          properties: {
            pipeline: "default",
            dealstage: "presentationscheduled",
            amount: "100",
            dealname: "Second Page Owner Deal",
            hs_lastmodifieddate: "2026-05-20T12:00:00.000Z",
            createdate: "2026-05-20T12:00:00.000Z",
            hubspot_owner_id: "501",
          },
          propertiesWithHistory: {
            dealstage: [
              { value: "presentationscheduled", timestamp: "2026-05-20T12:00:00.000Z" },
            ],
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchHubSpotData("hs-token", {
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-05-31T23:59:59.999Z"),
    });
    const ownerV2Requests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/owners/v2/owners");

    expect(ownerV2Requests).toHaveLength(2);
    expect(ownerV2Requests[0]?.searchParams.get("count")).toBe("500");
    expect(ownerV2Requests[1]?.searchParams.get("offset")).toBe("500");
    expect(data.deals?.[0]?.repName).toBe("Second Page");
    expect(data.repScoreboard?.[0]).toMatchObject({
      ownerId: "501",
      ownerName: "Second Page",
    });
    expect(data._meta.diagnostics?.ownerLookup).toEqual({
      ownersFetched: 501,
      source: "v2",
    });
  });
});
