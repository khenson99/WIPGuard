import { afterEach, describe, expect, it, vi } from "vitest";
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
    orderEvents: [],
    cardTouches: 0,
    itemTouches: 0,
    itemEvents: [],
    itemKeys: new Set<string>(),
    orderedItemKeys: new Set<string>(),
    activeCardCount: 0,
    activeItemCount: 0,
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
  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("treats a missing Coda table as an empty source instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), { status: 404, statusText: "Not Found" })) as
        unknown as typeof fetch
    );

    await expect(__test__.fetchCodaApiRows("doc123", "table123", "token123", 1)).resolves.toEqual([]);
  });

  it("sends a fresh Arda request id on collection query requests", async () => {
    vi.stubEnv("ARDA_API_BASE_URL", "https://arda.example.test");
    vi.stubEnv("ARDA_API_TOKEN", "token123");
    vi.stubEnv("ARDA_API_AUTHOR", "author_1");

    const requests: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          headers: new Headers(init?.headers),
        });
        return new Response(
          JSON.stringify({
            results: [],
            nextPage: null,
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    );

    await expect(
      (
        __test__ as {
          queryArdaCollection: (
            endpoint: string,
            tenantId: string,
            asOfMs: number,
          ) => Promise<unknown>;
        }
      ).queryArdaCollection("order/order", "tenant_1", Date.parse("2026-03-15T00:00:00.000Z")),
    ).resolves.toEqual([]);

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("X-Request-ID")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(requests[0].headers.get("X-Tenant-Id")).toBe("tenant_1");
  });

  it("derives persisted Coda external refs from latest Arda tenant metadata", () => {
    expect(
      __test__.buildDerivedCodaExternalRefsFromSourceRecords([
        {
          customerRecordId: "customer_1",
          source: "ARDA",
          objectType: "tenant",
          payload: {
            mainCodaDocId: "VYLC2rzPN_",
            orderArchiveDocumentId: "cgSn33D4N9",
          },
        },
      ])
    ).toEqual([
      {
        customerRecordId: "customer_1",
        provider: "CODA",
        externalObjectType: "doc",
        externalId: "VYLC2rzPN_",
        label: "Customer Success and Implementation",
        isPrimary: true,
        metadata: {
          docUrl: "https://coda.io/d/_dVYLC2rzPN_",
          source: "retention_arda_tenant",
        },
      },
      {
        customerRecordId: "customer_1",
        provider: "CODA",
        externalObjectType: "order_archive_doc",
        externalId: "cgSn33D4N9",
        label: "Master Order Archive",
        isPrimary: false,
        metadata: {
          docUrl: "https://coda.io/d/_dcgSn33D4N9",
          source: "retention_arda_tenant",
        },
      },
    ]);
  });

  it("keeps Arda tenant configs with a company name even when tenantId is blank", () => {
    expect(
      __test__.normalizeArdaTenantConfigRow({
        values: {
          tenantId: "",
          CompanyName: "Lights Out Manufacturing",
          "Customer status": "Live",
          mainCodaDocId: "fphF1v7jCB",
          orderArchiveDocumentId: "cgSn33D4N9",
        },
      })
    ).toEqual({
      tenantId: "",
      configuredTenantId: "",
      tenantName: "Lights Out Manufacturing",
      companyName: "Lights Out Manufacturing",
      customerName: null,
      customerStatus: "Live",
      health: null,
      mainCodaDocId: "fphF1v7jCB",
      orderArchiveDocumentId: "cgSn33D4N9",
      churned: false,
      resultTenantIds: [],
    });
  });

  it("keeps unresolved Arda tenant configs as metadata-only rows", () => {
    expect(
      __test__.materializeArdaTenantConfigs(
        [
          {
            tenantId: "",
            configuredTenantId: "",
            tenantName: "Lights Out Manufacturing",
            companyName: "Lights Out Manufacturing",
            customerName: null,
            customerStatus: "Live",
            health: "Healthy",
            mainCodaDocId: "fphF1v7jCB",
            orderArchiveDocumentId: "cgSn33D4N9",
            churned: false,
            resultTenantIds: [],
          },
        ],
        new Map()
      )
    ).toEqual([
      {
        tenantId: "baa1f883-ecfa-4912-b5be-d5784d8b96a4",
        configuredTenantId: "",
        tenantName: "Lights Out Manufacturing",
        companyName: "Lights Out Manufacturing",
        customerName: null,
        customerStatus: "Live",
        health: "Healthy",
        mainCodaDocId: "fphF1v7jCB",
        orderArchiveDocumentId: "cgSn33D4N9",
        churned: false,
        resultTenantIds: [],
        tenantIdResolved: true,
      },
    ]);

    expect(
      __test__.materializeArdaTenantConfigs(
        [
          {
            tenantId: "",
            configuredTenantId: "",
            tenantName: "Unknown Shop",
            companyName: "Unknown Shop",
            customerName: null,
            customerStatus: "Live",
            health: null,
            mainCodaDocId: "doc_unknown",
            orderArchiveDocumentId: null,
            churned: false,
            resultTenantIds: [],
          },
        ],
        new Map()
      )
    ).toEqual([
      {
        tenantId: "unknownshop",
        configuredTenantId: "",
        tenantName: "Unknown Shop",
        companyName: "Unknown Shop",
        customerName: null,
        customerStatus: "Live",
        health: null,
        mainCodaDocId: "doc_unknown",
        orderArchiveDocumentId: null,
        churned: false,
        resultTenantIds: [],
        tenantIdResolved: false,
      },
    ]);
  });
});
