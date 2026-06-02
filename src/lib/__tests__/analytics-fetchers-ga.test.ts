import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGAData } from "@/lib/analytics/fetchers-ga-webflow";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("google analytics fetcher", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GA_REFRESH_TOKEN = "ga-refresh-token";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("paginates GA4 top page rows before returning page metrics", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ga-access-token" });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensions?: Array<{ name?: string }>;
        limit?: number;
        offset?: number;
      };
      const dimensionNames = body.dimensions?.map((dimension) => dimension.name) ?? [];

      if (dimensionNames.includes("pagePath")) {
        const offset = body.offset ?? 0;
        if (offset === 100) {
          return jsonResponse({
            rowCount: 101,
            rows: [
              {
                dimensionValues: [{ value: "/page-101" }],
                metricValues: [{ value: "1" }, { value: "5" }],
              },
            ],
          });
        }

        return jsonResponse({
          rowCount: 101,
          rows: Array.from({ length: body.limit ?? 0 }, (_, index) => ({
            dimensionValues: [{ value: `/page-${index + 1}` }],
            metricValues: [{ value: String(1000 - index) }, { value: "30" }],
          })),
        });
      }

      if (dimensionNames.includes("sessionDefaultChannelGroup")) {
        return jsonResponse({
          rows: [
            {
              dimensionValues: [{ value: "Organic Search" }, { value: "20260601" }],
              metricValues: [{ value: "25" }, { value: "20" }, { value: "50" }],
            },
          ],
        });
      }

      return jsonResponse({
        rows: [
          {
            metricValues: [
              { value: "100" },
              { value: "80" },
              { value: "250" },
              { value: "0.4" },
              { value: "45" },
            ],
          },
        ],
      });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGAData("properties/123456", "", "", {
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });

    const topPageRequests = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("analyticsdata.googleapis.com"))
      .map(([, init]) =>
        JSON.parse(String(init?.body ?? "{}")) as {
          dimensions?: Array<{ name?: string }>;
          limit?: number;
          offset?: number;
        },
      )
      .filter((body) => body.dimensions?.some((dimension) => dimension.name === "pagePath"));

    expect(topPageRequests).toHaveLength(3);
    expect(topPageRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ limit: 100, offset: 0 }),
        expect.objectContaining({ limit: 100, offset: 100 }),
        expect.objectContaining({ limit: 100 }),
      ])
    );
    expect(data.topPages).toHaveLength(101);
    expect(data.topPages[0]).toEqual({
      path: "/page-1",
      pageviews: 1000,
      avgDuration: 30,
      sessions: 0,
      bounceRate: 0,
    });
    expect(data.topPages.at(-1)).toEqual({
      path: "/page-101",
      pageviews: 1,
      avgDuration: 5,
      sessions: 0,
      bounceRate: 0,
    });
  });

  it("keeps GA4 aggregates finite when provider metric values are malformed", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ga-access-token" });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensions?: Array<{ name?: string }>;
      };
      const dimensionNames = body.dimensions?.map((dimension) => dimension.name) ?? [];

      if (dimensionNames.includes("pagePath")) {
        return jsonResponse({
          rows: [
            {
              dimensionValues: [{ value: "/analytics" }],
              metricValues: [{ value: "bad-pageviews" }, { value: "bad-duration" }],
            },
          ],
        });
      }

      if (dimensionNames.includes("sessionDefaultChannelGroup")) {
        return jsonResponse({
          rows: [
            {
              dimensionValues: [{ value: "Organic Search" }, { value: "20260601" }],
              metricValues: [{ value: "bad-sessions" }, { value: "20" }, { value: "bad-pageviews" }],
            },
            {
              dimensionValues: [{ value: "Direct" }, { value: "20260601" }],
              metricValues: [{ value: "15" }, { value: "bad-users" }, { value: "30" }],
            },
          ],
        });
      }

      return jsonResponse({
        rows: [
          {
            metricValues: [
              { value: "bad-sessions" },
              { value: "80" },
              { value: "bad-pageviews" },
              { value: "bad-bounce" },
              { value: "bad-duration" },
            ],
          },
        ],
      });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGAData("properties/123456", "", "", {
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });

    expect(data).toEqual(expect.objectContaining({
      sessions30d: 0,
      users30d: 80,
      pageviews30d: 0,
      bounceRate: 0,
      avgSessionDuration: 0,
    }));
    expect(data.trafficByChannel).toEqual([
      { channel: "Organic Search", sessions: 0, users: 20, pageviews: 0 },
      { channel: "Direct", sessions: 15, users: 0, pageviews: 30 },
    ]);
    expect(data.dailyTrend).toEqual([{ date: "2026-06-01", sessions: 15 }]);
    expect(data.topPages).toEqual([
      { path: "/analytics", pageviews: 0, avgDuration: 0, sessions: 0, bounceRate: 0 },
    ]);
  });

  it("bypasses fetch cache for GA4 token and report requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ga-access-token" });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensions?: Array<{ name?: string }>;
      };
      const dimensionNames = body.dimensions?.map((dimension) => dimension.name) ?? [];

      if (dimensionNames.includes("pagePath")) {
        return jsonResponse({
          rows: [
            {
              dimensionValues: [{ value: "/analytics" }],
              metricValues: [{ value: "10" }, { value: "5" }],
            },
          ],
        });
      }

      if (dimensionNames.includes("sessionDefaultChannelGroup")) {
        return jsonResponse({
          rows: [
            {
              dimensionValues: [{ value: "Organic Search" }, { value: "20260601" }],
              metricValues: [{ value: "25" }, { value: "20" }, { value: "50" }],
            },
          ],
        });
      }

      return jsonResponse({
        rows: [
          {
            metricValues: [
              { value: "100" },
              { value: "80" },
              { value: "250" },
              { value: "0.4" },
              { value: "45" },
            ],
          },
        ],
      });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchGAData("properties/123456", "", "", {
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });

    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url) === "https://oauth2.googleapis.com/token");
    const reportCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("analyticsdata.googleapis.com"),
    );

    expect(tokenCall?.[1]).toEqual(expect.objectContaining({
      cache: "no-store",
    }));
    expect(reportCalls).toHaveLength(5);
    expect(reportCalls.every(([, init]) => init?.cache === "no-store")).toBe(true);
  });

  it("marks GA4 payloads truncated when top page pagination reaches the page cap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ga-access-token" });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensions?: Array<{ name?: string }>;
        limit?: number;
        offset?: number;
      };
      const dimensionNames = body.dimensions?.map((dimension) => dimension.name) ?? [];

      if (dimensionNames.includes("pagePath")) {
        const offset = body.offset ?? 0;
        return jsonResponse({
          rowCount: 10_001,
          rows: Array.from({ length: body.limit ?? 0 }, (_, index) => ({
            dimensionValues: [{ value: `/page-${offset + index + 1}` }],
            metricValues: [{ value: "1" }, { value: "5" }],
          })),
        });
      }

      if (dimensionNames.includes("sessionDefaultChannelGroup")) {
        return jsonResponse({
          rows: [
            {
              dimensionValues: [{ value: "Organic Search" }, { value: "20260601" }],
              metricValues: [{ value: "25" }, { value: "20" }, { value: "50" }],
            },
          ],
        });
      }

      return jsonResponse({
        rows: [
          {
            metricValues: [
              { value: "100" },
              { value: "80" },
              { value: "250" },
              { value: "0.4" },
              { value: "45" },
            ],
          },
        ],
      });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGAData("properties/123456", "", "", {
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    const topPageRequests = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("analyticsdata.googleapis.com"))
      .map(([, init]) =>
        JSON.parse(String(init?.body ?? "{}")) as {
          dimensions?: Array<{ name?: string }>;
          offset?: number;
        },
      )
      .filter((body) => body.dimensions?.some((dimension) => dimension.name === "pagePath"));

    const currentPageOffsets = topPageRequests
      .map((request) => request.offset)
      .filter((offset): offset is number => typeof offset === "number");
    expect(topPageRequests).toHaveLength(101);
    expect(Math.max(...currentPageOffsets)).toBe(9_900);
    expect(data.topPages).toHaveLength(10_000);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["topPages"],
    }));
  });
});
