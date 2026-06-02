import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStripeChargesByCustomer, fetchStripeData } from "@/lib/analytics/fetchers";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("analytics stripe fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw when charges include succeeded payments", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        return jsonResponse({ data: [], has_more: false });
      }

      if (url.pathname === "/v1/charges") {
        return jsonResponse({
          data: [
            {
              id: "ch_1",
              amount: 5000,
              created: 1_700_000_000,
              status: "succeeded",
            },
          ],
          has_more: false,
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchStripeData("sk_test_123", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.revenue.totalRevenue30d).toBe(50);
    expect(data.payments.succeeded).toBe(1);
    expect(data.payments.failed).toBe(0);
  });

  it("preserves Stripe revenue metrics when monetary fields arrive as formatted strings", async () => {
    const fromDate = new Date("2026-02-01T00:00:00.000Z");
    const toDate = new Date("2026-02-28T23:59:59.999Z");
    const currentStart = String(Math.floor(fromDate.getTime() / 1000));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        const status = url.searchParams.get("status");

        if (status === "active") {
          return jsonResponse({
            data: [
              {
                id: "sub_active_1",
                customer: { id: "cus_active", email: "Buyer@example.com" },
                canceled_at: null,
                items: {
                  data: [
                    {
                      price: {
                        unit_amount: "$12,000",
                        recurring: { interval: "month", interval_count: 1 },
                      },
                    },
                  ],
                },
              },
            ],
            has_more: false,
          });
        }

        if (status === "canceled") {
          return jsonResponse({
            data: [
              {
                id: "sub_canceled_1",
                customer: "cus_churned",
                canceled_at: 1_700_000_100,
                items: {
                  data: [
                    {
                      price: {
                        unit_amount: "4,000",
                        recurring: { interval: "month", interval_count: 1 },
                      },
                    },
                  ],
                },
              },
            ],
            has_more: false,
          });
        }

        return jsonResponse({ data: [], has_more: false });
      }

      if (url.pathname === "/v1/charges") {
        const isCurrentRange = url.searchParams.get("created[gte]") === currentStart;
        return jsonResponse({
          data: [
            {
              id: isCurrentRange ? "ch_current" : "ch_previous",
              amount: isCurrentRange ? "5,000" : "2,500",
              created: isCurrentRange ? currentStart : 1_700_000_000,
              status: "succeeded",
            },
            {
              id: isCurrentRange ? "ch_bad_current" : "ch_bad_previous",
              amount: "not-a-number",
              created: isCurrentRange ? currentStart : 1_700_000_000,
              status: "succeeded",
            },
          ],
          has_more: false,
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchStripeData("sk_test_123", { fromDate, toDate });

    expect(data.revenue.mrr).toBe(120);
    expect(data.revenue.avgRevenuePerCustomer).toBe(120);
    expect(data.revenue.totalRevenue30d).toBe(50);
    expect(data.revenue.totalRevenuePrev30d).toBe(25);
    expect(data.revenue.revenueGrowth).toBe(100);
    expect(data.subscriptions.recentChurnEvents).toEqual([
      {
        customer: "cus_churned",
        canceledAt: new Date(1_700_000_100 * 1000).toISOString(),
        amount: 40,
      },
    ]);
    expect(data.revenueTrend).toEqual([{ month: "2026-02-01", revenue: 50 }]);
  });

  it("preserves Stripe customer charge net amounts when monetary fields arrive as formatted strings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/charges") {
        return jsonResponse({
          data: [
            {
              id: "ch_1",
              amount: "2,500",
              amount_refunded: "500",
              created: 1_700_000_000,
              currency: "usd",
              status: "succeeded",
              paid: true,
            },
          ],
          has_more: false,
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const charges = await fetchStripeChargesByCustomer("sk_test_123", [
      {
        customerId: "cus_123",
        createdGte: new Date("2026-01-01T00:00:00.000Z"),
        createdLte: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    expect(charges.cus_123).toEqual([
      {
        chargeId: "ch_1",
        created: 1_700_000_000,
        currency: "usd",
        netAmountCents: 2_000,
      },
    ]);
  });

  it("counts past_due and trialing subscriptions by paginating results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        const status = url.searchParams.get("status");
        const startingAfter = url.searchParams.get("starting_after");

        if (status === "active") {
          return jsonResponse({ data: [], has_more: false });
        }

        if (status === "canceled") {
          return jsonResponse({ data: [], has_more: false });
        }

        if (status === "past_due") {
          if (!startingAfter) {
            return jsonResponse({
              data: [{ id: "sub_pd_1" }, { id: "sub_pd_2" }],
              has_more: true,
            });
          }
          if (startingAfter === "sub_pd_2") {
            return jsonResponse({
              data: [{ id: "sub_pd_3" }],
              has_more: false,
            });
          }
          return jsonResponse({ data: [], has_more: false });
        }

        if (status === "trialing") {
          return jsonResponse({
            data: [{ id: "sub_tr_1" }, { id: "sub_tr_2" }, { id: "sub_tr_3" }, { id: "sub_tr_4" }],
            has_more: false,
          });
        }
      }

      if (url.pathname === "/v1/charges") {
        return jsonResponse({ data: [], has_more: false });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchStripeData("sk_test_123", {
      fromDate: new Date("2026-01-01T00:00:00.000Z"),
      toDate: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(data.subscriptions.pastDue).toBe(3);
    expect(data.subscriptions.trialing).toBe(4);

    const requestUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestUrls.some((url) => url.includes("status=past_due") && url.includes("limit=100"))).toBe(true);
    expect(requestUrls.some((url) => url.includes("status=trialing") && url.includes("limit=100"))).toBe(true);
  });

  it("paginates active and canceled subscriptions and sorts churn events newest-first", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        const status = url.searchParams.get("status");
        const startingAfter = url.searchParams.get("starting_after");

        if (status === "active") {
          if (!startingAfter) {
            return jsonResponse({
              data: [
                {
                  id: "sub_active_1",
                  customer: "cus_active_1",
                  canceled_at: null,
                  items: { data: [{ price: { unit_amount: 1000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
                {
                  id: "sub_active_2",
                  customer: "cus_active_2",
                  canceled_at: null,
                  items: { data: [{ price: { unit_amount: 2000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
              ],
              has_more: true,
            });
          }

          if (startingAfter === "sub_active_2") {
            return jsonResponse({
              data: [
                {
                  id: "sub_active_3",
                  customer: "cus_active_3",
                  canceled_at: null,
                  items: { data: [{ price: { unit_amount: 3000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
              ],
              has_more: false,
            });
          }
        }

        if (status === "canceled") {
          if (!startingAfter) {
            return jsonResponse({
              data: [
                {
                  id: "sub_canceled_1",
                  customer: "cus_oldest",
                  canceled_at: 1_700_000_100,
                  items: { data: [{ price: { unit_amount: 1000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
                {
                  id: "sub_canceled_2",
                  customer: "cus_mid",
                  canceled_at: 1_700_000_300,
                  items: { data: [{ price: { unit_amount: 2000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
              ],
              has_more: true,
            });
          }

          if (startingAfter === "sub_canceled_2") {
            return jsonResponse({
              data: [
                {
                  id: "sub_canceled_3",
                  customer: { id: "cus_object_customer" },
                  canceled_at: 1_700_000_200,
                  items: { data: [{ price: { unit_amount: 3000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
                {
                  id: "sub_canceled_4",
                  customer: "cus_newest",
                  canceled_at: 1_700_000_500,
                  items: { data: [{ price: { unit_amount: 4000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
                {
                  id: "sub_canceled_5",
                  customer: "cus_second_newest",
                  canceled_at: 1_700_000_400,
                  items: { data: [{ price: { unit_amount: 5000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
                {
                  id: "sub_canceled_6",
                  customer: "cus_missing_timestamp",
                  canceled_at: null,
                  items: { data: [{ price: { unit_amount: 6000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
              ],
              has_more: false,
            });
          }
        }

        if (status === "past_due" || status === "trialing") {
          return jsonResponse({ data: [], has_more: false });
        }
      }

      if (url.pathname === "/v1/charges") {
        return jsonResponse({ data: [], has_more: false });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchStripeData("sk_test_123", {
      fromDate: new Date("2026-01-01T00:00:00.000Z"),
      toDate: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(data.subscriptions.active).toBe(3);
    expect(data.subscriptions.canceled).toBe(6);
    expect(data.subscriptions.recentChurnEvents).toEqual([
      {
        customer: "cus_newest",
        canceledAt: new Date(1_700_000_500 * 1000).toISOString(),
        amount: 40,
      },
      {
        customer: "cus_second_newest",
        canceledAt: new Date(1_700_000_400 * 1000).toISOString(),
        amount: 50,
      },
      {
        customer: "cus_mid",
        canceledAt: new Date(1_700_000_300 * 1000).toISOString(),
        amount: 20,
      },
      {
        customer: "cus_object_customer",
        canceledAt: new Date(1_700_000_200 * 1000).toISOString(),
        amount: 30,
      },
      {
        customer: "cus_oldest",
        canceledAt: new Date(1_700_000_100 * 1000).toISOString(),
        amount: 10,
      },
    ]);

    const requestUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(
      requestUrls.some(
        (url) => url.includes("status=active") && url.includes("starting_after=sub_active_2")
      )
    ).toBe(true);
    expect(
      requestUrls.some(
        (url) => url.includes("status=canceled") && url.includes("starting_after=sub_canceled_2")
      )
    ).toBe(true);
  });

  it("throws when Stripe charges fail so revenue does not look falsely fresh", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        return jsonResponse({ data: [], has_more: false });
      }

      if (url.pathname === "/v1/charges") {
        return jsonResponse({ error: { message: "rate limited" } }, 429);
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchStripeData("sk_test_123", {
        fromDate: new Date("2026-02-01T00:00:00.000Z"),
        toDate: new Date("2026-02-28T23:59:59.999Z"),
      }),
    ).rejects.toThrow("Stripe charges error (429): rate limited");
  });

  it("continues paginating charges beyond 10 pages before computing revenue", async () => {
    const fromDate = new Date("2026-02-01T00:00:00.000Z");
    const toDate = new Date("2026-02-28T23:59:59.999Z");
    const currentStart = String(Math.floor(fromDate.getTime() / 1000));
    const chargePageByCursor = new Map<string | null, number>(
      Array.from({ length: 11 }, (_, index) => [
        index === 0 ? null : `ch_current_${index}`,
        index + 1,
      ]),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        return jsonResponse({ data: [], has_more: false });
      }

      if (url.pathname === "/v1/charges") {
        const isCurrentRange = url.searchParams.get("created[gte]") === currentStart;
        if (!isCurrentRange) {
          return jsonResponse({ data: [], has_more: false });
        }

        const startingAfter = url.searchParams.get("starting_after");
        const page = chargePageByCursor.get(startingAfter);
        if (!page) {
          return jsonResponse({ data: [], has_more: false });
        }

        return jsonResponse({
          data: [
            {
              id: `ch_current_${page}`,
              amount: 100,
              created: currentStart,
              status: "succeeded",
            },
          ],
          has_more: page < 11,
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchStripeData("sk_test_123", { fromDate, toDate });
    const currentChargeRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter(
        (url) =>
          url.pathname === "/v1/charges" &&
          url.searchParams.get("created[gte]") === currentStart,
      );

    expect(currentChargeRequests).toHaveLength(11);
    expect(currentChargeRequests.at(-1)?.searchParams.get("starting_after")).toBe(
      "ch_current_10",
    );
    expect(data.revenue.totalRevenue30d).toBe(11);
    expect(data.payments.succeeded).toBe(11);
  });

  it("marks Stripe payloads truncated when current charges reach the page cap", async () => {
    const fromDate = new Date("2026-02-01T00:00:00.000Z");
    const toDate = new Date("2026-02-28T23:59:59.999Z");
    const currentStart = String(Math.floor(fromDate.getTime() / 1000));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v1/subscriptions") {
        return jsonResponse({ data: [], has_more: false });
      }

      if (url.pathname === "/v1/charges") {
        const isCurrentRange = url.searchParams.get("created[gte]") === currentStart;
        return jsonResponse({
          data: Array.from({ length: isCurrentRange ? 100 : 0 }, (_, index) => ({
            id: `ch_current_${index + 1}`,
            amount: 100,
            created: Number(currentStart),
            status: "succeeded",
          })),
          has_more: isCurrentRange,
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchStripeData("sk_test_123", { fromDate, toDate, maxPages: 1 });
    const currentChargeRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter(
        (url) =>
          url.pathname === "/v1/charges" &&
          url.searchParams.get("created[gte]") === currentStart,
      );

    expect(currentChargeRequests).toHaveLength(1);
    expect(data.revenue.totalRevenue30d).toBe(100);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["chargesInRange"],
    }));
  });
});
