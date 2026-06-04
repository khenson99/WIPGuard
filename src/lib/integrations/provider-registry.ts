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
    snapshotKeys: ["hubspot", "hubspotOps", "salesPerformance"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["hub_spot", "sales-performance", "sales_performance"],
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
    provider: IntegrationProvider.GOOGLE_ANALYTICS,
    slug: "google-analytics",
    authType: "token",
    snapshotKeys: ["googleAnalytics"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["google_analytics", "ga"],
  },
  {
    provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
    slug: "google-search-console",
    authType: "token",
    snapshotKeys: ["googleSearchConsole", "searchConsole"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["google_search_console", "gsc"],
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
    authType: "oauth",
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
  {
    provider: IntegrationProvider.POSTHOG,
    slug: "posthog",
    authType: "token",
    snapshotKeys: ["posthog", "product"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["post_hog"],
  },
  {
    provider: IntegrationProvider.LINEAR,
    slug: "linear",
    authType: "token",
    snapshotKeys: ["linear"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.GITHUB,
    slug: "github",
    authType: "token",
    snapshotKeys: ["github"],
    settingsVisible: true,
    envManaged: true,
    aliases: ["git_hub"],
  },
  {
    provider: IntegrationProvider.UNIFY,
    slug: "unify",
    authType: "token",
    snapshotKeys: ["unify", "visitorFunnel"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
  {
    provider: IntegrationProvider.SEMRUSH,
    slug: "semrush",
    authType: "token",
    snapshotKeys: ["semrush"],
    settingsVisible: true,
    envManaged: true,
    aliases: [],
  },
] as const;

const PROVIDER_LOOKUP = new Map(
  INTEGRATION_PROVIDER_REGISTRY.map((entry) => [entry.provider, entry] as const)
);

function normalizeProviderRegistryKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function providerRegistryKeyVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const snakeCase = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const variants = new Set([
    trimmed,
    trimmed.toLowerCase(),
    normalizeProviderRegistryKey(trimmed),
  ]);
  if (snakeCase) {
    variants.add(snakeCase);
    variants.add(snakeCase.replaceAll("_", "-"));
    variants.add(snakeCase.replaceAll("_", ""));
  }
  return [...variants];
}

const SLUG_ALIAS_LOOKUP = new Map<string, IntegrationProviderRegistryEntry>();
for (const entry of INTEGRATION_PROVIDER_REGISTRY) {
  for (const alias of [entry.slug, ...entry.aliases]) {
    for (const variant of providerRegistryKeyVariants(alias)) {
      SLUG_ALIAS_LOOKUP.set(normalizeProviderRegistryKey(variant), entry);
    }
  }
}

const SNAPSHOT_KEY_LOOKUP = new Map<string, IntegrationProvider>();
for (const entry of INTEGRATION_PROVIDER_REGISTRY) {
  for (const snapshotKey of entry.snapshotKeys) {
    for (const variant of providerRegistryKeyVariants(snapshotKey)) {
      SNAPSHOT_KEY_LOOKUP.set(normalizeProviderRegistryKey(variant), entry.provider);
    }
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
  return SLUG_ALIAS_LOOKUP.get(normalizeProviderRegistryKey(slugOrAlias)) ?? null;
}

export function providerForSnapshotKey(snapshotKey: string): IntegrationProvider | null {
  return SNAPSHOT_KEY_LOOKUP.get(normalizeProviderRegistryKey(snapshotKey)) ?? null;
}

export function snapshotKeyQueryVariants(snapshotKeys: string[]): string[] {
  return [...new Set(snapshotKeys.flatMap(providerRegistryKeyVariants))];
}
