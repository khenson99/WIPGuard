import { describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  buildExpenseDashboard,
  normalizeExpenseDashboardCategory,
} from "@/lib/imladris/expense-dashboard";

function rawMercuryRecord(overrides: {
  id: string;
  objectType?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}) {
  return {
    id: overrides.id,
    provider: IntegrationProvider.MERCURY,
    objectType: overrides.objectType ?? "transaction",
    externalId: `mercury:${overrides.id}`,
    scopeKey: "org:org_1",
    sourceCreatedAt: null,
    sourceUpdatedAt: null,
    occurredAt: overrides.occurredAt ? new Date(overrides.occurredAt) : null,
    payload: overrides.payload,
    userId: "user_1",
    organizationId: "org_1",
  };
}

describe("expense dashboard data builder", () => {
  it("preserves finance-dashboard category policy for known WIPGuard vendors", () => {
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "Mercury Credit" })).toBe("transfer");
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "EWALLET - DIVVYP" })).toBe("transfer");
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "Elliott Equipment Company" })).toBe("refund");
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "Amazon Web Services" })).toBe("cloud");
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "Apple" })).toBe("hardware");
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "GrowthHit" })).toBe("marketing");
    expect(normalizeExpenseDashboardCategory({ counterpartyName: "Pillsbury Winthrop Shaw Pittman LLP" })).toBe("finance");
  });

  it("uses exact payroll amount overrides before owner reimbursement fallback", () => {
    expect(normalizeExpenseDashboardCategory({
      counterpartyName: "Elisha Eisen",
      amount: -6300,
      postedAt: "2026-03-02T12:00:00.000Z",
    })).toBe("payroll");
    expect(normalizeExpenseDashboardCategory({
      counterpartyName: "Elisha Eisen",
      amount: -200,
      postedAt: "2026-03-02T12:00:00.000Z",
    })).toBe("owner_reimbursement");
  });

  it("classifies reimbursements from merchant metadata instead of the owner name", () => {
    expect(normalizeExpenseDashboardCategory({
      counterpartyName: "Kyle Henson",
      description: "Reimbursement for expense at REDDIT INC ADS",
      bankDescription: "Expense Reimbursement",
      note: "REDDIT INC ADS",
    })).toBe("marketing");
    expect(normalizeExpenseDashboardCategory({
      counterpartyName: "Uriel Eisen",
      description: "Reimbursement for expense at Delaware Corporation and Tax",
      bankDescription: "Expense Reimbursement",
      note: "Kyle paid Delaware taxes with my credit card.",
    })).toBe("finance");
  });

  it("aggregates scoped Mercury raw records into the source dashboard data shape", async () => {
    const records = [
      rawMercuryRecord({
        id: "balance_checking",
        objectType: "account_balance",
        occurredAt: "2026-03-31T23:59:59.000Z",
        payload: { accountId: "checking", accountName: "Checking", balance: 100_000 },
      }),
      rawMercuryRecord({
        id: "tx_payroll",
        occurredAt: "2026-03-02T12:00:00.000Z",
        payload: {
          id: "tx_payroll",
          postedAt: "2026-03-02T12:00:00.000Z",
          amount: -6300,
          counterpartyName: "Elisha Eisen",
        },
      }),
      rawMercuryRecord({
        id: "tx_reimbursement",
        occurredAt: "2026-03-03T12:00:00.000Z",
        payload: {
          id: "tx_reimbursement",
          postedAt: "2026-03-03T12:00:00.000Z",
          amount: -43.6,
          counterpartyName: "Kyle Henson",
          description: "Reimbursement for expense at Lyft",
          bankDescription: "Expense Reimbursement",
          note: "LYFT ride",
        },
      }),
      rawMercuryRecord({
        id: "tx_cloud",
        occurredAt: "2026-03-04T12:00:00.000Z",
        payload: {
          id: "tx_cloud",
          postedAt: "2026-03-04T12:00:00.000Z",
          amount: -1200,
          counterpartyName: "Amazon Web Services",
          description: "AWS hosting invoice",
        },
      }),
      rawMercuryRecord({
        id: "tx_transfer",
        occurredAt: "2026-03-05T12:00:00.000Z",
        payload: {
          id: "tx_transfer",
          postedAt: "2026-03-05T12:00:00.000Z",
          amount: -900,
          counterpartyName: "Mercury Credit",
        },
      }),
      rawMercuryRecord({
        id: "tx_refund",
        occurredAt: "2026-03-06T12:00:00.000Z",
        payload: {
          id: "tx_refund",
          postedAt: "2026-03-06T12:00:00.000Z",
          amount: -500,
          counterpartyName: "Elliott Equipment Company",
        },
      }),
      rawMercuryRecord({
        id: "tx_inflow",
        occurredAt: "2026-03-07T12:00:00.000Z",
        payload: {
          id: "tx_inflow",
          postedAt: "2026-03-07T12:00:00.000Z",
          amount: 5000,
          counterpartyName: "Customer Wire",
        },
      }),
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.months).toEqual(["2026-03"]);
    expect(dashboard.categories).toEqual(["cloud", "payroll", "travel"]);
    expect(dashboard.categoryTotals).toEqual({
      cloud: 1200,
      payroll: 6300,
      travel: 43.6,
    });
    expect(dashboard.vendorTotals["Amazon Web Services"]).toBe(1200);
    expect(dashboard.vendorTotals["Mercury Credit"]).toBeUndefined();
    expect(dashboard.txnIndex["cloud|2026-03"]).toEqual([
      expect.objectContaining({
        vendor: "Amazon Web Services",
        amount: 1200,
        category: "cloud",
      }),
    ]);
    expect(dashboard.chartSeries).toEqual({
      operatingInflows: [5000],
      operatingOutflows: [7543.6],
      grossBurn: [7543.6],
      netBurn: [2543.6],
      runwayCash: 100000,
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        provider: IntegrationProvider.MERCURY,
        OR: expect.arrayContaining([
          { scopeKey: "global", userId: null, organizationId: null },
        ]),
      }),
    }));
  });

  it("ignores future balance timestamps when selecting runway cash", async () => {
    const records = [
      rawMercuryRecord({
        id: "balance_current",
        objectType: "account_balance",
        occurredAt: "2026-03-31T23:59:59.000Z",
        payload: { accountId: "checking", accountName: "Checking", balance: 100_000 },
      }),
      rawMercuryRecord({
        id: "balance_future_skew",
        objectType: "account_balance",
        occurredAt: "2099-01-01T00:00:00.000Z",
        payload: { accountId: "checking", accountName: "Checking", balance: 1_000 },
      }),
      rawMercuryRecord({
        id: "tx_cloud",
        occurredAt: "2026-03-04T12:00:00.000Z",
        payload: {
          id: "tx_cloud",
          postedAt: "2026-03-04T12:00:00.000Z",
          amount: -1200,
          counterpartyName: "Amazon Web Services",
          description: "AWS hosting invoice",
        },
      }),
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.chartSeries.runwayCash).toBe(100_000);
  });

  it("ignores balance records with malformed timestamps when selecting runway cash", async () => {
    const records = [
      {
        ...rawMercuryRecord({
          id: "balance_without_valid_timestamp",
          objectType: "account_balance",
          occurredAt: undefined,
          payload: { accountId: "checking", accountName: "Checking", balance: 100_000 },
        }),
        sourceUpdatedAt: "not-a-date",
        sourceCreatedAt: "also-not-a-date",
      },
      rawMercuryRecord({
        id: "tx_cloud",
        occurredAt: "2026-03-04T12:00:00.000Z",
        payload: {
          id: "tx_cloud",
          postedAt: "2026-03-04T12:00:00.000Z",
          amount: -1200,
          counterpartyName: "Amazon Web Services",
          description: "AWS hosting invoice",
        },
      }),
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.chartSeries.runwayCash).toBeUndefined();
  });

  it("ignores transactions whose payload posted date falls outside the requested range", async () => {
    const records = [
      rawMercuryRecord({
        id: "tx_current_cloud",
        occurredAt: "2026-03-04T12:00:00.000Z",
        payload: {
          id: "tx_current_cloud",
          postedAt: "2026-03-04T12:00:00.000Z",
          amount: -1200,
          counterpartyName: "Amazon Web Services",
          description: "AWS hosting invoice",
        },
      }),
      rawMercuryRecord({
        id: "tx_future_payload_date",
        occurredAt: "2026-03-05T12:00:00.000Z",
        payload: {
          id: "tx_future_payload_date",
          postedAt: "2099-01-01T00:00:00.000Z",
          amount: -99_000,
          counterpartyName: "OpenAI",
          description: "Future-dated software invoice",
        },
      }),
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.months).toEqual(["2026-03"]);
    expect(dashboard.categoryTotals).toEqual({ cloud: 1200 });
    expect(dashboard.vendorTotals.OpenAI).toBeUndefined();
  });

  it("queries global Mercury raw-record fallback for organization expense dashboards", async () => {
    const records = [
      {
        ...rawMercuryRecord({
          id: "global_balance",
          objectType: "account_balance",
          occurredAt: "2026-03-31T23:59:59.000Z",
          payload: { accountId: "checking", accountName: "Checking", balance: 75_000 },
        }),
        scopeKey: "global",
        userId: null,
        organizationId: null,
      },
      {
        ...rawMercuryRecord({
          id: "global_cloud",
          occurredAt: "2026-03-04T12:00:00.000Z",
          payload: {
            id: "global_cloud",
            postedAt: "2026-03-04T12:00:00.000Z",
            amount: -1200,
            counterpartyName: "Amazon Web Services",
            description: "AWS hosting invoice",
          },
        }),
        scopeKey: "global",
        userId: null,
        organizationId: null,
      },
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.categoryTotals).toEqual({ cloud: 1200 });
    expect(dashboard.chartSeries.runwayCash).toBe(75_000);
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { scopeKey: "global", userId: null, organizationId: null },
        ]),
      }),
    }));
  });

  it("queries global Mercury raw-record fallback for user-only expense dashboards", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: " user_1 ", organizationId: "   " },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { scopeKey: "user:user_1", userId: "user_1" },
          { scopeKey: "global", userId: null, organizationId: null },
        ],
      }),
    }));
  });

  it("ignores wrong-scope Mercury raw records returned by the data layer", async () => {
    const records = [
      rawMercuryRecord({
        id: "tx_valid_cloud",
        occurredAt: "2026-03-04T12:00:00.000Z",
        payload: {
          id: "tx_valid_cloud",
          postedAt: "2026-03-04T12:00:00.000Z",
          amount: -1200,
          counterpartyName: "Amazon Web Services",
          description: "AWS hosting invoice",
        },
      }),
      {
        ...rawMercuryRecord({
          id: "tx_wrong_org_marketing",
          occurredAt: "2026-03-05T12:00:00.000Z",
          payload: {
            id: "tx_wrong_org_marketing",
            postedAt: "2026-03-05T12:00:00.000Z",
            amount: -99_000,
            counterpartyName: "GrowthHit",
          },
        }),
        scopeKey: "org:other_org",
        userId: "other_user",
        organizationId: "other_org",
      },
      {
        ...rawMercuryRecord({
          id: "tx_wrong_user_software",
          occurredAt: "2026-03-06T12:00:00.000Z",
          payload: {
            id: "tx_wrong_user_software",
            postedAt: "2026-03-06T12:00:00.000Z",
            amount: -75_000,
            counterpartyName: "OpenAI",
          },
        }),
        scopeKey: "user:other_user",
        userId: "other_user",
        organizationId: null,
      },
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.categoryTotals).toEqual({ cloud: 1200 });
    expect(dashboard.vendorTotals).toEqual({ "Amazon Web Services": 1200 });
    expect(dashboard.vendorTotals.GrowthHit).toBeUndefined();
    expect(dashboard.vendorTotals.OpenAI).toBeUndefined();
  });

  it("loads legacy mixed-case Mercury object types before aggregating expenses", async () => {
    const records = [
      rawMercuryRecord({
        id: "legacy_balance",
        objectType: "AccountBalance",
        occurredAt: "2026-03-31T23:59:59.000Z",
        payload: { accountId: "checking", accountName: "Checking", balance: 88_000 },
      }),
      rawMercuryRecord({
        id: "legacy_transaction",
        objectType: "BankTransaction",
        occurredAt: "2026-03-04T12:00:00.000Z",
        payload: {
          id: "legacy_transaction",
          postedAt: "2026-03-04T12:00:00.000Z",
          amount: -1200,
          counterpartyName: "Amazon Web Services",
          description: "AWS hosting invoice",
        },
      }),
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => records),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        objectType: { in: expect.arrayContaining(["BankTransaction", "AccountBalance"]) },
      }),
    }));
    expect(dashboard.categoryTotals).toEqual({ cloud: 1200 });
    expect(dashboard.chartSeries.runwayCash).toBe(88_000);
  });

  it("normalizes numeric provider timestamps before monthly expense aggregation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          rawMercuryRecord({
            id: "tx_numeric_cloud",
            occurredAt: undefined,
            payload: {
              id: "tx_numeric_cloud",
              postedAt: "1772632800.5",
              amount: "-1200",
              counterpartyName: "Amazon Web Services",
              description: "AWS hosting invoice",
            },
          }),
          {
            ...rawMercuryRecord({
              id: "balance_numeric",
              objectType: "account_balance",
              occurredAt: undefined,
              payload: { accountId: "checking", accountName: "Checking", balance: "100000" },
            }),
            sourceUpdatedAt: "1775087999.25",
          },
        ]),
      },
    };

    const dashboard = await buildExpenseDashboard({
      prisma: prisma as never,
      context: { userId: "user_1", organizationId: "org_1" },
      range: "180d",
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(dashboard.months).toEqual(["2026-03"]);
    expect(dashboard.categoryMonthly.cloud).toEqual({ "2026-03": 1200 });
    expect(dashboard.txnIndex["cloud|2026-03"]).toEqual([
      expect.objectContaining({
        date: "2026-03-04",
        amount: 1200,
      }),
    ]);
    expect(dashboard.chartSeries.runwayCash).toBe(100_000);
  });
});
