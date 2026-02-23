import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchRedditAdsData,
} from "@/lib/analytics/fetchers-ads";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

describe("analytics ads fetchers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Google Ads searchStream array responses", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "google-token" }))
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            {
              results: [
                {
                  campaign: { name: "Brand Search" },
                  metrics: {
                    cost_micros: "2500000",
                    impressions: "1000",
                    clicks: "40",
                    conversions: "5",
                  },
                },
              ],
            },
          ])
        )
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleAdsData(
      "dev-token",
      "123-456-7890",
      "refresh-token",
      "client-id",
      "client-secret",
      "999-888-7777"
    );

    expect(data.totalSpend30d).toBeCloseTo(2.5);
    expect(data.totalImpressions).toBe(1000);
    expect(data.totalClicks).toBe(40);
    expect(data.totalConversions).toBe(5);
    expect(data.campaigns[0]?.name).toBe("Brand Search");

    const requestInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["login-customer-id"]).toBe("9998887777");
  });

  it("throws actionable Google Ads API failures", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "google-token" }))
      .mockResolvedValueOnce(textResponse("quota exceeded", 500));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchGoogleAdsData(
        "dev-token",
        "1234567890",
        "refresh-token",
        "client-id",
        "client-secret"
      )
    ).rejects.toThrow("Google Ads API error (500): quota exceeded");
  });

  it("throws actionable Google Ads parse failures for malformed payloads", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "google-token" }))
      .mockResolvedValueOnce(textResponse("not-json-stream-response", 200));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchGoogleAdsData(
        "dev-token",
        "1234567890",
        "refresh-token",
        "client-id",
        "client-secret"
      )
    ).rejects.toThrow("Google Ads response parse error: not-json-stream-response");
  });

  it("normalizes Meta ad account ids with or without act_ prefix", async () => {
    const firstFetchMock = vi.fn();
    firstFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              spend: "100",
              impressions: "1200",
              clicks: "60",
              actions: [{ action_type: "offsite_conversion.lead", value: "4" }],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              name: "Meta Campaign",
              insights: {
                data: [
                  {
                    spend: "50",
                    impressions: "500",
                    clicks: "20",
                    actions: [{ action_type: "lead", value: "2" }],
                  },
                ],
              },
            },
          ],
        })
      );

    vi.stubGlobal("fetch", firstFetchMock as unknown as typeof fetch);

    const prefixed = await fetchMetaAdsData("meta-token", "act_12345");
    expect(prefixed.totalConversions).toBe(4);
    expect(firstFetchMock.mock.calls[0]?.[0]).toContain("/act_12345/insights");

    const secondFetchMock = vi.fn();
    secondFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ spend: "20", impressions: "200", clicks: "10", actions: [] }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    vi.stubGlobal("fetch", secondFetchMock as unknown as typeof fetch);

    await fetchMetaAdsData("meta-token", "12345");
    expect(secondFetchMock.mock.calls[0]?.[0]).toContain("/act_12345/insights");
  });

  it("uses Reddit v3 report shape and joins campaign metadata", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "reddit-token" }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "cmp-1", name: "Launch" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            metrics: [
              { CAMPAIGN_ID: "cmp-1", SPEND: "12.5", IMPRESSIONS: "1000", CLICKS: "25" },
            ],
          },
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchRedditAdsData(
      "reddit-client",
      "reddit-secret",
      "reddit-refresh",
      "acc-1",
      "WIPGuard-Test/1.0"
    );

    expect(data.totalSpend30d).toBeCloseTo(12.5);
    expect(data.totalImpressions).toBe(1000);
    expect(data.totalClicks).toBe(25);
    expect(data.campaigns[0]?.name).toBe("Launch");

    const reportsCall = fetchMock.mock.calls[2];
    expect(reportsCall?.[0]).toContain("/api/v3/ad_accounts/acc-1/reports");
    const reportInit = reportsCall?.[1] as RequestInit;
    expect(reportInit.method).toBe("POST");
    expect(typeof reportInit.body).toBe("string");

    const payload = JSON.parse(reportInit.body as string) as {
      data?: { starts_at?: string; ends_at?: string };
    };
    expect(payload.data?.starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(payload.data?.ends_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    for (const [, init] of fetchMock.mock.calls as Array<[unknown, RequestInit]>) {
      const headers = (init?.headers || {}) as Record<string, string>;
      expect(headers["User-Agent"]).toBe("WIPGuard-Test/1.0");
    }
  });

  it("propagates Reddit auth and scope failures as explicit errors", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "reddit-token" }))
      .mockResolvedValueOnce(textResponse("insufficient_scope", 403));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchRedditAdsData("reddit-client", "reddit-secret", "reddit-refresh", "acc-1")
    ).rejects.toThrow("Reddit campaigns error (403): insufficient_scope");
  });
});
