import { describe, expect, it } from "vitest";
import {
  getIntegrationBySlug,
  isOAuthIntegration,
  listIntegrationDefinitions,
} from "@/lib/integrations/catalog";

describe("integrations catalog", () => {
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
});
