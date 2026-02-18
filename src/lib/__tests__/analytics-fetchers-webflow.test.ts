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

  it("parses pages/collections/form submissions from v2 response variants", async () => {
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
          pages: [{ id: "p1" }, { id: "p2" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          collections: [{ id: "c1" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          formSubmissions: [
            { formId: "f1", formName: "Contact" },
            { formId: "f1", formName: "Contact" },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchWebflowData("token", "site-id");

    expect(data.siteName).toBe("Arda Site");
    expect(data.totalPages).toBe(2);
    expect(data.totalCollections).toBe(1);
    expect(data.customDomains).toEqual(["arda.cards"]);
    expect(data.formSubmissions).toEqual([{ formName: "Contact", count: 2 }]);
  });
});
