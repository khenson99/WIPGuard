"use client";

import { create } from "zustand";

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
