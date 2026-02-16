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
  });

  it("exposes reddit in definitions list", () => {
    const slugs = listIntegrationDefinitions().map((definition) => definition.slug);
    expect(slugs).toContain("reddit");
  });
});
