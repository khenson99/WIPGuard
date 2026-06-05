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

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value: Date | string): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function isStale(value: Date | string, now: Date): boolean {
  const date = toDate(value);
  return !date || date.getTime() < now.getTime();
}

function capturedAtIsUsable(sample: ProviderSnapshotSample, now: Date): boolean {
  const capturedAt = toDate(sample.capturedAt);
  return !!capturedAt && capturedAt.getTime() <= now.getTime();
}

function latestSnapshot(samples: ProviderSnapshotSample[], now: Date): ProviderSnapshotSample | null {
  const validSamples = samples.filter((sample) => capturedAtIsUsable(sample, now));
  if (validSamples.length === 0) return null;

  return [...validSamples].sort((a, b) => {
    const capturedB = toDate(b.capturedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const capturedA = toDate(a.capturedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
    return capturedB - capturedA;
  })[0] ?? null;
}

function latestSuccessfulSnapshot(samples: ProviderSnapshotSample[], now: Date): ProviderSnapshotSample | null {
  const success = samples.filter(
    (sample) => sample.status === "SUCCESS" && capturedAtIsUsable(sample, now)
  );
  if (success.length === 0) return null;

  return success.sort((a, b) => {
    const capturedB = toDate(b.capturedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const capturedA = toDate(a.capturedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
    return capturedB - capturedA;
  })[0] ?? null;
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

  const latest = latestSnapshot(input.snapshots, now);
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
    const fallback = latestSuccessfulSnapshot(input.snapshots, now);
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

  if (!toDate(latest.expiresAt)) {
    return {
      syncHealth: "degraded",
      syncHealthReason: "Latest snapshot expiry is invalid.",
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
