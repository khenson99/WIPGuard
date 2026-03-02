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
