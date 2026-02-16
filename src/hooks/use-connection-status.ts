"use client";

import { create } from "zustand";
import type { IntegrationProviderKey, ProviderFreshness } from "@/lib/analytics/types";

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
 * (e.g. google_workspace → googleWorkspace, but Google Analytics / Ads use env keys
 * not provider connections, so they are omitted).
 */
const PROVIDER_TO_DOMAINS: Record<IntegrationProviderKey, string[]> = {
  google_workspace: ["googleWorkspace"],
  hubspot: ["hubspot"],
  slack: ["slack"],
  coda: ["coda"],
  reddit: ["redditAds"],
  stripe: ["stripe"],
  mercury: ["mercury"],
};

/**
 * Convert a freshness map from the API into ConnectionEntry[] and populate
 * the store.  Safe to call multiple times — last call wins.
 */
export function populateConnectionStatus(
  freshness: Partial<Record<IntegrationProviderKey, ProviderFreshness>> | undefined
): void {
  if (!freshness) return;

  const entries: ConnectionEntry[] = [];

  for (const [providerKey, info] of Object.entries(freshness)) {
    if (!info) continue;
    const domains = PROVIDER_TO_DOMAINS[providerKey as IntegrationProviderKey] ?? [];
    const status = mapFreshnessToStatus(info);

    for (const domain of domains) {
      entries.push({
        dataDomain: domain,
        status,
        provider: info.provider,
        lastSync: info.lastSyncedAt ?? undefined,
      });
    }
  }

  useConnectionStatus.getState().setEntries(entries);
}
