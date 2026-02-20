import { IntegrationProvider } from "@/generated/prisma/client";

export type ProviderAuthType = "oauth" | "token";

export interface IntegrationProviderRegistryEntry {
  provider: IntegrationProvider;
  slug: string;
  authType: ProviderAuthType;
  snapshotKeys: string[];
  settingsVisible: boolean;
  envManaged: boolean;
  aliases: string[];
}

const INTEGRATION_PROVIDER_REGISTRY: readonly IntegrationProviderRegistryEntry[] = [
  {
    provider: IntegrationProvider.GOOGLE_WORKSPACE,
    slug: "google-workspace",
    authType: "oauth",
    snapshotKeys: ["googleWorkspace"],
    settingsVisible: true,
    envManaged: false,
    aliases: ["google_workspace", "google", "workspace"],
  },
  {
    provider: IntegrationProvider.HUBSPOT,
    slug: "hubspot",
    authType: "oauth",
    snapshotKeys: ["hubspot", "hubspotOps"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["hub_spot"],
  },
  {
    provider: IntegrationProvider.SLACK,
    slug: "slack",
    authType: "oauth",
    snapshotKeys: ["slack"],
    settingsVisible: true,
    envManaged: false,
    aliases: [],
  },
  {
    provider: IntegrationProvider.CODA,
    slug: "coda",
    authType: "token",
    snapshotKeys: ["coda", "codaOps"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.REDDIT,
    slug: "reddit",
    authType: "oauth",
    snapshotKeys: ["redditAds", "redditOps"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.STRIPE,
    slug: "stripe",
    authType: "oauth",
    snapshotKeys: ["stripe"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.MERCURY,
    slug: "mercury",
    authType: "oauth",
    snapshotKeys: ["mercury"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.WEBFLOW,
    slug: "webflow",
    authType: "oauth",
    snapshotKeys: ["webflow"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.GOOGLE_ADS,
    slug: "google-ads",
    authType: "oauth",
    snapshotKeys: ["googleAds"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["google_ads"],
  },
  {
    provider: IntegrationProvider.META_ADS,
    slug: "meta-ads",
    authType: "oauth",
    snapshotKeys: ["metaAds"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["meta_ads", "meta", "facebook-ads"],
  },
  {
    provider: IntegrationProvider.META_PAGE,
    slug: "meta-page",
    authType: "token",
    snapshotKeys: ["metaPage", "instagram"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["meta_page", "facebook-page", "instagram"],
  },
  {
    provider: IntegrationProvider.PYLON,
    slug: "pylon",
    authType: "token",
    snapshotKeys: ["pylon"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
] as const;

const PROVIDER_LOOKUP = new Map(
  INTEGRATION_PROVIDER_REGISTRY.map((entry) => [entry.provider, entry] as const)
);

const SLUG_ALIAS_LOOKUP = new Map<string, IntegrationProviderRegistryEntry>();
for (const entry of INTEGRATION_PROVIDER_REGISTRY) {
  SLUG_ALIAS_LOOKUP.set(entry.slug, entry);
  for (const alias of entry.aliases) {
    SLUG_ALIAS_LOOKUP.set(alias, entry);
  }
}

const SNAPSHOT_KEY_LOOKUP = new Map<string, IntegrationProvider>();
for (const entry of INTEGRATION_PROVIDER_REGISTRY) {
  for (const snapshotKey of entry.snapshotKeys) {
    SNAPSHOT_KEY_LOOKUP.set(snapshotKey, entry.provider);
  }
}

export function listProviderRegistryEntries(): readonly IntegrationProviderRegistryEntry[] {
  return INTEGRATION_PROVIDER_REGISTRY;
}

export function getProviderRegistryEntry(
  provider: IntegrationProvider
): IntegrationProviderRegistryEntry | null {
  return PROVIDER_LOOKUP.get(provider) ?? null;
}

export function resolveProviderRegistryEntryBySlug(
  slugOrAlias: string
): IntegrationProviderRegistryEntry | null {
  return SLUG_ALIAS_LOOKUP.get(slugOrAlias.trim().toLowerCase()) ?? null;
}

export function providerForSnapshotKey(snapshotKey: string): IntegrationProvider | null {
  return SNAPSHOT_KEY_LOOKUP.get(snapshotKey) ?? null;
}

