import { IntegrationProvider } from "@/generated/prisma/client";
import type { AnalyticsSnapshotStatus } from "@/lib/analytics/types";
import {
  getProviderRegistryEntry,
  providerForSnapshotKey as providerForSnapshotKeyFromRegistry,
  snapshotKeyQueryVariants,
} from "@/lib/integrations/provider-registry";

export type ProviderSyncHealth = "healthy" | "degraded" | "error" | "missing";

export interface ProviderSnapshotSample {
  providerKey: string;
  status: AnalyticsSnapshotStatus;
  capturedAt: Date | string;
  expiresAt: Date | string;
  lastError: string | null;
}

export interface ProviderSyncHealthResult {
  syncHealth: ProviderSyncHealth;
  syncHealthReason: string | null;
  lastSnapshotAt: string | null;
  lastSnapshotStatus: AnalyticsSnapshotStatus | null;
}

export function snapshotKeysForIntegrationProvider(provider: IntegrationProvider): string[] {
  return snapshotKeyQueryVariants(getProviderRegistryEntry(provider)?.snapshotKeys ?? []);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string): string {
  return toDate(value).toISOString();
}

function isStale(value: Date | string, now: Date): boolean {
  return toDate(value).getTime() < now.getTime();
}

function latestSnapshot(samples: ProviderSnapshotSample[]): ProviderSnapshotSample | null {
  if (samples.length === 0) return null;

  return [...samples].sort((a, b) => toDate(b.capturedAt).getTime() - toDate(a.capturedAt).getTime())[0] ?? null;
}

function latestSuccessfulSnapshot(samples: ProviderSnapshotSample[]): ProviderSnapshotSample | null {
  const success = samples.filter((sample) => sample.status === "SUCCESS");
  if (success.length === 0) return null;

  return success.sort((a, b) => toDate(b.capturedAt).getTime() - toDate(a.capturedAt).getTime())[0] ?? null;
}

export function evaluateProviderSyncHealth(input: {
  connected: boolean;
  hasCredential: boolean;
  snapshots: ProviderSnapshotSample[];
  now?: Date;
}): ProviderSyncHealthResult {
  const now = input.now ?? new Date();

  if (!input.connected && !input.hasCredential) {
    return {
      syncHealth: "missing",
      syncHealthReason: "No integration credentials found.",
      lastSnapshotAt: null,
      lastSnapshotStatus: null,
    };
  }

  const latest = latestSnapshot(input.snapshots);
  if (!latest) {
    return {
      syncHealth: "degraded",
      syncHealthReason: "No analytics snapshots available yet.",
      lastSnapshotAt: null,
      lastSnapshotStatus: null,
    };
  }

  const latestAt = toIso(latest.capturedAt);

  if (latest.status === "ERROR") {
    const fallback = latestSuccessfulSnapshot(input.snapshots);
    if (fallback && !isStale(fallback.expiresAt, now)) {
      return {
        syncHealth: "degraded",
        syncHealthReason: latest.lastError || "Latest sync failed; showing previous snapshot.",
        lastSnapshotAt: latestAt,
        lastSnapshotStatus: latest.status,
      };
    }

    return {
      syncHealth: "error",
      syncHealthReason: latest.lastError || "Latest sync failed and no fresh fallback snapshot is available.",
      lastSnapshotAt: latestAt,
      lastSnapshotStatus: latest.status,
    };
  }

  if (isStale(latest.expiresAt, now)) {
    return {
      syncHealth: "degraded",
      syncHealthReason: "Latest snapshot is stale.",
      lastSnapshotAt: latestAt,
      lastSnapshotStatus: latest.status,
    };
  }

  return {
    syncHealth: "healthy",
    syncHealthReason: null,
    lastSnapshotAt: latestAt,
    lastSnapshotStatus: latest.status,
  };
}

export function snapshotsForProvider(
  provider: IntegrationProvider,
  snapshots: ProviderSnapshotSample[]
): ProviderSnapshotSample[] {
  return snapshots.filter((snapshot) => providerForSnapshotKeyFromRegistry(snapshot.providerKey) === provider);
}

export function providerForSnapshotKey(providerKey: string): IntegrationProvider | null {
  return providerForSnapshotKeyFromRegistry(providerKey);
}
