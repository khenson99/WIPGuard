import { afterEach, describe, expect, it } from "vitest";
import {
  getIntegrationBySlug,
  getIntegrationOAuthCredentials,
  isOAuthIntegration,
  listIntegrationDefinitions,
} from "@/lib/integrations/catalog";

describe("integrations catalog", () => {
  afterEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_CLIENT_ID;
    delete process.env.META_CLIENT_SECRET;
  });

  it("includes reddit as an oauth integration", () => {
    const reddit = getIntegrationBySlug("reddit");

    expect(reddit).not.toBeNull();
    expect(reddit?.provider).toBe("REDDIT");
    expect(reddit ? isOAuthIntegration(reddit) : false).toBe(true);
    expect(reddit?.authType).toBe("oauth");
    expect(reddit?.oauth?.scopes).toContain("adsread");
  });

  it("exposes reddit in definitions list", () => {
    const slugs = listIntegrationDefinitions().map((definition) => definition.slug);
    expect(slugs).toContain("reddit");
  });

  it("includes stripe and mercury as oauth integrations", () => {
    const stripe = getIntegrationBySlug("stripe");
    const mercury = getIntegrationBySlug("mercury");

    expect(stripe).not.toBeNull();
    expect(stripe?.provider).toBe("STRIPE");
    expect(stripe ? isOAuthIntegration(stripe) : false).toBe(true);

    expect(mercury).not.toBeNull();
    expect(mercury?.provider).toBe("MERCURY");
    expect(mercury ? isOAuthIntegration(mercury) : false).toBe(true);
  });

  it("includes webflow as an oauth integration", () => {
    const webflow = getIntegrationBySlug("webflow");

    expect(webflow).not.toBeNull();
    expect(webflow?.provider).toBe("WEBFLOW");
    expect(webflow ? isOAuthIntegration(webflow) : false).toBe(true);
    expect(webflow?.oauth?.scopes).toContain("sites:read");
  });

  it("includes google search console and omits retired WIPGuard definitions", () => {
    const gsc = getIntegrationBySlug("google-search-console");
    const wipguard = getIntegrationBySlug("wipguard");

    expect(gsc).not.toBeNull();
    expect(gsc?.provider).toBe("GOOGLE_SEARCH_CONSOLE");
    expect(wipguard).toBeNull();
  });

  it("accepts legacy Meta env aliases for OAuth client credentials", () => {
    process.env.META_CLIENT_ID = "legacy-meta-client";
    process.env.META_CLIENT_SECRET = "legacy-meta-secret";

    const metaAds = getIntegrationBySlug("meta-ads");
    if (!metaAds || !isOAuthIntegration(metaAds)) {
      throw new Error("Meta Ads integration definition must exist");
    }

    expect(getIntegrationOAuthCredentials(metaAds)).toEqual({
      clientId: "legacy-meta-client",
      clientSecret: "legacy-meta-secret",
    });
  });
});
