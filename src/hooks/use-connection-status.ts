"use client";

import { create } from "zustand";
import type { AnalyticsDashboardData, IntegrationProviderKey, ProviderFreshness } from "@/lib/analytics/types";

export type ConnectionStatus = "connected" | "stale" | "disconnected";

interface ConnectionEntry {
  dataDomain: string;
  status: ConnectionStatus;
  provider?: string;
  lastSync?: string;
}

interface ConnectionStatusStore {
  entries: ConnectionEntry[];
  setEntries: (entries: ConnectionEntry[]) => void;
  getStatus: (dataDomain: string) => ConnectionStatus;
}

export const useConnectionStatus = create<ConnectionStatusStore>((set, get) => ({
  entries: [],
  setEntries: (entries) => set({ entries }),
  getStatus: (dataDomain) => {
    const entry = get().entries.find((e) => e.dataDomain === dataDomain);
    return entry?.status ?? "disconnected";
  },
}));

export function mapFreshnessToStatus(freshness: {
  status: string | null;
  stale: boolean;
}): ConnectionStatus {
  if (!freshness.status || freshness.status === "DISCONNECTED" || freshness.status === "ERROR") {
    return "disconnected";
  }
  if (freshness.stale) {
    return "stale";
  }
  return "connected";
}

/**
 * Maps IntegrationProviderKey (snake_case) → dataDomain (camelCase) used in the
 * section registry and sidebar. A single provider can map to multiple dataDomains
 * (e.g. google_workspace → googleWorkspace).
 */
const PROVIDER_TO_DOMAINS: Partial<Record<IntegrationProviderKey, string[]>> = {
  google_workspace: ["googleWorkspace"],
  hubspot: ["hubspot"],
  slack: ["slack"],
  coda: ["coda"],
  reddit: ["redditAds"],
  redditAds: ["redditAds"],
  stripe: ["stripe", "financePlanning", "financeForecast", "financePnl", "financeUnitEconomics"],
  mercury: ["mercury", "financePlanning", "financeForecast", "financePnl"],
  googleAnalytics: ["googleAnalytics"],
  googleAds: ["googleAds"],
  metaAds: ["metaAds"],
  metaPage: ["metaPage"],
  webflow: ["webflow"],
  semrush: ["semrush"],
  pylon: ["pylon"],
};

const DASHBOARD_DATA_DOMAINS = [
  "hubspot",
  "stripe",
  "mercury",
  "googleAnalytics",
  "googleAds",
  "metaAds",
  "metaPage",
  "redditAds",
  "webflow",
  "coda",
  "semrush",
  "pylon",
  "product",
  "googleWorkspace",
  "slack",
  "hubspotOps",
  "codaOps",
  "redditOps",
] as const;

function statusFromDomainPayload(
  dashboard: AnalyticsDashboardData,
  domain: (typeof DASHBOARD_DATA_DOMAINS)[number],
): ConnectionStatus {
  const payload = dashboard[domain];
  if (payload === null || payload === undefined) {
    return "disconnected";
  }
  const staleDomains = Array.isArray(dashboard.staleDomains) ? dashboard.staleDomains : [];
  if (staleDomains.includes(domain)) {
    return "stale";
  }
  return "connected";
}

/**
 * Convert a freshness map from the API into ConnectionEntry[] and populate
 * the store.  Safe to call multiple times — last call wins.
 */
export function populateConnectionStatus(
  freshness: Partial<Record<IntegrationProviderKey, ProviderFreshness>> | undefined,
  dashboard?: AnalyticsDashboardData | null,
): void {
  const entriesByDomain = new Map<string, ConnectionEntry>();

  if (freshness) {
    for (const [providerKey, info] of Object.entries(freshness)) {
      if (!info) continue;
      const domains = PROVIDER_TO_DOMAINS[providerKey as IntegrationProviderKey] ?? [];
      const status = mapFreshnessToStatus(info);

      for (const domain of domains) {
        entriesByDomain.set(domain, {
          dataDomain: domain,
          status,
          provider: info.provider,
          lastSync: info.lastSyncedAt ?? undefined,
        });
      }
    }
  }

  if (dashboard) {
    for (const domain of DASHBOARD_DATA_DOMAINS) {
      const inferredStatus = statusFromDomainPayload(dashboard, domain);
      const existing = entriesByDomain.get(domain);
      if (!existing) {
        entriesByDomain.set(domain, {
          dataDomain: domain,
          status: inferredStatus,
        });
      }
    }
  }

  useConnectionStatus.getState().setEntries(Array.from(entriesByDomain.values()));
}
