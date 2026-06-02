import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaPageData,
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

  it("preserves Google Ads metrics when numeric fields include grouping separators", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "google-token" }))
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            {
              results: [
                {
                  campaign: { name: "Formatted Metrics" },
                  metrics: {
                    cost_micros: "2,500,000",
                    impressions: "1,000",
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
      "1234567890",
      "refresh-token",
      "client-id",
      "client-secret",
      undefined,
      { fromDate: new Date("2026-02-01T00:00:00.000Z"), toDate: new Date("2026-02-29T23:59:59.999Z") }
    );

    expect(data.totalSpend30d).toBeCloseTo(2.5);
    expect(data.totalImpressions).toBe(1000);
    expect(data.totalClicks).toBe(40);
    expect(data.totalConversions).toBe(5);
    expect(data.ctr).toBe(4);
    expect(data.cpc).toBeCloseTo(0.0625);
    expect(data.campaigns[0]).toEqual(expect.objectContaining({
      name: "Formatted Metrics",
      spend: 2.5,
      impressions: 1000,
      clicks: 40,
      conversions: 5,
    }));
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

  it("bypasses fetch cache for Google Ads token and search requests", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "google-token" }))
      .mockResolvedValueOnce(textResponse(JSON.stringify([{ results: [] }])));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchGoogleAdsData(
      "dev-token",
      "1234567890",
      "refresh-token",
      "client-id",
      "client-secret"
    );

    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store")).toBe(true);
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
          data: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [],
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

  it("follows Meta Ads campaign pagination before building campaign metrics", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = new URL(String(input));

      if (url.pathname.endsWith("/act_12345/insights")) {
        return jsonResponse({
          data: [
            {
              spend: "150",
              impressions: "1500",
              clicks: "75",
              actions: [{ action_type: "lead", value: "6" }],
            },
          ],
        });
      }

      if (url.pathname.endsWith("/act_12345/campaigns")) {
        if (url.searchParams.get("after") === "campaign_cursor_2") {
          return jsonResponse({
            data: [
              {
                name: "Second Campaign",
                insights: {
                  data: [
                    {
                      spend: "50",
                      impressions: "500",
                      clicks: "25",
                      actions: [{ action_type: "lead", value: "2" }],
                    },
                  ],
                },
              },
            ],
          });
        }

        return jsonResponse({
          data: [
            {
              name: "First Campaign",
              insights: {
                data: [
                  {
                    spend: "100",
                    impressions: "1000",
                    clicks: "50",
                    actions: [{ action_type: "lead", value: "4" }],
                  },
                ],
              },
            },
          ],
          paging: { cursors: { after: "campaign_cursor_2" }, next: "https://graph.facebook.com/v21.0/act_12345/campaigns?after=campaign_cursor_2" },
        });
      }

      throw new Error(`Unexpected Meta request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaAdsData("meta-token", "12345", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-29T23:59:59.999Z"),
    });

    const campaignRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/act_12345/campaigns"));

    expect(campaignRequests).toHaveLength(2);
    expect(campaignRequests[1]?.searchParams.get("after")).toBe("campaign_cursor_2");
    expect(data.campaigns.map((campaign) => campaign.name)).toEqual([
      "First Campaign",
      "Second Campaign",
    ]);
    expect(data.campaigns.map((campaign) => campaign.conversions)).toEqual([4, 2]);
  });

  it("marks Meta Ads payloads truncated when campaign page caps stop before cursors are exhausted", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/act_12345/insights")) {
        return jsonResponse({
          data: [
            {
              spend: "150",
              impressions: "1500",
              clicks: "75",
              actions: [{ action_type: "lead", value: "6" }],
            },
          ],
        });
      }

      if (url.pathname.endsWith("/act_12345/campaigns")) {
        const cursor = url.searchParams.get("after");
        const page = cursor ? Number(cursor.replace("campaign_cursor_", "")) : 1;
        const nextPage = page + 1;
        return jsonResponse({
          data: [
            {
              name: `Campaign ${page}`,
              insights: {
                data: [
                  {
                    spend: "1",
                    impressions: "10",
                    clicks: "1",
                    actions: [{ action_type: "lead", value: "1" }],
                  },
                ],
              },
            },
          ],
          paging: {
            cursors: { after: `campaign_cursor_${nextPage}` },
            next: `https://graph.facebook.com/v21.0/act_12345/campaigns?after=campaign_cursor_${nextPage}`,
          },
        });
      }

      throw new Error(`Unexpected Meta request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaAdsData("meta-token", "12345", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-29T23:59:59.999Z"),
    });

    const campaignRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/act_12345/campaigns"));

    expect(campaignRequests).toHaveLength(100);
    expect(data.campaigns).toHaveLength(100);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["campaigns"],
    }));
  });

  it("rejects Meta app access tokens with a clear error", async () => {
    await expect(fetchMetaAdsData("123|not-a-user-token", "12345")).rejects.toThrow(
      "looks like an app access token"
    );
  });

  it("bypasses fetch cache for Meta Ads, Page, and Instagram graph requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = new URL(String(input));

      if (url.pathname.endsWith("/act_12345/insights")) {
        return jsonResponse({
          data: [{ spend: "10", impressions: "100", clicks: "5", actions: [] }],
        });
      }

      if (url.pathname.endsWith("/act_12345/campaigns")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/me/accounts")) {
        return jsonResponse({ data: [{ id: "page-1", access_token: "page-token" }] });
      }

      if (url.pathname.endsWith("/page-1")) {
        return jsonResponse({
          fan_count: 10,
          followers_count: 15,
          instagram_business_account: {
            id: "ig_123",
            username: "acme",
            followers_count: 100,
            media_count: 1,
          },
        });
      }

      if (url.pathname.endsWith("/page-1/insights")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/page-1/posts")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/ig_123/media")) {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected Meta request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchMetaAdsData("meta-token", "12345");
    await fetchMetaPageData("meta-token", "page-1");
    await fetchMetaInstagramData("meta-token", "page-1", { pageId: "page-1" });

    const metaCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith("https://graph.facebook.com/"),
    );

    expect(metaCalls.length).toBeGreaterThan(0);
    expect(metaCalls.every(([, init]) => init?.cache === "no-store")).toBe(true);
  });

  it("skips invalid optional Meta Page insight metrics without failing the sync", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "page-1", access_token: "page-token" }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ fan_count: 10, followers_count: 15 }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "(#100) The value must be a valid insights metric",
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "(#100) The value must be a valid insights metric",
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              name: "page_engaged_users",
              values: [{ value: 17 }],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              message: "Launch update",
              created_time: "2026-02-18T12:00:00.000Z",
              insights: {
                data: [
                  { name: "post_impressions_unique", values: [{ value: 30 }] },
                  { name: "post_clicks", values: [{ value: 4 }] },
                ],
              },
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaPageData("meta-token", "page-1");

    expect(data.pageLikes).toBe(10);
    expect(data.pageFollowers).toBe(15);
    expect(data.postReach30d).toBe(0);
    expect(data.postEngagement30d).toBe(17);
    expect(data.topPosts).toEqual([
      {
        message: "Launch update",
        reach: 30,
        engagement: 4,
        createdAt: "2026-02-18T12:00:00.000Z",
      },
    ]);

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/page-1"
    );
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toEqual({
      Authorization: "Bearer page-token",
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "metric=page_impressions%2Cpage_engaged_users%2Cpage_views_total%2Cpage_total_actions"
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain("metric=page_impressions%2Cpage_engaged_users");
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain("metric=page_impressions");
    expect(String(fetchMock.mock.calls[5]?.[0])).toContain("metric=page_engaged_users");
  });

  it("resolves and uses the Meta Page access token for page-owned endpoints", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "page-1", access_token: "page-token" }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ fan_count: 10, followers_count: 15 }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchMetaPageData("user-token", "page-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/me/accounts");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({
      Authorization: "Bearer user-token",
    });
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect((call[1] as RequestInit).headers).toEqual({
        Authorization: "Bearer page-token",
      });
    }
  });

  it("paginates Meta Page accounts before falling back to the user token", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/me/accounts")) {
        if (url.searchParams.get("after") === "accounts_cursor_2") {
          return jsonResponse({
            data: [{ id: "page-1", access_token: "page-token" }],
          });
        }

        return jsonResponse({
          data: [{ id: "other-page", access_token: "other-token" }],
          paging: {
            cursors: { after: "accounts_cursor_2" },
            next: "https://graph.facebook.com/v21.0/me/accounts?after=accounts_cursor_2",
          },
        });
      }

      if (url.pathname.endsWith("/page-1")) {
        expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer page-token");
        return jsonResponse({ fan_count: 10, followers_count: 15 });
      }

      if (url.pathname.endsWith("/page-1/insights")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/page-1/posts")) {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unexpected Meta Page request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchMetaPageData("user-token", "page-1");

    const accountRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/me/accounts"));

    expect(accountRequests).toHaveLength(2);
    expect(accountRequests[1]?.searchParams.get("after")).toBe("accounts_cursor_2");
  });

  it("follows Meta Page post pagination before computing top posts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/me/accounts")) {
        return jsonResponse({ data: [{ id: "page-1", access_token: "page-token" }] });
      }

      if (url.pathname.endsWith("/page-1")) {
        return jsonResponse({ fan_count: 10, followers_count: 15 });
      }

      if (url.pathname.endsWith("/page-1/insights")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/page-1/posts")) {
        if (url.searchParams.get("after") === "posts_cursor_2") {
          return jsonResponse({
            data: [
              {
                message: "Second page update",
                created_time: "2026-02-19T12:00:00.000Z",
                insights: {
                  data: [
                    { name: "post_impressions_unique", values: [{ value: 50 }] },
                    { name: "post_clicks", values: [{ value: 8 }] },
                  ],
                },
              },
            ],
          });
        }

        return jsonResponse({
          data: [
            {
              message: "First page update",
              created_time: "2026-02-18T12:00:00.000Z",
              insights: {
                data: [
                  { name: "post_impressions_unique", values: [{ value: 30 }] },
                  { name: "post_clicks", values: [{ value: 4 }] },
                ],
              },
            },
          ],
          paging: {
            cursors: { after: "posts_cursor_2" },
            next: "https://graph.facebook.com/v21.0/page-1/posts?after=posts_cursor_2",
          },
        });
      }

      throw new Error(`Unexpected Meta Page request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaPageData("user-token", "page-1");

    const postRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/page-1/posts"));

    expect(postRequests).toHaveLength(2);
    expect(postRequests[1]?.searchParams.get("after")).toBe("posts_cursor_2");
    expect(data.topPosts).toEqual([
      {
        message: "First page update",
        reach: 30,
        engagement: 4,
        createdAt: "2026-02-18T12:00:00.000Z",
      },
      {
        message: "Second page update",
        reach: 50,
        engagement: 8,
        createdAt: "2026-02-19T12:00:00.000Z",
      },
    ]);
  });

  it("marks Meta Page payloads truncated when post pagination reaches the page cap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/me/accounts")) {
        return jsonResponse({ data: [{ id: "page-1", access_token: "page-token" }] });
      }

      if (url.pathname.endsWith("/page-1")) {
        return jsonResponse({ fan_count: 10, followers_count: 15 });
      }

      if (url.pathname.endsWith("/page-1/insights")) {
        return jsonResponse({ data: [] });
      }

      if (url.pathname.endsWith("/page-1/posts")) {
        const after = url.searchParams.get("after");
        const page = after ? Number(after.replace("posts_cursor_", "")) : 1;
        const nextCursor = `posts_cursor_${page + 1}`;

        return jsonResponse({
          data: [
            {
              message: `Post ${page}`,
              created_time: "2026-02-18T12:00:00.000Z",
              insights: {
                data: [
                  { name: "post_impressions_unique", values: [{ value: page }] },
                  { name: "post_clicks", values: [{ value: 1 }] },
                ],
              },
            },
          ],
          paging: {
            cursors: { after: nextCursor },
            next: `https://graph.facebook.com/v21.0/page-1/posts?after=${nextCursor}`,
          },
        });
      }

      throw new Error(`Unexpected Meta Page request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaPageData("user-token", "page-1");

    const postRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/page-1/posts"));

    expect(postRequests).toHaveLength(100);
    expect(data.topPosts).toHaveLength(100);
    expect(data._meta).toEqual(
      expect.objectContaining({
        truncated: true,
        truncatedResources: ["posts"],
      })
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

  it("bypasses fetch cache for Reddit Ads token, campaign, and report requests", async () => {
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
      "The-Mother-Node-Test/1.0"
    );

    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store")).toBe(true);
  });

  it("follows Reddit campaign pagination before joining report metrics", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.toString() === "https://www.reddit.com/api/v1/access_token") {
        return jsonResponse({ access_token: "reddit-token" });
      }

      if (url.pathname.endsWith("/api/v3/ad_accounts/acc-1/campaigns")) {
        if (url.searchParams.get("after") === "campaign_cursor_2") {
          return jsonResponse({
            data: [{ id: "cmp-2", name: "Retargeting" }],
          });
        }

        return jsonResponse({
          data: [{ id: "cmp-1", name: "Launch" }],
          pagination: {
            next_url:
              "https://ads-api.reddit.com/api/v3/ad_accounts/acc-1/campaigns?after=campaign_cursor_2",
          },
        });
      }

      if (url.pathname.endsWith("/api/v3/ad_accounts/acc-1/reports")) {
        return jsonResponse({
          data: {
            metrics: [
              { CAMPAIGN_ID: "cmp-1", SPEND: "10000000", IMPRESSIONS: "1000", CLICKS: "20" },
              { CAMPAIGN_ID: "cmp-2", SPEND: "15000000", IMPRESSIONS: "1500", CLICKS: "30" },
            ],
          },
        });
      }

      throw new Error(`Unexpected Reddit request: ${url.toString()}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchRedditAdsData(
      "reddit-client",
      "reddit-secret",
      "reddit-refresh",
      "acc-1",
      "The-Mother-Node-Test/1.0",
    );

    const campaignRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/api/v3/ad_accounts/acc-1/campaigns"));

    expect(campaignRequests).toHaveLength(2);
    expect(campaignRequests[1]?.searchParams.get("after")).toBe("campaign_cursor_2");
    expect(data.campaigns.map((campaign) => campaign.name)).toEqual([
      "Launch",
      "Retargeting",
    ]);
    expect(data.totalSpend30d).toBeCloseTo(25);
  });

  it("marks Reddit Ads payloads truncated when campaign pagination reaches the page cap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.toString() === "https://www.reddit.com/api/v1/access_token") {
        return jsonResponse({ access_token: "reddit-token" });
      }

      if (url.pathname.endsWith("/api/v3/ad_accounts/acc-1/campaigns")) {
        const after = url.searchParams.get("after");
        const page = after ? Number(after.replace("campaign_cursor_", "")) : 1;
        const nextCursor = `campaign_cursor_${page + 1}`;

        return jsonResponse({
          data: [{ id: `cmp-${page}`, name: `Campaign ${page}` }],
          pagination: {
            next_url: `https://ads-api.reddit.com/api/v3/ad_accounts/acc-1/campaigns?after=${nextCursor}`,
          },
        });
      }

      if (url.pathname.endsWith("/api/v3/ad_accounts/acc-1/reports")) {
        return jsonResponse({
          data: {
            metrics: [
              { CAMPAIGN_ID: "cmp-100", SPEND: "1000000", IMPRESSIONS: "100", CLICKS: "5" },
            ],
          },
        });
      }

      throw new Error(`Unexpected Reddit request: ${url.toString()}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchRedditAdsData(
      "reddit-client",
      "reddit-secret",
      "reddit-refresh",
      "acc-1",
      "The-Mother-Node-Test/1.0"
    );

    const campaignRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/api/v3/ad_accounts/acc-1/campaigns"));

    expect(campaignRequests).toHaveLength(100);
    expect(data.campaigns[0]?.name).toBe("Campaign 100");
    expect(data._meta).toEqual(
      expect.objectContaining({
        truncated: true,
        truncatedResources: ["campaigns"],
      })
    );
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
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { name: "reach", values: [{ value: 250 }] },
            { name: "profile_views", values: [{ value: 31 }] },
            { name: "website_clicks", values: [{ value: 7 }] },
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
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const mediaUrl = String(fetchMock.mock.calls[2]?.[0] ?? "");
    expect(mediaUrl).toContain("/ig_123/media");
    expect(mediaUrl).toContain("media_type");
  });

  it("follows Meta Instagram media pagination before ranking posts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/page_999")) {
        return jsonResponse({
          instagram_business_account: {
            id: "ig_123",
            username: "acme",
            followers_count: 1000,
            media_count: 2,
          },
        });
      }

      if (url.pathname.endsWith("/ig_123/media")) {
        if (url.searchParams.get("after") === "media_cursor_2") {
          return jsonResponse({
            data: [
              {
                id: "media_2",
                caption: "Second page post",
                timestamp: "2026-02-02T00:00:00+0000",
                like_count: 10,
                comments_count: 2,
                media_type: "IMAGE",
                media_product_type: "FEED",
              },
            ],
          });
        }

        return jsonResponse({
          data: [
            {
              id: "media_1",
              caption: "First page post",
              timestamp: "2026-02-01T00:00:00+0000",
              like_count: 5,
              comments_count: 1,
              media_type: "IMAGE",
              media_product_type: "FEED",
            },
          ],
          paging: {
            cursors: { after: "media_cursor_2" },
            next: "https://graph.facebook.com/v21.0/ig_123/media?after=media_cursor_2",
          },
        });
      }

      throw new Error(`Unexpected Instagram request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaInstagramData(
      "meta-token",
      "page_999",
      { pageId: "page_999" },
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-02-24T00:00:00.000Z")
    );

    const mediaRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/ig_123/media"));

    expect(mediaRequests).toHaveLength(2);
    expect(mediaRequests[1]?.searchParams.get("after")).toBe("media_cursor_2");
    expect(data.topPosts.map((post) => post.id)).toEqual(["media_2", "media_1"]);
    expect(data.mediaTypeBreakdown?.image).toBe(2);
  });

  it("marks Meta Instagram payloads truncated when media pagination reaches the page cap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/page_999")) {
        return jsonResponse({
          instagram_business_account: {
            id: "ig_123",
            username: "acme",
            followers_count: 1000,
            media_count: 250,
          },
        });
      }

      if (url.pathname.endsWith("/ig_123/media")) {
        const after = url.searchParams.get("after");
        const page = after ? Number(after.replace("media_cursor_", "")) : 1;
        const nextCursor = `media_cursor_${page + 1}`;

        return jsonResponse({
          data: [
            {
              id: `media_${page}`,
              caption: `Media ${page}`,
              timestamp: "2026-02-01T00:00:00+0000",
              like_count: page,
              comments_count: 1,
              media_type: "IMAGE",
              media_product_type: "FEED",
            },
          ],
          paging: {
            cursors: { after: nextCursor },
            next: `https://graph.facebook.com/v21.0/ig_123/media?after=${nextCursor}`,
          },
        });
      }

      throw new Error(`Unexpected Instagram request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchMetaInstagramData(
      "meta-token",
      "page_999",
      { pageId: "page_999" },
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-02-24T00:00:00.000Z")
    );

    const mediaRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/ig_123/media"));

    expect(mediaRequests).toHaveLength(100);
    expect(data.mediaTypeBreakdown?.image).toBe(100);
    expect(data._meta).toEqual(
      expect.objectContaining({
        truncated: true,
        truncatedResources: ["media"],
      })
    );
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
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { name: "reach", values: [{ value: 90 }] },
            { name: "profile_views", values: [{ value: 14 }] },
            { name: "website_clicks", values: [{ value: 3 }] },
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
    expect(data.reach30d).toBe(90);
    expect(data.traffic).toBe(14);
    expect(data.clicks).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);

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
