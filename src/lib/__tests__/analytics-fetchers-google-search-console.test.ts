import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleSearchConsoleData } from "@/lib/analytics/fetchers-google-search-console";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("google search console fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pulls search performance summaries across dates, queries, pages, devices, and countries", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["2026-05-31"], clicks: 12, impressions: 100, ctr: 0.12, position: 3.2 },
            { keys: ["2026-06-01"], clicks: 8, impressions: 50, ctr: 0.16, position: 2.5 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["imladris analytics"], clicks: 9, impressions: 70, ctr: 0.1286, position: 2.1 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["https://example.com/pricing"], clicks: 11, impressions: 80, ctr: 0.1375, position: 2.9 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["DESKTOP"], clicks: 14, impressions: 90, ctr: 0.1556, position: 2.4 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["usa"], clicks: 15, impressions: 95, ctr: 0.1579, position: 2.7 },
          ],
        }),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleSearchConsoleData({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: new Date("2026-05-31T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsc-token",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      startDate: "2026-05-31",
      endDate: "2026-06-01",
      dimensions: ["date"],
    }));
    expect(data).toEqual(expect.objectContaining({
      siteUrl: "https://example.com/",
      clicks: 20,
      impressions: 150,
      ctr: expect.closeTo(0.1333, 4),
      position: expect.closeTo(2.9667, 4),
      queryCount: 1,
      pageCount: 1,
    }));
    expect(data.dailyTrend).toEqual([
      { date: "2026-05-31", clicks: 12, impressions: 100, ctr: 0.12, position: 3.2 },
      { date: "2026-06-01", clicks: 8, impressions: 50, ctr: 0.16, position: 2.5 },
    ]);
    expect(data.topQueries[0]).toMatchObject({ query: "imladris analytics", clicks: 9 });
    expect(data.topPages[0]).toMatchObject({ page: "https://example.com/pricing", clicks: 11 });
    expect(data.devices[0]).toMatchObject({ device: "DESKTOP", clicks: 14 });
    expect(data.countries[0]).toMatchObject({ country: "usa", clicks: 15 });
  });

  it("preserves Search Console metrics when numeric fields arrive as strings", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              keys: ["2026-06-01"],
              clicks: "12",
              impressions: "1,200",
              ctr: "0.01",
              position: "3.5",
            },
            {
              keys: ["2026-06-02"],
              clicks: "bad",
              impressions: null,
              ctr: "not-a-number",
              position: "not-a-number",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["integration analytics"], clicks: "7", impressions: "700", ctr: "0.01", position: "4" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["https://example.com/analytics"], clicks: "9", impressions: "900", ctr: "0.01", position: "2" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["MOBILE"], clicks: "6", impressions: "600", ctr: "0.01", position: "5" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            { keys: ["usa"], clicks: "5", impressions: "500", ctr: "0.01", position: "6" },
          ],
        }),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleSearchConsoleData({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: new Date("2026-06-01T00:00:00.000Z"),
      toDate: new Date("2026-06-02T23:59:59.999Z"),
    });

    expect(data.clicks).toBe(12);
    expect(data.impressions).toBe(1200);
    expect(data.ctr).toBe(0.01);
    expect(data.position).toBe(3.5);
    expect(data.dailyTrend).toEqual([
      { date: "2026-06-01", clicks: 12, impressions: 1200, ctr: 0.01, position: 3.5 },
      { date: "2026-06-02", clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ]);
    expect(data.topQueries[0]).toMatchObject({ query: "integration analytics", clicks: 7, impressions: 700 });
    expect(data.topPages[0]).toMatchObject({ page: "https://example.com/analytics", clicks: 9, impressions: 900 });
    expect(data.devices[0]).toMatchObject({ device: "MOBILE", clicks: 6, impressions: 600 });
    expect(data.countries[0]).toMatchObject({ country: "usa", clicks: 5, impressions: 500 });
  });

  it("throws actionable errors when the Search Console API rejects a request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () => Promise.resolve(jsonResponse({ error: { message: "site not verified" } }, 403)),
      ) as unknown as typeof fetch,
    );

    await expect(
      fetchGoogleSearchConsoleData({
        accessToken: "gsc-token",
        siteUrl: "https://example.com/",
      }),
    ).rejects.toThrow("Google Search Console date request failed (403): site not verified");
  });

  it("bypasses fetch cache for OAuth token and Search Console query requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "gsc-token" });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as { dimensions?: string[] };
      const dimension = body.dimensions?.[0] ?? "";

      if (dimension === "date") {
        return jsonResponse({ rows: [{ keys: ["2026-06-01"], clicks: 20, impressions: 100 }] });
      }
      if (dimension === "query") {
        return jsonResponse({ rows: [{ keys: ["integration analytics"], clicks: 7, impressions: 70 }] });
      }
      if (dimension === "page") {
        return jsonResponse({ rows: [{ keys: ["https://example.com/analytics"], clicks: 9, impressions: 90 }] });
      }
      if (dimension === "device") {
        return jsonResponse({ rows: [{ keys: ["DESKTOP"], clicks: 4, impressions: 40 }] });
      }
      if (dimension === "country") {
        return jsonResponse({ rows: [{ keys: ["usa"], clicks: 5, impressions: 50 }] });
      }

      throw new Error(`Unexpected Search Console dimension: ${dimension}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchGoogleSearchConsoleData({
      refreshToken: "refresh-token",
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      siteUrl: "https://example.com/",
      fromDate: new Date("2026-06-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });

    expect(fetchMock.mock.calls).toHaveLength(6);
    expect(fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store")).toBe(true);
  });

  it("paginates Search Console dimension rows with startRow before computing counts", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensions?: string[];
        rowLimit?: number;
        startRow?: number;
      };
      const dimension = body.dimensions?.[0] ?? "";

      if (dimension === "date") {
        return jsonResponse({
          rows: [{ keys: ["2026-06-01"], clicks: 20, impressions: 100, ctr: 0.2, position: 2 }],
        });
      }

      if (dimension === "query") {
        if (body.startRow === body.rowLimit) {
          return jsonResponse({
            rows: [{ keys: ["second page query"], clicks: 3, impressions: 20, ctr: 0.15, position: 4 }],
          });
        }
        return jsonResponse({
          rows: Array.from({ length: body.rowLimit ?? 0 }, (_, index) => ({
            keys: [index === 0 ? "first page query" : `first page query ${index + 1}`],
            clicks: index === 0 ? 9 : 1,
            impressions: index === 0 ? 70 : 10,
            ctr: 0.1,
            position: 2 + index,
          })),
        });
      }

      if (dimension === "page") {
        return jsonResponse({ rows: [{ keys: ["https://example.com/pricing"], clicks: 11, impressions: 80 }] });
      }

      if (dimension === "device") {
        return jsonResponse({ rows: [{ keys: ["DESKTOP"], clicks: 14, impressions: 90 }] });
      }

      if (dimension === "country") {
        return jsonResponse({ rows: [{ keys: ["usa"], clicks: 15, impressions: 95 }] });
      }

      throw new Error(`Unexpected Search Console dimension: ${dimension}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleSearchConsoleData({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: new Date("2026-06-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    const queryRequests = fetchMock.mock.calls
      .map(
        ([, init]) =>
          JSON.parse(String(init?.body ?? "{}")) as {
            dimensions?: string[];
            rowLimit?: number;
            startRow?: number;
          },
      )
      .filter((body) => body.dimensions?.[0] === "query");

    expect(queryRequests).toHaveLength(2);
    expect(queryRequests[1]?.startRow).toBe(queryRequests[0]?.rowLimit);
    expect(data.topQueries.slice(0, 2).map((row) => row.query)).toEqual([
      "first page query",
      "first page query 2",
    ]);
    expect(data.topQueries.at(-1)?.query).toBe("second page query");
    expect(data.queryCount).toBe((queryRequests[0]?.rowLimit ?? 0) + 1);
  });

  it("marks Search Console payloads truncated when a dimension page cap is reached with a full page", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensions?: string[];
        rowLimit?: number;
        startRow?: number;
      };
      const dimension = body.dimensions?.[0] ?? "";

      if (dimension === "date") {
        return jsonResponse({
          rows: [{ keys: ["2026-06-01"], clicks: 20, impressions: 100, ctr: 0.2, position: 2 }],
        });
      }

      if (dimension === "query") {
        const rowLimit = body.rowLimit ?? 0;
        const startRow = body.startRow ?? 0;
        return jsonResponse({
          rows: Array.from({ length: rowLimit }, (_, index) => ({
            keys: [`query-${startRow + index + 1}`],
            clicks: 1,
            impressions: 10,
            ctr: 0.1,
            position: 5,
          })),
        });
      }

      if (dimension === "page") {
        return jsonResponse({ rows: [{ keys: ["https://example.com/pricing"], clicks: 11, impressions: 80 }] });
      }

      if (dimension === "device") {
        return jsonResponse({ rows: [{ keys: ["DESKTOP"], clicks: 14, impressions: 90 }] });
      }

      if (dimension === "country") {
        return jsonResponse({ rows: [{ keys: ["usa"], clicks: 15, impressions: 95 }] });
      }

      throw new Error(`Unexpected Search Console dimension: ${dimension}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleSearchConsoleData({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: new Date("2026-06-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    const queryRequests = fetchMock.mock.calls
      .map(
        ([, init]) =>
          JSON.parse(String(init?.body ?? "{}")) as {
            dimensions?: string[];
            startRow?: number;
          },
      )
      .filter((body) => body.dimensions?.[0] === "query");

    expect(queryRequests).toHaveLength(100);
    expect(queryRequests.at(-1)?.startRow).toBe(99_000);
    expect(data.queryCount).toBe(100_000);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["queries"],
    }));
  });
});
