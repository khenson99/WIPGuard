import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMercuryData } from "@/lib/analytics/fetchers";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mercury analytics fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("counts posted inflows and outflows beyond sent-only statuses", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            { id: "acct_1", name: "Operating", currentBalance: 10000, type: "checking" },
            { id: "acct_2", name: "Reserve", currentBalance: 5000, type: "savings" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { postedAt: "2026-02-10T10:00:00.000Z", status: "completed", amount: 1200 },
            { postedAt: "2026-02-11T10:00:00.000Z", status: "sent", amount: -700 },
            { postedAt: "2026-02-12T10:00:00.000Z", status: "pending", amount: -900 },
            { postedAt: "2026-03-02T10:00:00.000Z", status: "completed", amount: 300 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { createdAt: "2026-02-14T10:00:00.000Z", status: "settled", amount: 300 },
          ],
        }),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("mercury_test_key", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.accounts).toHaveLength(2);
    expect(data.cashFlow.totalBalance).toBe(15000);
    expect(data.cashFlow.inflows30d).toBe(1500);
    expect(data.cashFlow.outflows30d).toBe(700);
    expect(data.cashFlow.netCashFlow).toBe(800);
    expect(data.cashFlow.burnRate).toBe(0);

    const transactionUrls = fetchMock.mock.calls.slice(1).map((call) => String(call[0]));
    expect(transactionUrls.every((url) => url.includes("start=2026-02-01"))).toBe(true);
    expect(transactionUrls.every((url) => url.includes("end=2026-02-28"))).toBe(true);
  });

  it("excludes paired internal transfers from inflow and outflow totals", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            { id: "acct_1", name: "Operating", currentBalance: 10000, type: "checking" },
            { id: "acct_2", name: "Reserve", currentBalance: 5000, type: "savings" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { id: "tx_debit_internal", postedAt: "2026-02-10T10:00:00.000Z", status: "completed", amount: -4000, bankDescription: "Internal transfer" },
            { id: "tx_vendor", postedAt: "2026-02-11T10:00:00.000Z", status: "completed", amount: -700, bankDescription: "Vendor payment" },
            { id: "tx_customer", postedAt: "2026-02-12T10:00:00.000Z", status: "completed", amount: 1200, bankDescription: "Customer payment" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            { id: "tx_credit_internal", postedAt: "2026-02-10T10:00:00.000Z", status: "completed", amount: 4000, bankDescription: "Internal transfer" },
          ],
        }),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMercuryData("mercury_test_key", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.cashFlow.inflows30d).toBe(1200);
    expect(data.cashFlow.outflows30d).toBe(700);
    expect(data.cashFlow.netCashFlow).toBe(500);
    expect(data.cashFlow.burnRate).toBe(0);
  });
});
