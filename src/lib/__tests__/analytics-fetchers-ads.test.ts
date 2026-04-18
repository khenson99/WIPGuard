import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaInstagramData,
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
      "999-888-7777",
      { fromDate: new Date("2026-02-01T00:00:00.000Z"), toDate: new Date("2026-02-29T23:59:59.999Z") }
    );

    expect(data.totalSpend30d).toBeCloseTo(2.5);
    expect(data.totalImpressions).toBe(1000);
    expect(data.totalClicks).toBe(40);
    expect(data.totalConversions).toBe(5);
    expect(data.campaigns[0]?.name).toBe("Brand Search");

    const requestUrl = String(fetchMock.mock.calls[1]?.[0] ?? "");
    expect(requestUrl).toContain("/customers/1234567890/googleAds:searchStream");
    expect(requestUrl).not.toContain("/customers/1234567890:searchStream");

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

    const prefixed = await fetchMetaAdsData("meta-token", "act_12345", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-29T23:59:59.999Z"),
    });
    expect(prefixed.totalConversions).toBe(4);
    const firstInsightsUrl = String(firstFetchMock.mock.calls[0]?.[0]);
    expect(firstInsightsUrl).toContain("/act_12345/insights");
    expect(firstInsightsUrl).not.toContain("access_token=");
    const firstInsightsInit = firstFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((firstInsightsInit.headers as Record<string, string>)?.Authorization).toBe(
      "Bearer meta-token"
    );

    const secondFetchMock = vi.fn();
    secondFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ spend: "20", impressions: "200", clicks: "10", actions: [] }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    vi.stubGlobal("fetch", secondFetchMock as unknown as typeof fetch);

    await fetchMetaAdsData("meta-token", "12345", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-29T23:59:59.999Z"),
    });
    const secondInsightsUrl = String(secondFetchMock.mock.calls[0]?.[0]);
    expect(secondInsightsUrl).toContain("/act_12345/insights");
    expect(secondInsightsUrl).not.toContain("access_token=");
    const secondInsightsInit = secondFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((secondInsightsInit.headers as Record<string, string>)?.Authorization).toBe(
      "Bearer meta-token"
    );
  });

  it("rejects Meta app access tokens with a clear error", async () => {
    await expect(fetchMetaAdsData("123|not-a-user-token", "12345")).rejects.toThrow(
      "looks like an app access token"
    );
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
      "The-Mother-Node-Test/1.0",
      { fromDate: new Date("2026-02-01T00:00:00.000Z"), toDate: new Date("2026-02-29T23:59:59.999Z") }
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
    expect(payload.data?.starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    expect(payload.data?.ends_at).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);

    for (const [, init] of fetchMock.mock.calls as Array<[unknown, RequestInit]>) {
      const headers = (init?.headers || {}) as Record<string, string>;
      expect(headers["User-Agent"]).toBe("The-Mother-Node-Test/1.0");
    }
  });

  it("normalizes Reddit spend micros and key conversion counts", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "reddit-token" }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "cmp-1", name: "Launch" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            metrics: [
              {
                campaign_id: "cmp-1",
                spend: 12_500_000,
                impressions: 1000,
                clicks: 25,
                key_conversion_total_count: 3,
                reddit_leads: 1,
              },
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
      "The-Mother-Node-Test/1.0"
    );

    expect(data.totalSpend30d).toBeCloseTo(12.5);
    expect(data.totalConversions).toBe(3);
    expect(data.campaigns[0]?.spend).toBeCloseTo(12.5);
    expect(data.campaigns[0]?.conversions).toBe(3);
  });

  it("retries Reddit reports with smaller payloads when the rich request is rejected", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "reddit-token" }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "cmp-1", name: "Launch" }] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Bad request.",
              fields: [{ field: "fields[4]", message: "Unsupported field." }],
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Bad request.",
              fields: [{ field: "time_zone_id", message: "Invalid for this breakdown." }],
            },
          },
          400
        )
      )
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
      "The-Mother-Node-Test/1.0"
    );

    expect(data.totalSpend30d).toBeCloseTo(12.5);
    expect(data.totalConversions).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const firstReport = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)) as {
      data?: { fields?: string[]; time_zone_id?: string };
    };
    expect(firstReport.data?.time_zone_id).toBe("UTC");
    expect(firstReport.data?.fields).toEqual([
      "CAMPAIGN_ID",
      "SPEND",
      "IMPRESSIONS",
      "CLICKS",
      "KEY_CONVERSION_TOTAL_COUNT",
      "REDDIT_LEADS",
    ]);

    const secondReport = JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body)) as {
      data?: { fields?: string[]; time_zone_id?: string };
    };
    expect(secondReport.data?.time_zone_id).toBeUndefined();
    expect(secondReport.data?.fields).toEqual([
      "CAMPAIGN_ID",
      "SPEND",
      "IMPRESSIONS",
      "CLICKS",
      "KEY_CONVERSION_TOTAL_COUNT",
      "REDDIT_LEADS",
    ]);

    const thirdReport = JSON.parse(String((fetchMock.mock.calls[4]?.[1] as RequestInit).body)) as {
      data?: { fields?: string[]; time_zone_id?: string };
    };
    expect(thirdReport.data?.time_zone_id).toBeUndefined();
    expect(thirdReport.data?.fields).toEqual([
      "CAMPAIGN_ID",
      "SPEND",
      "IMPRESSIONS",
      "CLICKS",
    ]);
  });

  it("clamps Reddit report windows to the latest completed UTC day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T23:10:00.000Z"));

    try {
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

      await fetchRedditAdsData(
        "reddit-client",
        "reddit-secret",
        "reddit-refresh",
        "acc-1",
        "The-Mother-Node-Test/1.0"
      );

      const reportsCall = fetchMock.mock.calls[2];
      const payload = JSON.parse(String((reportsCall?.[1] as RequestInit).body)) as {
        data?: { starts_at?: string; ends_at?: string };
      };

      expect(payload.data?.starts_at).toBe("2026-02-05T00:00:00Z");
      expect(payload.data?.ends_at).toBe("2026-03-07T00:00:00Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates Reddit auth and scope failures as explicit errors", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "reddit-token" }))
      .mockResolvedValueOnce(textResponse("insufficient_scope", 403));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchRedditAdsData(
        "reddit-client",
        "reddit-secret",
        "reddit-refresh",
        "acc-1",
        "The-Mother-Node-Test/1.0"
      )
    ).rejects.toThrow("Reddit campaigns error (403): insufficient_scope");
  });

  it("clamps Reddit report end dates to the last complete UTC day by default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:34:56.000Z"));

    try {
      const fetchMock = vi.fn();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "reddit-token" }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(jsonResponse({ data: { metrics: [] } }));

      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      await fetchRedditAdsData(
        "reddit-client",
        "reddit-secret",
        "reddit-refresh",
        "acc-1",
        "WIPGuard-Test/1.0"
      );

      const reportsCall = fetchMock.mock.calls[2];
      const reportInit = reportsCall?.[1] as RequestInit;
      const payload = JSON.parse(String(reportInit.body ?? "{}")) as {
        data?: { starts_at?: string; ends_at?: string };
      };

      expect(payload.data?.starts_at).toBe("2026-02-01T00:00:00Z");
      expect(payload.data?.ends_at).toBe("2026-03-03T00:00:00Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves Instagram account via Page when direct profile fetch fails", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "(#100) Tried accessing nonexistent field (username)",
              type: "OAuthException",
              code: 100,
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          instagram_business_account: {
            id: "ig_123",
            username: "acme",
            followers_count: 912,
            media_count: 2,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "media_1",
              caption: "hello #manufacturing",
              timestamp: "2026-02-01T00:00:00+0000",
              like_count: 5,
              comments_count: 1,
              media_type: "VIDEO",
              media_product_type: "REELS",
              permalink: "https://instagram.com/p/media_1",
              thumbnail_url: "https://cdn.example.com/media_1.jpg",
            },
            {
              id: "media_2",
              caption: "Need cleaner replenishment?",
              timestamp: "2026-02-02T00:00:00+0000",
              like_count: 12,
              comments_count: 4,
              media_type: "VIDEO",
              media_product_type: "REELS",
              permalink: "https://instagram.com/p/media_2",
              thumbnail_url: "https://cdn.example.com/media_2.jpg",
            },
            {
              id: "media_3",
              caption: "Shop floor stills",
              timestamp: "2026-02-03T00:00:00+0000",
              like_count: 2,
              comments_count: 0,
              media_type: "IMAGE",
              media_product_type: "FEED",
            },
            {
              id: "media_4",
              caption: "Batch label update #ops",
              timestamp: "2026-02-04T00:00:00+0000",
              like_count: 3,
              comments_count: 1,
              media_type: "IMAGE",
              media_product_type: "FEED",
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaInstagramData(
      "meta-token",
      "page_999",
      undefined,
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-02-24T00:00:00.000Z")
    );

    expect(data.followers).toBe(912);
    expect(data.topPosts[0]?.id).toBe("media_2");
    expect(data.topPosts[0]?.isVideo).toBe(true);
    expect(data.topPosts[0]?.performanceScore).toBeGreaterThan(data.topPosts[1]?.performanceScore ?? 0);
    expect(data.topPosts[0]?.engagementVelocity).toBeGreaterThan(0);
    expect(data.topPosts[0]?.performanceDrivers?.length).toBeGreaterThan(0);
    expect(
      data.topPosts[0]?.performanceDrivers?.every((item) => item.confidence !== "low")
    ).toBe(true);
    if (data.topPosts[0]?.nextTests) {
      expect(
        data.topPosts[0].nextTests.every((item) => item.confidence !== "low")
      ).toBe(true);
    }
    expect(data.opportunities?.every((item) => item.adoptionPct <= 50)).toBe(true);
    expect(data.opportunities?.every((item) => item.estimatedImpactPct >= 0)).toBe(true);
    expect(data.testBacklog?.length).toBeGreaterThan(0);
    expect(data.testBacklog?.every((item) => item.supportingVideos >= 1)).toBe(true);
    expect(data.experimentPlan?.length).toBeGreaterThan(0);
    expect(data.experimentPlan?.every((item) => item.exampleVideos.length >= 1)).toBe(true);
    expect(data.videosToImprove?.every((item) => item.isVideo)).toBe(true);
    expect(data.videosToImprove?.every((item) => (item.nextTests?.length ?? 0) > 0)).toBe(true);
    expect(data.topVideos?.length).toBe(2);
    expect(data.mediaTypeBreakdown).toEqual({
      image: 2,
      video: 0,
      reel: 2,
      carousel: 0,
      other: 0,
    });
    expect(data.creativeAnalysis).toEqual({
      analyzedVideos: 0,
      totalVideoCandidates: 2,
      sampled: false,
    });
    expect(data.attributeCorrelations?.length).toBeGreaterThan(0);
    expect(data.attributeCorrelations?.every((item) => typeof item.sampled === "boolean")).toBe(true);
    expect(data.attributeCorrelations?.every((item) => item.source === "metadata" || item.source === "ai_visual")).toBe(true);
    expect(
      data.attributeCorrelations?.every(
        (item) =>
          typeof item.coveragePct === "number" &&
          typeof item.confidenceScore === "number" &&
          (item.confidence === "low" || item.confidence === "medium" || item.confidence === "high")
      )
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const mediaUrl = String(fetchMock.mock.calls[2]?.[0] ?? "");
    expect(mediaUrl).toContain("/ig_123/media");
    expect(mediaUrl).toContain("media_type");
  });

  it("ranks Instagram posts by normalized performance instead of raw lifetime engagement alone", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          instagram_business_account: {
            id: "ig_123",
            username: "acme",
            followers_count: 1000,
            media_count: 2,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "older-post",
              caption: "Steady performer",
              timestamp: "2026-02-01T00:00:00+0000",
              like_count: 30,
              comments_count: 10,
              media_type: "VIDEO",
              media_product_type: "REELS",
            },
            {
              id: "fresh-breakout",
              caption: "Why is this workflow still manual?",
              timestamp: "2026-02-22T00:00:00+0000",
              like_count: 20,
              comments_count: 8,
              media_type: "VIDEO",
              media_product_type: "REELS",
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaInstagramData(
      "meta-token",
      "page_999",
      { pageId: "page_999" },
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-02-24T00:00:00.000Z")
    );

    expect(data.topPosts[0]?.id).toBe("fresh-breakout");
    expect(data.topPosts[0]?.engagement).toBe(28);
    expect(data.topPosts[1]?.engagement).toBe(40);
    expect(data.topPosts[0]?.engagementVelocity).toBeGreaterThan(
      data.topPosts[1]?.engagementVelocity ?? 0
    );
    expect(data.topPosts[0]?.performanceScore).toBeGreaterThan(
      data.topPosts[1]?.performanceScore ?? 0
    );
    expect(data.engagement30d).toBe(68);
    expect(data.winningPatterns?.every((item) => item.confidence !== "low")).toBe(true);
    expect(data.losingPatterns?.every((item) => item.confidence !== "low")).toBe(true);
  });

  it("uses options.pageId to resolve Instagram account without failing first", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          connected_instagram_account: {
            id: "ig_999",
            username: "brand",
            followers_count: 321,
            media_count: 1,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "media_2",
              caption: "post",
              timestamp: "2026-02-10T00:00:00+0000",
              like_count: 2,
              comments_count: 0,
              media_type: "IMAGE",
              media_product_type: "FEED",
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaInstagramData(
      "meta-token",
      "bad_instagram_id",
      { pageId: "page_1" },
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-02-24T00:00:00.000Z")
    );

    expect(data.followers).toBe(321);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(firstUrl).toContain("/page_1");
    expect(firstUrl).toContain("instagram_business_account");

    const urls = fetchMock.mock.calls.map((call) => String(call[0] ?? ""));
    expect(
      urls.some(
        (url) =>
          url.includes("/bad_instagram_id") && url.includes("username") && url.includes("fields=")
      )
    ).toBe(false);

    const mediaUrl = String(fetchMock.mock.calls[1]?.[0] ?? "");
    expect(mediaUrl).toContain("/ig_999/media");
  });
});
