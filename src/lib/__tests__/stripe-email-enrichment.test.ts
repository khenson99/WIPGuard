import { describe, expect, it, vi } from "vitest";
import { enrichStripeEmails } from "@/lib/analytics/stripe-email-enrichment";

function stripeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("stripe email enrichment", () => {
  it("keeps Stripe customer matches but leaves paid12mo unknown when charges fail", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/customers/search") {
        return stripeResponse({
          data: [
            {
              id: "cus_123",
              email: "buyer@example.com",
              created: 1_770_000_000,
            },
          ],
          has_more: false,
        });
      }

      if (url.pathname === "/v1/subscriptions") {
        return stripeResponse({
          data: [
            {
              id: "sub_123",
              status: "active",
              items: {
                data: [
                  {
                    price: {
                      unit_amount: 2500,
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

      if (url.pathname === "/v1/charges") {
        return stripeResponse({ error: "temporarily unavailable" }, 503);
      }

      throw new Error(`Unexpected Stripe URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichStripeEmails({
      apiKey: "sk_test_123",
      emails: ["buyer@example.com"],
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.get("buyer@example.com")).toEqual(
      expect.objectContaining({
        matched: true,
        customerId: "cus_123",
        subscriptionStatus: "active",
        mrr: 25,
        paid12mo: null,
        lastPaymentAt: null,
      }),
    );
  });

  it("keeps Stripe customer matches but leaves subscription metrics unknown when subscriptions fail", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/customers/search") {
        return stripeResponse({
          data: [
            {
              id: "cus_456",
              email: "ops@example.com",
              created: 1_770_000_000,
            },
          ],
          has_more: false,
        });
      }

      if (url.pathname === "/v1/subscriptions") {
        return stripeResponse({ error: "temporarily unavailable" }, 503);
      }

      if (url.pathname === "/v1/charges") {
        return stripeResponse({ data: [], has_more: false });
      }

      throw new Error(`Unexpected Stripe URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichStripeEmails({
      apiKey: "sk_test_123",
      emails: ["ops@example.com"],
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.get("ops@example.com")).toEqual(
      expect.objectContaining({
        matched: true,
        customerId: "cus_456",
        subscriptionStatus: "unknown",
        mrr: null,
        paid12mo: 0,
      }),
    );
  });

  it("preserves Stripe enrichment amounts when monetary fields arrive as formatted strings", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/customers/search") {
        return stripeResponse({
          data: [
            {
              id: "cus_formatted",
              email: "finance@example.com",
              created: 1_770_000_000,
            },
          ],
          has_more: false,
        });
      }

      if (url.pathname === "/v1/subscriptions") {
        return stripeResponse({
          data: [
            {
              id: "sub_formatted",
              status: "active",
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

      if (url.pathname === "/v1/charges") {
        return stripeResponse({
          data: [
            {
              id: "ch_formatted",
              amount: "2,500",
              amount_refunded: "500",
              created: 1_770_000_000,
              status: "succeeded",
              paid: true,
            },
          ],
          has_more: false,
        });
      }

      throw new Error(`Unexpected Stripe URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichStripeEmails({
      apiKey: "sk_test_123",
      emails: ["finance@example.com"],
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.get("finance@example.com")).toEqual(
      expect.objectContaining({
        matched: true,
        customerId: "cus_formatted",
        subscriptionStatus: "active",
        mrr: 120,
        paid12mo: 20,
        lastPaymentAt: new Date(1_770_000_000 * 1000).toISOString(),
      }),
    );
  });

  it("marks customer lookup unavailable as unknown instead of no Stripe customer", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/customers/search") {
        return stripeResponse({ error: "temporarily unavailable" }, 503);
      }

      throw new Error(`Unexpected Stripe URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichStripeEmails({
      apiKey: "sk_test_123",
      emails: ["unverified@example.com"],
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.get("unverified@example.com")).toEqual(
      expect.objectContaining({
        matched: false,
        customerId: null,
        customerCount: 0,
        subscriptionStatus: "unknown",
        mrr: null,
        paid12mo: null,
      }),
    );
  });

  it("paginates Stripe subscriptions before computing MRR", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/customers/search") {
        return stripeResponse({
          data: [
            {
              id: "cus_paginated",
              email: "growth@example.com",
              created: 1_770_000_000,
            },
          ],
          has_more: false,
        });
      }

      if (url.pathname === "/v1/subscriptions") {
        const startingAfter = url.searchParams.get("starting_after");
        if (!startingAfter) {
          return stripeResponse({
            data: [
              {
                id: "sub_first",
                status: "active",
                items: {
                  data: [
                    {
                      price: {
                        unit_amount: 1000,
                        recurring: { interval: "month", interval_count: 1 },
                      },
                    },
                  ],
                },
              },
            ],
            has_more: true,
          });
        }
        if (startingAfter === "sub_first") {
          return stripeResponse({
            data: [
              {
                id: "sub_second",
                status: "active",
                items: {
                  data: [
                    {
                      price: {
                        unit_amount: 2000,
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
      }

      if (url.pathname === "/v1/charges") {
        return stripeResponse({ data: [], has_more: false });
      }

      throw new Error(`Unexpected Stripe URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichStripeEmails({
      apiKey: "sk_test_123",
      emails: ["growth@example.com"],
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.get("growth@example.com")).toEqual(
      expect.objectContaining({
        matched: true,
        customerId: "cus_paginated",
        subscriptionStatus: "active",
        mrr: 30,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/subscriptions?"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("starting_after=sub_first"),
      expect.any(Object),
    );
  });
});
