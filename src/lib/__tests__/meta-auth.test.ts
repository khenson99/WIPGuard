import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverMetaAdAccountId,
  discoverMetaPageAndInstagram,
} from "@/lib/integrations/meta-auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("meta auth discovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("paginates Meta ad account discovery until an account is found", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/me/adaccounts")) {
        if (url.searchParams.get("after") === "cursor_2") {
          return jsonResponse({
            data: [{ id: "act_123456789", name: "Seed Ads", account_id: "123456789" }],
          });
        }

        return jsonResponse({
          data: [],
          paging: {
            next: "https://graph.facebook.com/v21.0/me/adaccounts?after=cursor_2",
          },
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(discoverMetaAdAccountId({ accessToken: "token" })).resolves.toBe("123456789");
    const adAccountRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/me/adaccounts"));

    expect(adAccountRequests).toHaveLength(2);
    expect(adAccountRequests[1]?.searchParams.get("after")).toBe("cursor_2");
  });

  it("paginates Meta page discovery until an Instagram account is found", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/me/accounts")) {
        if (url.searchParams.get("after") === "cursor_2") {
          return jsonResponse({
            data: [
              {
                id: "page_2",
                name: "Second Page",
                instagram_business_account: { id: "ig_2", username: "second" },
              },
            ],
          });
        }

        return jsonResponse({
          data: [{ id: "page_1", name: "First Page" }],
          paging: {
            next: "https://graph.facebook.com/v21.0/me/accounts?after=cursor_2",
          },
        });
      }

      return jsonResponse({ error: "unexpected request", url: String(url) }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(discoverMetaPageAndInstagram({ accessToken: "token" })).resolves.toEqual({
      pageId: "page_1",
      instagramAccountId: "ig_2",
    });
    const pageRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/me/accounts"));

    expect(pageRequests).toHaveLength(2);
    expect(pageRequests[1]?.searchParams.get("after")).toBe("cursor_2");
  });
});
