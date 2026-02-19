import { afterEach, describe, expect, it, vi } from "vitest";
import { getIntegrationBySlug, isOAuthIntegration } from "@/lib/integrations/catalog";
import { fetchOAuthAccountProfile } from "@/lib/integrations/oauth";

describe("fetchOAuthAccountProfile webflow", () => {
  const webflow = getIntegrationBySlug("webflow");
  if (!webflow || !isOAuthIntegration(webflow)) {
    throw new Error("Webflow integration definition must exist");
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses token authorized_by response when available", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "user_123", email: "owner@example.com", fullName: "Owner" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sites: [{ id: "site_123", displayName: "Primary Site" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const profile = await fetchOAuthAccountProfile(webflow, "token");

    expect(profile.providerAccountId).toBe("user_123");
    expect(profile.accountLabel).toBe("owner@example.com");
    expect(profile.metadata).toMatchObject({
      userEmail: "owner@example.com",
      userName: "Owner",
      defaultSiteId: "site_123",
    });
  });

  it("falls back to sites endpoint when authorized_by is unavailable", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sites: [{ id: "site_abc", displayName: "Arda Site" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      );

    const profile = await fetchOAuthAccountProfile(webflow, "token");

    expect(profile.providerAccountId).toBe("site_abc");
    expect(profile.accountLabel).toBe("Arda Site");
    expect(profile.metadata).toMatchObject({ siteId: "site_abc" });
  });
});
