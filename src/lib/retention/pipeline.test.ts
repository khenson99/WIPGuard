import { describe, expect, it } from "vitest";
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
});
