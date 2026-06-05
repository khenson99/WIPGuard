import { afterEach, describe, expect, it, vi } from "vitest";
import { getIntegrationBySlug, isOAuthIntegration } from "@/lib/integrations/catalog";
import {
  fetchOAuthAccountProfile,
  verifyPostHogApiToken,
  verifyPylonApiToken,
} from "@/lib/integrations/oauth";

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

  it("accepts the live /me response shape", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: "206a32d5-9d1c-4f36-9d45-196b70775af9",
            name: "Arda",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const profile = await verifyPylonApiToken("token");

    expect(profile).toEqual({
      providerAccountId: "206a32d5-9d1c-4f36-9d45-196b70775af9",
      accountLabel: "Arda",
      metadata: {
        name: "Arda",
        email: null,
        username: null,
      },
    });
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

describe("verifyPostHogApiToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a personal API key against the configured project", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 12345,
          name: "Arda Product",
          organization: {
            name: "Arda",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const profile = await verifyPostHogApiToken({
      token: "phx_token",
      projectId: "12345",
      host: "https://us.posthog.com/",
    });

    expect(fetch).toHaveBeenCalledWith("https://us.posthog.com/api/projects/12345/", {
      headers: { Authorization: "Bearer phx_token" },
      cache: "no-store",
    });
    expect(profile).toEqual({
      providerAccountId: "12345",
      accountLabel: "Arda Product",
      metadata: {
        projectId: "12345",
        host: "https://us.posthog.com",
        projectName: "Arda Product",
        organizationName: "Arda",
      },
    });
  });

  it("surfaces PostHog API errors without leaking the token", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid token" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(
      verifyPostHogApiToken({
        token: "phx_secret",
        projectId: "12345",
        host: "https://app.posthog.com",
      })
    ).rejects.toThrow("Invalid token");
  });
});
