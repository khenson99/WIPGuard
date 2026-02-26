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

    const data = await fetchStripeData(
      "sk_test_123",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-01T00:00:00.000Z")
    );

    expect(data.subscriptions.pastDue).toBe(3);
    expect(data.subscriptions.trialing).toBe(4);

    const requestUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestUrls.some((url) => url.includes("status=past_due") && url.includes("limit=100"))).toBe(true);
    expect(requestUrls.some((url) => url.includes("status=trialing") && url.includes("limit=100"))).toBe(true);
  });
});

