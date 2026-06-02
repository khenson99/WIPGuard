import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStripeData } from "@/lib/analytics/fetchers";

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
                  created: 1_767_398_400,
                  items: { data: [{ price: { unit_amount: 1000, recurring: { interval: "month", interval_count: 1 } } }] },
                },
                {
                  id: "sub_active_2",
                  customer: "cus_active_2",
                  canceled_at: null,
                  created: 1_768_262_400,
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
                  created: 1_768_348_800,
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
    expect(data.subscriptions.activeCustomerRefs).toEqual([
      {
        customerId: "cus_active_1",
        email: null,
        emailDomain: null,
        subscriptionId: "sub_active_1",
        subscriptionCreatedAt: new Date(1_767_398_400 * 1000).toISOString(),
      },
      {
        customerId: "cus_active_2",
        email: null,
        emailDomain: null,
        subscriptionId: "sub_active_2",
        subscriptionCreatedAt: new Date(1_768_262_400 * 1000).toISOString(),
      },
      {
        customerId: "cus_active_3",
        email: null,
        emailDomain: null,
        subscriptionId: "sub_active_3",
        subscriptionCreatedAt: new Date(1_768_348_800 * 1000).toISOString(),
      },
    ]);
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
});
