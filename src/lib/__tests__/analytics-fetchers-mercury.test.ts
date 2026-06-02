import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMercuryData } from "@/lib/analytics/fetchers";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Mercury analytics fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes Mercury Treasury in cash balance and excludes Treasury sweeps from cash flow", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: 79_717.54,
              type: "mercury",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              id: "treasury-1",
              status: "active",
              currentBalance: 2_478_334.94,
              availableBalance: 2_478_334.94,
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { id: "sweep-out", status: "sent", kind: "treasuryTransfer", amount: -425_000 },
            { id: "sweep-in", status: "sent", kind: "treasuryTransfer", amount: 425_000 },
            { id: "internal-out", status: "sent", kind: "internalTransfer", amount: -10_000 },
            { id: "internal-in", status: "sent", kind: "internalTransfer", amount: 10_000 },
            { id: "wire-in", status: "sent", kind: "incomingDomesticWire", amount: 500 },
            {
              id: "vendor",
              status: "sent",
              kind: "outgoingPayment",
              amount: -2_000,
              description: "Gusto payroll",
              counterpartyName: "Gusto",
            },
            {
              id: "card",
              status: "sent",
              kind: "debitCardTransaction",
              amount: -100,
              bankDescription: "Vercel",
            },
            { id: "pending", status: "pending", kind: "outgoingPayment", amount: -999 },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });

    expect(data.accounts).toEqual([
      {
        accountId: "checking-1",
        accountName: "Mercury Checking",
        balance: 79_717.54,
        type: "mercury",
      },
      {
        accountId: "treasury-1",
        accountName: "Mercury Treasury",
        balance: 2_478_334.94,
        type: "treasury",
      },
    ]);
    expect(data.cashFlow.totalBalance).toBeCloseTo(2_558_052.48);
    expect(data.cashFlow.bankCash).toBeCloseTo(79_717.54);
    expect(data.cashFlow.treasuryCash).toBeCloseTo(2_478_334.94);
    expect(data.cashFlow.totalCash).toBeCloseTo(2_558_052.48);
    expect(data.cashFlow.inflows30d).toBe(500);
    expect(data.cashFlow.outflows30d).toBe(2_100);
    expect(data.cashFlow.netCashFlow).toBe(-1_600);
    expect(data.cashFlow.burnRate).toBe(1_600);
    expect(data.transactions).toEqual([
      expect.objectContaining({ id: "wire-in", amount: 500 }),
      expect.objectContaining({
        id: "vendor",
        amount: -2_000,
        description: "Gusto payroll",
        counterpartyName: "Gusto",
      }),
      expect.objectContaining({
        id: "card",
        amount: -100,
        bankDescription: "Vercel",
      }),
    ]);

    const transactionsUrl = String(fetchMock.mock.calls[2]?.[0] ?? "");
    expect(transactionsUrl).toContain("/transactions?");
    expect(transactionsUrl).toContain("postedStart=2026-04-01");
    expect(transactionsUrl).toContain("postedEnd=2026-04-30");
    expect(transactionsUrl).toContain("status=sent");
  });

  it("preserves Mercury cash balances and cash flow when numeric fields arrive as strings", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: "79,717.54",
              type: "mercury",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              id: "treasury-1",
              status: "active",
              currentBalance: "$2,478,334.94",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            {
              id: "wire-in",
              status: "sent",
              kind: "incomingDomesticWire",
              amount: "500.25",
            },
            {
              id: "vendor",
              status: "sent",
              kind: "outgoingPayment",
              amount: "-2,000.50",
            },
            {
              id: "bad",
              status: "sent",
              kind: "outgoingPayment",
              amount: "not-a-number",
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });

    expect(data.accounts).toEqual([
      expect.objectContaining({ accountId: "checking-1", balance: 79_717.54 }),
      expect.objectContaining({ accountId: "treasury-1", balance: 2_478_334.94 }),
    ]);
    expect(data.cashFlow.bankCash).toBeCloseTo(79_717.54);
    expect(data.cashFlow.treasuryCash).toBeCloseTo(2_478_334.94);
    expect(data.cashFlow.totalCash).toBeCloseTo(2_558_052.48);
    expect(data.cashFlow.inflows30d).toBeCloseTo(500.25);
    expect(data.cashFlow.outflows30d).toBeCloseTo(2_000.5);
    expect(data.cashFlow.netCashFlow).toBeCloseTo(-1_500.25);
    expect(data.cashFlow.burnRate).toBeCloseTo(1_500.25);
    expect(data.transactions).toEqual([
      expect.objectContaining({ id: "wire-in", amount: 500.25 }),
      expect.objectContaining({ id: "vendor", amount: -2_000.5 }),
    ]);
  });

  it("falls back to account transactions when the global transactions endpoint is unavailable", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: 10_000,
              type: "mercury",
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }, 403))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { status: "sent", kind: "treasuryTransfer", amount: 5_000 },
            { status: "sent", kind: "outgoingPayment", amount: -1_250 },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });

    expect(data.cashFlow.totalBalance).toBe(10_000);
    expect(data.cashFlow.bankCash).toBe(10_000);
    expect(data.cashFlow.treasuryCash).toBe(0);
    expect(data.cashFlow.totalCash).toBe(10_000);
    expect(data.cashFlow.inflows30d).toBe(0);
    expect(data.cashFlow.outflows30d).toBe(1_250);
    expect(data.cashFlow.burnRate).toBe(1_250);
    expect(String(fetchMock.mock.calls[3]?.[0] ?? "")).toContain(
      "/account/checking-1/transactions"
    );
  });

  it("bypasses fetch cache for every Mercury API request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: 10_000,
              type: "mercury",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/treasury") {
        return jsonResponse({ accounts: [] });
      }

      if (url.pathname === "/api/v1/transactions") {
        return jsonResponse({ error: "global unavailable" }, 500);
      }

      if (url.pathname === "/api/v1/account/checking-1/transactions") {
        return jsonResponse({
          transactions: [
            {
              id: "acct_tx_1",
              status: "sent",
              kind: "outgoingPayment",
              amount: -250,
            },
          ],
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const calls = fetchMock.mock.calls as unknown as Array<[
      RequestInfo | URL,
      RequestInit | undefined,
    ]>;
    for (const [, init] of calls) {
      expect(init).toEqual(expect.objectContaining({
        cache: "no-store",
      }));
    }
  });

  it("paginates Mercury bank accounts before computing cash balances", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        const startAfter = url.searchParams.get("start_after");
        if (startAfter === "checking-1000") {
          return jsonResponse({
            accounts: [
              {
                id: "checking-1001",
                name: "Mercury Checking 1001",
                currentBalance: 1,
                type: "mercury",
              },
            ],
          });
        }

        return jsonResponse({
          accounts: Array.from({ length: 1000 }, (_, index) => ({
            id: `checking-${index + 1}`,
            name: `Mercury Checking ${index + 1}`,
            currentBalance: 1,
            type: "mercury",
          })),
        });
      }

      if (url.pathname === "/api/v1/treasury") {
        return jsonResponse({ accounts: [] });
      }

      if (url.pathname === "/api/v1/transactions") {
        return jsonResponse({ transactions: [] });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });
    const accountRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/v1/accounts");

    expect(accountRequests).toHaveLength(2);
    expect(accountRequests[0]?.searchParams.get("limit")).toBe("1000");
    expect(accountRequests[1]?.searchParams.get("start_after")).toBe("checking-1000");
    expect(data.accounts).toHaveLength(1001);
    expect(data.cashFlow.bankCash).toBe(1001);
    expect(data.cashFlow.totalCash).toBe(1001);
  });

  it("continues paginating global transactions beyond 10 pages before computing cash flow", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: 10_000,
              type: "mercury",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/treasury") {
        return jsonResponse({ accounts: [] });
      }

      if (url.pathname === "/api/v1/transactions") {
        const startAfter = url.searchParams.get("start_after");
        const page = startAfter
          ? Number(startAfter.match(/^tx_(\d+)_1000$/)?.[1] ?? 0) + 1
          : 1;
        if (!page) {
          return jsonResponse({ transactions: [] });
        }

        return jsonResponse({
          transactions: Array.from({ length: page < 11 ? 1000 : 1 }, (_, index) => ({
              id: `tx_${page}_${index + 1}`,
              status: "sent",
              kind: "outgoingPayment",
              amount: -1,
            })),
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });
    const transactionRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/v1/transactions");

    expect(transactionRequests).toHaveLength(11);
    expect(transactionRequests.at(-1)?.searchParams.get("start_after")).toBe("tx_10_1000");
    expect(data.cashFlow.outflows30d).toBe(10_001);
    expect(data.transactions).toHaveLength(10_001);
  });

  it("marks Mercury payloads truncated when global transaction pagination reaches the page cap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: 10_000,
              type: "mercury",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/treasury") {
        return jsonResponse({ accounts: [] });
      }

      if (url.pathname === "/api/v1/transactions") {
        return jsonResponse({
          transactions: Array.from({ length: 1000 }, (_, index) => ({
            id: `tx_${index + 1}`,
            status: "sent",
            kind: "outgoingPayment",
            amount: -1,
          })),
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
      maxPages: 1,
    });
    const transactionRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/v1/transactions");

    expect(transactionRequests).toHaveLength(1);
    expect(data.transactions).toHaveLength(1000);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["globalTransactions"],
    }));
  });

  it("paginates account transaction fallback with offsets before computing cash flow", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/accounts") {
        return jsonResponse({
          accounts: [
            {
              id: "checking-1",
              name: "Mercury Checking",
              currentBalance: 10_000,
              type: "mercury",
            },
          ],
        });
      }

      if (url.pathname === "/api/v1/treasury") {
        return jsonResponse({ accounts: [] }, 403);
      }

      if (url.pathname === "/api/v1/transactions") {
        return jsonResponse({ error: "global unavailable" }, 500);
      }

      if (url.pathname === "/api/v1/account/checking-1/transactions") {
        const offset = url.searchParams.get("offset") ?? "0";
        return jsonResponse({
          transactions: Array.from({ length: offset === "500" ? 1 : 500 }, (_, index) => ({
            id: `acct_${offset}_${index + 1}`,
            status: "sent",
            kind: "outgoingPayment",
            amount: -1,
          })),
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("token", {
      fromDate: new Date("2026-04-01T00:00:00.000Z"),
      toDate: new Date("2026-04-30T23:59:59.999Z"),
    });
    const accountTransactionRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/v1/account/checking-1/transactions");

    expect(accountTransactionRequests).toHaveLength(2);
    expect(accountTransactionRequests[0]?.searchParams.get("status")).toBe("sent");
    expect(accountTransactionRequests[0]?.searchParams.get("end")).toBe("2026-04-30");
    expect(accountTransactionRequests[1]?.searchParams.get("offset")).toBe("500");
    expect(data.cashFlow.outflows30d).toBe(501);
    expect(data.transactions).toHaveLength(501);
  });
});
