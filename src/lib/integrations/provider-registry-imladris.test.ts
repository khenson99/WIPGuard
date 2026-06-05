import { describe, expect, it } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  listProviderRegistryEntries,
  providerForSnapshotKey,
  resolveProviderRegistryEntryBySlug,
  snapshotKeyQueryVariants,
} from "@/lib/integrations/provider-registry";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

describe("Imladris provider registry coverage", () => {
  it("registers PostHog, Linear, GitHub, Unify, and Reddit as first-class Imladris sources", () => {
    expect(resolveProviderRegistryEntryBySlug("posthog")).toMatchObject({
      provider: IntegrationProvider.POSTHOG,
      snapshotKeys: ["posthog", "product"],
    });
    expect(resolveProviderRegistryEntryBySlug("linear")).toMatchObject({
      provider: IntegrationProvider.LINEAR,
      snapshotKeys: ["linear"],
    });
    expect(resolveProviderRegistryEntryBySlug("github")).toMatchObject({
      provider: IntegrationProvider.GITHUB,
      snapshotKeys: ["github"],
    });
    expect(resolveProviderRegistryEntryBySlug("unify")).toMatchObject({
      provider: IntegrationProvider.UNIFY,
      snapshotKeys: ["unify", "visitorFunnel"],
    });
    expect(resolveProviderRegistryEntryBySlug("reddit")).toMatchObject({
      provider: IntegrationProvider.REDDIT,
      snapshotKeys: ["redditAds", "redditOps"],
    });

    expect(providerForSnapshotKey("posthog")).toBe(IntegrationProvider.POSTHOG);
    expect(providerForSnapshotKey("linear")).toBe(IntegrationProvider.LINEAR);
    expect(providerForSnapshotKey("github")).toBe(IntegrationProvider.GITHUB);
    expect(providerForSnapshotKey("unify")).toBe(IntegrationProvider.UNIFY);
    expect(providerForSnapshotKey("redditAds")).toBe(IntegrationProvider.REDDIT);
  });

  it("normalizes snapshot key aliases used by Imladris backfills", () => {
    expect(providerForSnapshotKey("Google Analytics")).toBe(IntegrationProvider.GOOGLE_ANALYTICS);
    expect(providerForSnapshotKey("google_analytics")).toBe(IntegrationProvider.GOOGLE_ANALYTICS);
    expect(providerForSnapshotKey("google-analytics")).toBe(IntegrationProvider.GOOGLE_ANALYTICS);
    expect(providerForSnapshotKey("sales-performance")).toBe(IntegrationProvider.HUBSPOT);
    expect(providerForSnapshotKey("product")).toBe(IntegrationProvider.POSTHOG);
  });

  it("expands snapshot key aliases back to the canonical key without sibling payloads", () => {
    expect(snapshotKeyQueryVariants(["google_analytics"])).toEqual(
      expect.arrayContaining(["googleAnalytics", "google_analytics", "google-analytics"])
    );
    expect(snapshotKeyQueryVariants(["sales-performance"])).toEqual(
      expect.arrayContaining(["salesPerformance", "sales_performance", "sales-performance"])
    );
    expect(snapshotKeyQueryVariants(["sales-performance"])).not.toContain("hubspot");
    expect(snapshotKeyQueryVariants(["sales-performance"])).not.toContain("hubspotOps");
  });

  it("does not expose WIPGuard as a provider source", () => {
    expect(listProviderRegistryEntries().find((entry) => entry.slug === "wipguard")).toBeUndefined();
    expect(resolveProviderRegistryEntryBySlug("wipguard")).toBeNull();
  });

  it("defines token-based setup entries for new source systems", () => {
    expect(getIntegrationDefinition("posthog")).toMatchObject({
      provider: IntegrationProvider.POSTHOG,
      authType: "token",
    });
    expect(getIntegrationDefinition("linear")).toMatchObject({
      provider: IntegrationProvider.LINEAR,
      authType: "token",
    });
    expect(getIntegrationDefinition("github")).toMatchObject({
      provider: IntegrationProvider.GITHUB,
      authType: "token",
    });
    expect(getIntegrationDefinition("unify")).toMatchObject({
      provider: IntegrationProvider.UNIFY,
      authType: "token",
    });
    expect(getIntegrationDefinition("reddit")).toMatchObject({
      provider: IntegrationProvider.REDDIT,
      authType: "oauth",
    });
  });
});
