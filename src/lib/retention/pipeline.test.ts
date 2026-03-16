import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __test__ } from "@/lib/retention/pipeline";

function makeMonth(overrides: Partial<{
  monthStart: string;
  monthEnd: string;
  goLiveDate: string | null;
  subscriptionStartDate: string | null;
  activeWeeks: string[];
}> = {}) {
  return {
    customerRecordId: "customer_1",
    monthStart: new Date(overrides.monthStart ?? "2026-01-01T00:00:00.000Z"),
    monthEnd: new Date(overrides.monthEnd ?? "2026-01-31T23:59:59.999Z"),
    coverage: {
      arda: false,
      coda: false,
      stripe: false,
      hubspot: false,
      pylon: false,
      missingSources: [],
    },
    customerName: "Acme",
    externalIds: new Set<string>(),
    goLiveDate: overrides.goLiveDate ?? null,
    subscriptionStartDate: overrides.subscriptionStartDate ?? null,
    firstOrderDate: null,
    implementationStage: null,
    ownerName: null,
    segment: null,
    plan: null,
    icp: false,
    mrr: null,
    arr: null,
    daysActive: new Set<string>(),
    activeWeeks: new Set(overrides.activeWeeks ?? []),
    orderCount: 0,
    cardTouches: 0,
    itemTouches: 0,
    activeCardCount: 0,
    activeItemCount: 0,
    ardaOrderRecords: 0,
    ardaCardRecords: 0,
    ardaItemRecords: 0,
    ardaUserDetailsOrderCount: 0,
    ardaUserDetailsCardCount: 0,
    ardaUserDetailsItemCount: 0,
    locations: new Set<string>(),
    workflows: new Set<string>(),
    ticketsLast30: 0,
    unresolvedTickets: 0,
    urgentTickets: 0,
    bugTickets: 0,
    failedPayments: 0,
    delinquent: false,
    downgraded: false,
    contractionDetected: false,
    invoiceIrregularities: 0,
    crmChurnFlag: false,
    dataSignals: [],
  };
}

describe("retention pipeline helpers", () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    ARDA_API_BASE_URL: process.env.ARDA_API_BASE_URL,
    ARDA_API_TOKEN: process.env.ARDA_API_TOKEN,
    CODA_API_TOKEN: process.env.CODA_API_TOKEN,
    CODA_RETENTION_DOC_ID: process.env.CODA_RETENTION_DOC_ID,
    CODA_MASTER_ORDER_ARCHIVE_TABLE_ID: process.env.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID,
    CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT: process.env.CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv.ARDA_API_BASE_URL === undefined) {
      delete process.env.ARDA_API_BASE_URL;
    } else {
      process.env.ARDA_API_BASE_URL = originalEnv.ARDA_API_BASE_URL;
    }
    if (originalEnv.ARDA_API_TOKEN === undefined) {
      delete process.env.ARDA_API_TOKEN;
    } else {
      process.env.ARDA_API_TOKEN = originalEnv.ARDA_API_TOKEN;
    }
    if (originalEnv.CODA_API_TOKEN === undefined) {
      delete process.env.CODA_API_TOKEN;
    } else {
      process.env.CODA_API_TOKEN = originalEnv.CODA_API_TOKEN;
    }
    if (originalEnv.CODA_RETENTION_DOC_ID === undefined) {
      delete process.env.CODA_RETENTION_DOC_ID;
    } else {
      process.env.CODA_RETENTION_DOC_ID = originalEnv.CODA_RETENTION_DOC_ID;
    }
    if (originalEnv.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID === undefined) {
      delete process.env.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID;
    } else {
      process.env.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID = originalEnv.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID;
    }
    if (originalEnv.CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT === undefined) {
      delete process.env.CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT;
    } else {
      process.env.CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT = originalEnv.CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT;
    }
  });

  it("prefers Arda createdAt over snapshot asOf when deriving occurredAt", () => {
    expect(
      __test__.ardaOccurredAt({
        createdAt: { recorded: Date.parse("2025-05-01T00:00:00.000Z") },
        asOf: { recorded: Date.parse("2026-03-14T00:00:00.000Z") },
      })
    ).toBe("2025-05-01T00:00:00.000Z");
  });

  it("falls back to Arda asOf when createdAt is unavailable", () => {
    expect(
      __test__.ardaOccurredAt({
        asOf: { recorded: Date.parse("2026-03-14T00:00:00.000Z") },
      })
    ).toBe("2026-03-14T00:00:00.000Z");
  });

  it("keeps lifecycle start null when no real go-live or subscription start exists", () => {
    expect(__test__.deriveLifecycleStartDate(makeMonth(), [makeMonth()])).toBeNull();
  });

  it("uses the earliest real lifecycle date when one exists in history", () => {
    expect(
      __test__.deriveLifecycleStartDate(
        makeMonth({ goLiveDate: "2026-02-15T00:00:00.000Z" }),
        [makeMonth({ subscriptionStartDate: "2026-01-10T00:00:00.000Z" })]
      )
    ).toBe("2026-01-10T00:00:00.000Z");
  });

  it("marks User Details as the Arda adoption source when direct activity is absent", () => {
    expect(
      __test__.ardaAdoptionCountsSource({
        ...makeMonth(),
        ardaUserDetailsCardCount: 12,
      })
    ).toBe("ARDA_USER_DETAILS");
  });

  it("prefers discovered tenant ids over generic result payload ids", () => {
    expect(
      __test__.resolveArdaTenantIds(
        {
          tenantId: "northstar",
          configuredTenantId: "northstar",
          tenantName: "Northstar Chemical",
          companyName: "Northstar Chemical",
          customerName: "Northstar Chemical",
          oidcSubject: null,
          userDetailsCounts: null,
          customerStatus: "Active",
          health: null,
          mainCodaDocId: null,
          orderArchiveDocumentId: null,
          churned: false,
          resultTenantIds: ["11111111-1111-1111-1111-111111111111"],
        },
        new Map([
          [
            "northstar",
            ["22222222-2222-2222-2222-222222222222"],
          ],
        ])
      )
    ).toEqual(["22222222-2222-2222-2222-222222222222"]);
  });

  it("parses user-details rows from human-readable column names", () => {
    expect(
      __test__.parseArdaUserDetailsRow({
        values: {
          "Email Address": "ops@northstarchemical.com",
          "Tenant ID": "6fa02301-2cd9-4cfa-a258-40474b828945",
          "OIDC Subject": "subject-123",
          Summary: "Items: 4, Cards: 5, Orders: 6",
        },
      })
    ).toEqual({
      email: "ops@northstarchemical.com",
      tenantId: "6fa02301-2cd9-4cfa-a258-40474b828945",
      oidcSubject: "subject-123",
      counts: {
        items: 4,
        cards: 5,
        orders: 6,
      },
    });
  });

  it("uses POST pageToken pagination for Arda order queries", async () => {
    process.env.ARDA_API_BASE_URL = "https://arda.example";
    process.env.ARDA_API_TOKEN = "token-123";

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ rId: "order-1" }],
            nextPage: "page-2",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ rId: "order-2" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    global.fetch = fetchMock;

    const rows = await __test__.queryArdaCollection("order/order", "tenant-1", 1_716_000_000_000, "oidc-1");

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(firstUrl)).toBe(
      "https://arda.example/v1/order/order/query?effectiveasof=1716000000000&recordedasof=1716000000000"
    );
    expect(firstInit?.method).toBe("POST");
    expect(firstInit?.headers).toMatchObject({
      "X-Tenant-Id": "tenant-1",
      "X-oidc-subject": "oidc-1",
    });
    expect(JSON.parse(String(firstInit?.body))).toEqual({
      filter: true,
      paginate: { index: 0, size: 250 },
    });

    const [secondUrl, secondInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(secondUrl)).toBe(
      "https://arda.example/v1/order/order/query?effectiveasof=1716000000000&recordedasof=1716000000000"
    );
    expect(secondInit?.method).toBe("POST");
    expect(JSON.parse(String(secondInit?.body))).toEqual({
      filter: true,
      paginate: { index: 0, size: 250 },
      pageToken: "page-2",
    });
  });

  it("loads master order archive rows beyond the old 10-page Coda cap", async () => {
    process.env.CODA_API_TOKEN = "coda-token";
    process.env.CODA_RETENTION_DOC_ID = "doc_1";
    process.env.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID = "table_1";
    delete process.env.CODA_MASTER_ORDER_ARCHIVE_PAGE_LIMIT;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const pageToken = url.searchParams.get("pageToken");
      const pageNumber = pageToken ? Number(pageToken.replace("page-", "")) : 1;
      const nextPageToken = pageNumber < 11 ? `page-${pageNumber + 1}` : undefined;
      return new Response(
        JSON.stringify({
          items: [
            {
              id: `row-${pageNumber}`,
              values: {
                "Tenant ID": `tenant-${pageNumber}`,
                "Order Date": `2026-01-${String(pageNumber).padStart(2, "0")}T00:00:00.000Z`,
                Company: `Company ${pageNumber}`,
              },
              createdAt: `2026-01-${String(pageNumber).padStart(2, "0")}T00:00:00.000Z`,
            },
          ],
          nextPageToken,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    global.fetch = fetchMock;

    const rows = await __test__.loadCodaSourceRecords();

    expect(rows).toHaveLength(11);
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(rows[0]).toMatchObject({
      source: "CODA",
      objectType: "master_order_archive",
      externalId: "row-1",
      tenantKey: "tenant-1",
    });
    expect(rows.at(-1)).toMatchObject({
      externalId: "row-11",
      tenantKey: "tenant-11",
    });
  });
});
