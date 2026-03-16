import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMercuryData } from "@/lib/analytics/fetchers";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("analytics mercury fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("counts posted cash movements beyond only sent transactions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "acct_1",
              name: "Operating",
              currentBalance: 12000,
              type: "checking",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/account/acct_1/transactions") {
        expect(url.searchParams.get("start")).toBe("2026-02-01");
        expect(url.searchParams.get("limit")).toBe("500");

        return jsonResponse({
          transactions: [
            {
              postedAt: "2026-02-03T00:00:00.000Z",
              status: "posted",
              amount: 500,
            },
            {
              postedAt: "2026-02-04T00:00:00.000Z",
              status: "posted",
              amount: -200,
              counterpartyName: "Google Ads",
            },
            {
              postedAt: "2026-02-05T00:00:00.000Z",
              status: "sent",
              amount: -50,
              counterpartyName: "Mercury fee",
            },
            {
              postedAt: "2026-02-08T00:00:00.000Z",
              status: "posted",
              amount: -125,
              categoryData: {
                categoryDataName: "Payroll",
              },
            },
            {
              postedAt: "2026-02-06T00:00:00.000Z",
              status: "cancelled",
              amount: -300,
            },
            {
              postedAt: "2026-02-07T00:00:00.000Z",
              amount: 100,
            },
            {
              postedAt: "2026-03-02T00:00:00.000Z",
              status: "posted",
              amount: -400,
            },
          ],
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("mercury_test_123", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.accounts).toEqual([
      {
        accountId: "acct_1",
        accountName: "Operating",
        balance: 12000,
        type: "checking",
      },
    ]);
    expect(data.cashFlow.totalBalance).toBe(12000);
    expect(data.cashFlow.inflows30d).toBe(642.86);
    expect(data.cashFlow.outflows30d).toBe(401.79);
    expect(data.cashFlow.netCashFlow).toBe(241.07);
    expect(data.cashFlow.burnRate).toBe(0);
    expect(data.cashFlow.runway).toBe(999);
    expect(data.cashFlow.observedPeriodDays).toBe(28);
    expect(data.cashFlow.observedInflowTotal).toBe(600);
    expect(data.cashFlow.observedOutflowTotal).toBe(375);
    expect(data.cashFlow.observedNetCashFlow).toBe(225);
    expect(data.cashFlow.expenseBreakdown30d).toEqual({
      cogs: 0,
      payroll: 133.92857142857142,
      marketing: 214.28571428571428,
      infrastructure: 0,
      ops: 53.57142857142857,
      other: 0,
    });
    expect(data.cashFlow.observedExpenseBreakdown).toEqual({
      cogs: 0,
      payroll: 125,
      marketing: 200,
      infrastructure: 0,
      ops: 50,
      other: 0,
    });
  });

  it("paginates Mercury accounts and transaction pages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        const startAfter = url.searchParams.get("start_after");
        if (!startAfter) {
          expect(url.searchParams.get("limit")).toBe("500");
          return jsonResponse({
            accounts: [
              {
                id: "acct_1",
                name: "Operating",
                currentBalance: 1000,
                type: "checking",
              },
            ],
            paging: {
              next: {
                start_after: "acct_1",
              },
            },
          });
        }

        expect(startAfter).toBe("acct_1");
        return jsonResponse({
          accounts: [
            {
              id: "acct_2",
              name: "Reserve",
              currentBalance: 2000,
              type: "savings",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/account/acct_1/transactions") {
        const startAfter = url.searchParams.get("start_after");
        expect(url.searchParams.get("start")).toBe("2026-02-01");
        expect(url.searchParams.get("limit")).toBe("500");

        if (!startAfter) {
          return jsonResponse({
            transactions: [
              {
                id: "tx_1",
                postedAt: "2026-02-03T00:00:00.000Z",
                status: "posted",
                amount: 400,
              },
            ],
            paging: {
              next: {
                start_after: "tx_1",
              },
            },
          });
        }

        expect(startAfter).toBe("tx_1");
        return jsonResponse({
          transactions: [
            {
              id: "tx_2",
              postedAt: "2026-02-04T00:00:00.000Z",
              status: "posted",
              amount: -150,
              counterpartyName: "AWS",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/account/acct_2/transactions") {
        expect(url.searchParams.get("start")).toBe("2026-02-01");
        expect(url.searchParams.get("limit")).toBe("500");
        expect(url.searchParams.get("start_after")).toBeNull();

        return jsonResponse({
          transactions: [
            {
              id: "tx_3",
              postedAt: "2026-02-05T00:00:00.000Z",
              status: "posted",
              amount: -50,
              counterpartyName: "Mercury fee",
            },
          ],
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("mercury_test_123", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.accounts).toEqual([
      {
        accountId: "acct_1",
        accountName: "Operating",
        balance: 1000,
        type: "checking",
      },
      {
        accountId: "acct_2",
        accountName: "Reserve",
        balance: 2000,
        type: "savings",
      },
    ]);
    expect(data.cashFlow.totalBalance).toBe(3000);
    expect(data.cashFlow.inflows30d).toBe(428.57);
    expect(data.cashFlow.outflows30d).toBe(214.29);
    expect(data.cashFlow.netCashFlow).toBe(214.29);
    expect(data.cashFlow.observedPeriodDays).toBe(28);
    expect(data.cashFlow.observedInflowTotal).toBe(400);
    expect(data.cashFlow.observedOutflowTotal).toBe(200);
    expect(data.cashFlow.observedNetCashFlow).toBe(200);
    expect(data.cashFlow.expenseBreakdown30d).toEqual({
      cogs: 160.71428571428572,
      payroll: 0,
      marketing: 0,
      infrastructure: 0,
      ops: 53.57142857142857,
      other: 0,
    });
    expect(data.cashFlow.observedExpenseBreakdown).toEqual({
      cogs: 150,
      payroll: 0,
      marketing: 0,
      infrastructure: 0,
      ops: 50,
      other: 0,
    });
  });

  it("fails instead of returning partial data when a later Mercury transaction page errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "acct_1",
              name: "Operating",
              currentBalance: 1000,
              type: "checking",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/account/acct_1/transactions") {
        const startAfter = url.searchParams.get("start_after");
        if (!startAfter) {
          return jsonResponse({
            transactions: [
              {
                id: "tx_1",
                postedAt: "2026-02-03T00:00:00.000Z",
                status: "posted",
                amount: 400,
              },
            ],
            paging: {
              next: {
                start_after: "tx_1",
              },
            },
          });
        }

        expect(startAfter).toBe("tx_1");
        return jsonResponse({ error: "rate limited" }, 429);
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchMercuryData("mercury_test_123", {
        fromDate: new Date("2026-02-01T00:00:00.000Z"),
        toDate: new Date("2026-02-28T23:59:59.999Z"),
      }),
    ).rejects.toThrow("Mercury transactions error 429");
  });

  it("normalizes burn rate and runway to monthly equivalents for longer ranges", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "acct_1",
              name: "Operating",
              currentBalance: 12000,
              type: "checking",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/account/acct_1/transactions") {
        expect(url.searchParams.get("start")).toBe("2026-01-01");
        return jsonResponse({
          transactions: [
            {
              id: "tx_1",
              postedAt: "2026-01-15T00:00:00.000Z",
              status: "posted",
              amount: 100,
            },
            {
              id: "tx_2",
              postedAt: "2026-03-20T00:00:00.000Z",
              status: "posted",
              amount: -1000,
              counterpartyName: "AWS",
            },
          ],
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("mercury_test_123", {
      fromDate: new Date("2026-01-01T00:00:00.000Z"),
      toDate: new Date("2026-03-31T23:59:59.999Z"),
    });

    expect(data.cashFlow.inflows30d).toBe(33.33);
    expect(data.cashFlow.outflows30d).toBe(333.33);
    expect(data.cashFlow.netCashFlow).toBe(-300);
    expect(data.cashFlow.observedPeriodDays).toBe(90);
    expect(data.cashFlow.observedInflowTotal).toBe(100);
    expect(data.cashFlow.observedOutflowTotal).toBe(1000);
    expect(data.cashFlow.observedNetCashFlow).toBe(-900);
    expect(data.cashFlow.burnRate).toBe(300);
    expect(data.cashFlow.runway).toBe(40);
  });

  it("prefers explicit Mercury expense mappings over keyword heuristics", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "acct_1",
              name: "Operating",
              currentBalance: 12000,
              type: "checking",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/account/acct_1/transactions") {
        return jsonResponse({
          transactions: [
            {
              id: "tx_1",
              postedAt: "2026-02-10T00:00:00.000Z",
              status: "posted",
              amount: -200,
              counterpartyName: "Google Ads",
            },
          ],
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("mercury_test_123", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
      expenseMappings: [
        { match: "google ads", category: "ops" },
      ],
    });

    expect(data.cashFlow.observedExpenseBreakdown).toEqual({
      cogs: 0,
      payroll: 0,
      marketing: 0,
      infrastructure: 0,
      ops: 200,
      other: 0,
    });
  });
});
