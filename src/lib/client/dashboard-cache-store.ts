import { create } from "zustand";

export interface DashboardCacheEnvelope<T> {
  data: T;
  lastUpdatedAt: string | null;
  storedAt: number;
}

interface DashboardCacheState {
  entries: Record<string, DashboardCacheEnvelope<unknown>>;
  read: <T>(key: string) => DashboardCacheEnvelope<T> | null;
  write: <T>(key: string, value: { data: T; lastUpdatedAt: string | null }) => void;
  clear: () => void;
}

export const useDashboardCacheStore = create<DashboardCacheState>((set, get) => ({
  entries: {},
  read: (key) => {
    const entry = get().entries[key];
    return (entry ?? null) as DashboardCacheEnvelope<unknown> | null;
  },
  write: (key, value) => {
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: {
          data: value.data as unknown,
          lastUpdatedAt: value.lastUpdatedAt,
          storedAt: Date.now(),
        },
      },
    }));
  },
  clear: () => set({ entries: {} }),
}));

export function clearDashboardCache(): void {
  useDashboardCacheStore.getState().clear();
}

