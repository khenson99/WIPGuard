import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("webflow fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws actionable error when required Webflow scopes are missing", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { message: "OAuthForbidden: missing scope sites:read" },
        403
      )
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(fetchWebflowData("token", "site-id")).rejects.toThrow(
      "Webflow site request failed (403): OAuthForbidden: missing scope sites:read (check both read/write scopes; read scopes are required for analytics pulls)"
    );
  });

  it("parses pages/collections/form submissions with enriched data", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          displayName: "Arda Site",
          lastPublishedOn: "2026-02-01T00:00:00.000Z",
          customDomains: [{ host: "arda.cards" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pages: [
            {
              id: "p1",
              title: "Home",
              slug: "home",
              createdOn: "2025-01-01T00:00:00.000Z",
              updatedOn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              draft: false,
              archived: false,
              seo: { title: "Home | Arda", description: "Welcome to Arda" },
              openGraph: { imageUrl: "https://example.com/og.png" },
            },
            {
              id: "p2",
              title: "About",
              slug: "about",
              createdOn: "2025-01-02T00:00:00.000Z",
              updatedOn: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
              draft: true,
              archived: false,
              seo: {},
              openGraph: {},
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          collections: [
            { id: "c1", displayName: "Blog Posts", slug: "blog-posts", itemCount: 15 },
            { id: "c2", displayName: "Team", slug: "team", itemCount: 0 },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          formSubmissions: [
            { formId: "f1", formName: "Contact", createdOn: "2026-02-15T10:00:00.000Z" },
            { formId: "f1", formName: "Contact", createdOn: "2026-02-15T14:00:00.000Z" },
            { formId: "f2", formName: "Newsletter", createdOn: "2026-02-16T09:00:00.000Z" },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    // Basic fields still work
    expect(data.siteName).toBe("Arda Site");
    expect(data.totalPages).toBe(2);
    expect(data.totalCollections).toBe(2);
    expect(data.customDomains).toEqual(["arda.cards"]);

    // Removed fields should NOT exist
    expect(data).not.toHaveProperty("traffic");
    expect(data).not.toHaveProperty("bounceRate");
    expect(data).not.toHaveProperty("clicks");
    expect(data).not.toHaveProperty("returningVisitors");

    // Page details
    expect(data.pages).toHaveLength(2);
    expect(data.pages[0].title).toBe("Home");
    expect(data.pages[0].seoTitle).toBe("Home | Arda");
    expect(data.pages[0].seoDescription).toBe("Welcome to Arda");
    expect(data.pages[0].openGraphImageUrl).toBe("https://example.com/og.png");
    expect(data.pages[1].title).toBe("About");
    expect(data.pages[1].draft).toBe(true);
    expect(data.pages[1].seoTitle).toBeNull();

    // Page counts
    expect(data.publishedPages).toBe(1);
    expect(data.draftPages).toBe(1);
    expect(data.archivedPages).toBe(0);

    // Collection details
    expect(data.collections).toHaveLength(2);
    expect(data.collections[0].displayName).toBe("Blog Posts");
    expect(data.collections[0].itemCount).toBe(15);
    expect(data.totalCmsItems).toBe(15);
    expect(data.emptyCollections).toBe(1);

    // Form data
    expect(data.formSubmissions).toEqual(
      expect.arrayContaining([
        { formName: "Contact", count: 2 },
        { formName: "Newsletter", count: 1 },
      ])
    );
    expect(data.totalFormSubmissions).toBe(3);

    // Form trend (bucketed by day)
    expect(data.formTrend).toEqual([
      { date: "2026-02-15", submissions: 2 },
      { date: "2026-02-16", submissions: 1 },
    ]);
  });

  it("preserves Webflow collection item counts when they arrive as formatted strings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v2/sites/site-id") {
        return jsonResponse({
          displayName: "Arda Site",
          lastPublishedOn: "2026-02-01T00:00:00.000Z",
          customDomains: [],
        });
      }

      if (url.pathname === "/v2/sites/site-id/pages") {
        return jsonResponse({ pages: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      if (url.pathname === "/v2/sites/site-id/collections") {
        return jsonResponse({
          collections: [
            { id: "c1", displayName: "Blog Posts", slug: "blog-posts", itemCount: "1,200" },
            { id: "c2", displayName: "Customers", slug: "customers", itemCount: "25" },
            { id: "c3", displayName: "Empty", slug: "empty", itemCount: "0" },
            { id: "c4", displayName: "Unknown", slug: "unknown", itemCount: "not-a-number" },
          ],
          pagination: { total: 4, offset: 0, limit: 100 },
        });
      }

      if (url.pathname === "/v2/sites/site-id/form_submissions") {
        return jsonResponse({ formSubmissions: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      throw new Error(`Unexpected Webflow request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    expect(data.collections.map((collection) => collection.itemCount)).toEqual([
      1200,
      25,
      0,
      0,
    ]);
    expect(data.totalCmsItems).toBe(1225);
    expect(data.emptyCollections).toBe(2);
  });

  it("bypasses fetch cache for Webflow site, page, collection, and form requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = new URL(String(input));

      if (url.pathname === "/v2/sites/site-id") {
        return jsonResponse({
          displayName: "Arda Site",
          lastPublishedOn: "2026-02-01T00:00:00.000Z",
          customDomains: [],
        });
      }

      if (url.pathname === "/v2/sites/site-id/pages") {
        return jsonResponse({ pages: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      if (url.pathname === "/v2/sites/site-id/collections") {
        return jsonResponse({ collections: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      if (url.pathname === "/v2/sites/site-id/form_submissions") {
        return jsonResponse({ formSubmissions: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      throw new Error(`Unexpected Webflow request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchWebflowData("token", "site-id");

    const providerCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith("https://api.webflow.com/v2/"),
    );

    expect(providerCalls).toHaveLength(4);
    expect(providerCalls.every(([, init]) => init?.cache === "no-store")).toBe(true);
  });

  it("paginates Webflow pages and form submissions before computing operating metrics", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = url.searchParams.get("offset") ?? "0";

      if (url.pathname === "/v2/sites/site-id") {
        return jsonResponse({
          displayName: "Arda Site",
          lastPublishedOn: "2026-02-01T00:00:00.000Z",
          customDomains: [],
        });
      }

      if (url.pathname === "/v2/sites/site-id/pages") {
        if (offset === "100") {
          return jsonResponse({
            pages: [
              {
                id: "p2",
                title: "Pricing",
                slug: "pricing",
                updatedOn: "2026-02-12T00:00:00.000Z",
                seo: { title: "Pricing | Arda", description: "Pricing details" },
                openGraph: {},
              },
            ],
            pagination: { total: 101, offset: 100, limit: 100 },
          });
        }

        return jsonResponse({
          pages: [
            {
              id: "p1",
              title: "Home",
              slug: "home",
              updatedOn: "2026-02-11T00:00:00.000Z",
              seo: { title: "Home | Arda", description: "Welcome" },
              openGraph: {},
            },
          ],
          pagination: { total: 101, offset: 0, limit: 100 },
        });
      }

      if (url.pathname === "/v2/sites/site-id/collections") {
        return jsonResponse({ collections: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      if (url.pathname === "/v2/sites/site-id/form_submissions") {
        if (offset === "100") {
          return jsonResponse({
            formSubmissions: [
              { formId: "f2", formName: "Demo", createdOn: "2026-02-16T10:00:00.000Z" },
            ],
            pagination: { total: 101, offset: 100, limit: 100 },
          });
        }

        return jsonResponse({
          formSubmissions: [
            { formId: "f1", formName: "Contact", createdOn: "2026-02-15T10:00:00.000Z" },
          ],
          pagination: { total: 101, offset: 0, limit: 100 },
        });
      }

      throw new Error(`Unexpected Webflow request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id", new Date("2026-02-01T00:00:00.000Z"), new Date("2026-02-28T23:59:59.999Z"));
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    const pageRequests = urls.filter((url) => url.pathname === "/v2/sites/site-id/pages");
    const formRequests = urls.filter((url) => url.pathname === "/v2/sites/site-id/form_submissions");

    expect(pageRequests).toHaveLength(2);
    expect(pageRequests[1]?.searchParams.get("offset")).toBe("100");
    expect(formRequests).toHaveLength(2);
    expect(formRequests[1]?.searchParams.get("offset")).toBe("100");
    expect(data.pages.map((page) => page.id)).toEqual(["p1", "p2"]);
    expect(data.totalPages).toBe(2);
    expect(data.formSubmissions).toEqual([
      { formName: "Contact", count: 1 },
      { formName: "Demo", count: 1 },
    ]);
    expect(data.totalFormSubmissions).toBe(2);
  });

  it("marks Webflow form submissions unavailable when that endpoint fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v2/sites/site-id") {
        return jsonResponse({
          displayName: "Arda Site",
          lastPublishedOn: "2026-02-01T00:00:00.000Z",
          customDomains: [],
        });
      }

      if (url.pathname === "/v2/sites/site-id/pages") {
        return jsonResponse({
          pages: [
            {
              id: "p1",
              title: "Home",
              slug: "home",
              updatedOn: "2026-02-11T00:00:00.000Z",
              seo: { title: "Home | Arda", description: "Welcome" },
              openGraph: {},
            },
          ],
          pagination: { total: 1, offset: 0, limit: 100 },
        });
      }

      if (url.pathname === "/v2/sites/site-id/collections") {
        return jsonResponse({ collections: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      if (url.pathname === "/v2/sites/site-id/form_submissions") {
        return jsonResponse({ message: "OAuthForbidden: missing scope forms:read" }, 403);
      }

      throw new Error(`Unexpected Webflow request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    expect(data.pages).toHaveLength(1);
    expect(data.formSubmissions).toEqual([]);
    expect(data.totalFormSubmissions).toBe(0);
    expect(data._meta.diagnostics).toEqual(expect.objectContaining({
      formSubmissionsAvailable: false,
      formSubmissionsError: expect.stringContaining("missing scope forms:read"),
    }));
  });

  it("marks Webflow payloads truncated when page pagination exceeds the page cap", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") ?? "0");

      if (url.pathname === "/v2/sites/site-id") {
        return jsonResponse({
          displayName: "Arda Site",
          lastPublishedOn: "2026-02-01T00:00:00.000Z",
          customDomains: [],
        });
      }

      if (url.pathname === "/v2/sites/site-id/pages") {
        return jsonResponse({
          pages: [
            {
              id: `page-${offset}`,
              title: `Page ${offset}`,
              slug: `page-${offset}`,
              updatedOn: "2026-02-11T00:00:00.000Z",
              seo: {},
              openGraph: {},
            },
          ],
          pagination: { total: 10_001, offset, limit: 100 },
        });
      }

      if (url.pathname === "/v2/sites/site-id/collections") {
        return jsonResponse({ collections: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      if (url.pathname === "/v2/sites/site-id/form_submissions") {
        return jsonResponse({ formSubmissions: [], pagination: { total: 0, offset: 0, limit: 100 } });
      }

      throw new Error(`Unexpected Webflow request: ${url.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");
    const pageRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/v2/sites/site-id/pages");

    expect(pageRequests).toHaveLength(100);
    expect(pageRequests.at(-1)?.searchParams.get("offset")).toBe("9900");
    expect(data.pages).toHaveLength(100);
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["pages"],
    }));
  });

  it("computes SEO audit score correctly", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          displayName: "SEO Test",
          lastPublishedOn: "2026-01-01T00:00:00.000Z",
          customDomains: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pages: [
            // Full SEO
            {
              id: "p1", title: "Page 1", slug: "p1",
              seo: { title: "P1 Title", description: "P1 Desc" },
              openGraph: { imageUrl: "https://example.com/og1.png" },
            },
            // Partial SEO (title only)
            {
              id: "p2", title: "Page 2", slug: "p2",
              seo: { title: "P2 Title" },
              openGraph: {},
            },
            // No SEO
            {
              id: "p3", title: "Page 3", slug: "p3",
              seo: {},
              openGraph: {},
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ collections: [] }))
      .mockResolvedValueOnce(jsonResponse({ formSubmissions: [] }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    expect(data.seoAudit.totalPages).toBe(3);
    expect(data.seoAudit.pagesWithSeoTitle).toBe(2);
    expect(data.seoAudit.pagesWithSeoDescription).toBe(1);
    expect(data.seoAudit.pagesWithOgImage).toBe(1);
    // Score: round(40*(2/3) + 40*(1/3) + 20*(1/3)) = round(26.67 + 13.33 + 6.67) = 47
    expect(data.seoAudit.seoScore).toBe(47);
  });

  it("buckets content freshness by updatedOn date", async () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          displayName: "Freshness Test",
          lastPublishedOn: "2026-01-01T00:00:00.000Z",
          customDomains: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pages: [
            { id: "p1", title: "Fresh", slug: "fresh", updatedOn: new Date(now - 3 * dayMs).toISOString() },
            { id: "p2", title: "Recent", slug: "recent", updatedOn: new Date(now - 20 * dayMs).toISOString() },
            { id: "p3", title: "Aging", slug: "aging", updatedOn: new Date(now - 60 * dayMs).toISOString() },
            { id: "p4", title: "Stale", slug: "stale", updatedOn: new Date(now - 120 * dayMs).toISOString() },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ collections: [] }))
      .mockResolvedValueOnce(jsonResponse({ formSubmissions: [] }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    expect(data.contentFreshness.updatedLast7d).toBe(1);
    expect(data.contentFreshness.updatedLast30d).toBe(2);
    expect(data.contentFreshness.updatedLast90d).toBe(3);
    expect(data.contentFreshness.staleOver90d).toBe(1);
  });

  it("handles pages with missing optional fields gracefully", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Bare Site",
          customDomains: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pages: [
            { id: "p1", name: "Minimal Page" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          collections: [
            { id: "c1", name: "Bare Collection" },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ formSubmissions: [] }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    expect(data.siteName).toBe("Bare Site");
    expect(data.pages[0].title).toBe("Minimal Page");
    expect(data.pages[0].slug).toBe("");
    expect(data.pages[0].createdOn).toBeNull();
    expect(data.pages[0].updatedOn).toBeNull();
    expect(data.pages[0].seoTitle).toBeNull();
    expect(data.pages[0].seoDescription).toBeNull();
    expect(data.pages[0].openGraphImageUrl).toBeNull();
    expect(data.pages[0].draft).toBe(false);
    expect(data.pages[0].archived).toBe(false);

    // Page with no updatedOn goes into stale bucket
    expect(data.contentFreshness.staleOver90d).toBe(1);

    // Collection with no itemCount defaults to 0
    expect(data.collections[0].itemCount).toBe(0);
    expect(data.collections[0].displayName).toBe("Bare Collection");
  });
});
