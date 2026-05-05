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
            { id: "vendor", status: "sent", kind: "outgoingPayment", amount: -2_000 },
            { id: "card", status: "sent", kind: "debitCardTransaction", amount: -100 },
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

    const transactionsUrl = String(fetchMock.mock.calls[2]?.[0] ?? "");
    expect(transactionsUrl).toContain("/transactions?");
    expect(transactionsUrl).toContain("postedStart=2026-04-01");
    expect(transactionsUrl).toContain("postedEnd=2026-04-30");
    expect(transactionsUrl).toContain("status=sent");
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
});
