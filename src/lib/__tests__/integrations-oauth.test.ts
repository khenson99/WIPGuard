import { afterEach, describe, expect, it, vi } from "vitest";
import { getIntegrationBySlug, isOAuthIntegration } from "@/lib/integrations/catalog";
import { fetchOAuthAccountProfile, verifyPylonApiToken } from "@/lib/integrations/oauth";

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

describe("fetchOAuthAccountProfile google ads", () => {
  const googleAds = getIntegrationBySlug("google-ads");
  if (!googleAds || !isOAuthIntegration(googleAds)) {
    throw new Error("Google Ads integration definition must exist");
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses OpenID Connect userinfo profile", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sub: "google-sub",
          email: "ads@example.com",
          name: "Ads User",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const profile = await fetchOAuthAccountProfile(googleAds, "token");

    expect(profile.providerAccountId).toBe("google-sub");
    expect(profile.accountLabel).toBe("ads@example.com");
    expect(profile.metadata).toMatchObject({
      email: "ads@example.com",
      name: "Ads User",
    });
  });
});

describe("verifyPylonApiToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to issues probe when identity endpoints return 404", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const profile = await verifyPylonApiToken("token");

    expect(profile).toEqual({
      providerAccountId: "pylon-token",
      accountLabel: "Pylon API token",
      metadata: {
        fallback: "issues_probe",
      },
    });
  });

  it("surfaces the last failing status when all probes fail", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(verifyPylonApiToken("token")).rejects.toThrow(
      "Pylon token verification failed (404)"
    );
  });
});
