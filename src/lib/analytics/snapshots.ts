import { Prisma, AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import {
  MONTHLY_HISTORY_CONTEXT_KEY,
  MONTHLY_HISTORY_RANGE_PRESET,
} from "@/lib/analytics/monthly-pnl-history";
import { prisma } from "@/lib/prisma";

export interface SnapshotQueryInput {
  userId: string;
  providerKey: string;
  contextKey?: string;
  rangePreset: string;
  fromDate: Date;
  toDate: Date;
}

export interface SnapshotUpsertInput extends SnapshotQueryInput {
  payload: unknown;
  expiresAt: Date;
}

export interface SnapshotFailureInput extends SnapshotQueryInput {
  error: string;
  expiresAt: Date;
}

export interface SnapshotResult<T = unknown> {
  payload: T | null;
  capturedAt: string | null;
  expiresAt: string | null;
  /** Soft expiry: snapshot data should be refreshed in the background. */
  needsRefresh: boolean;
  /** Hard expiry: snapshot data is stale enough to surface to the user. */
  stale: boolean;
  fromSnapshot: boolean;
  status: "SUCCESS" | "ERROR" | null;
  error: string | null;
}

/**
 * Grace period after soft expiry before data is considered hard-stale.
 * Soft expiry (expiresAt) triggers a background refresh; the banner only
 * appears once expiresAt + HARD_STALE_GRACE_MS has elapsed, giving the
 * background refresh time to succeed invisibly.
 */
export const HARD_STALE_GRACE_MS = 3 * 60 * 60 * 1000; // 3 hours

function contextKeyOrDefault(value?: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "default";
}

export async function storeAnalyticsSnapshot(input: SnapshotUpsertInput): Promise<void> {
  const contextKey = contextKeyOrDefault(input.contextKey);
  await prisma.analyticsSnapshot.upsert({
    where: {
      userId_providerKey_contextKey_rangePreset_toDate_status: {
        userId: input.userId,
        providerKey: input.providerKey,
        contextKey,
        rangePreset: input.rangePreset,
        toDate: input.toDate,
        status: AnalyticsSnapshotStatus.SUCCESS,
      },
    },
    create: {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey,
      rangePreset: input.rangePreset,
      fromDate: input.fromDate,
      toDate: input.toDate,
      payload: input.payload as Prisma.InputJsonValue,
      status: AnalyticsSnapshotStatus.SUCCESS,
      lastError: null,
      capturedAt: new Date(),
      expiresAt: input.expiresAt,
    },
    update: {
      fromDate: input.fromDate,
      toDate: input.toDate,
      payload: input.payload as Prisma.InputJsonValue,
      status: AnalyticsSnapshotStatus.SUCCESS,
      lastError: null,
      capturedAt: new Date(),
      expiresAt: input.expiresAt,
    },
  });
}

export async function storeAnalyticsSnapshotFailure(input: SnapshotFailureInput): Promise<void> {
  const contextKey = contextKeyOrDefault(input.contextKey);
  await prisma.analyticsSnapshot.upsert({
    where: {
      userId_providerKey_contextKey_rangePreset_toDate_status: {
        userId: input.userId,
        providerKey: input.providerKey,
        contextKey,
        rangePreset: input.rangePreset,
        toDate: input.toDate,
        status: AnalyticsSnapshotStatus.ERROR,
      },
    },
    create: {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey,
      rangePreset: input.rangePreset,
      fromDate: input.fromDate,
      toDate: input.toDate,
      payload: Prisma.JsonNull,
      status: AnalyticsSnapshotStatus.ERROR,
      lastError: input.error,
      capturedAt: new Date(),
      expiresAt: input.expiresAt,
    },
    update: {
      fromDate: input.fromDate,
      toDate: input.toDate,
      payload: Prisma.JsonNull,
      status: AnalyticsSnapshotStatus.ERROR,
      lastError: input.error,
      capturedAt: new Date(),
      expiresAt: input.expiresAt,
    },
  });
}

export async function readLatestSnapshot<T = unknown>(input: SnapshotQueryInput): Promise<SnapshotResult<T>> {
  const snapshot = await prisma.analyticsSnapshot.findFirst({
    where: {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey: contextKeyOrDefault(input.contextKey),
      rangePreset: input.rangePreset,
      toDate: input.toDate,
    },
    orderBy: [{ capturedAt: "desc" }],
  });

  if (!snapshot) {
    return {
      payload: null,
      capturedAt: null,
      expiresAt: null,
      needsRefresh: false,
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    };
  }

  const isSuccess = snapshot.status === AnalyticsSnapshotStatus.SUCCESS;
  const payload = (isSuccess ? (snapshot.payload as T | null) : null) ?? null;
  const expiresAtMs = snapshot.expiresAt.getTime();
  const now = Date.now();

  return {
    payload,
    capturedAt: snapshot.capturedAt.toISOString(),
    expiresAt: snapshot.expiresAt.toISOString(),
    needsRefresh: expiresAtMs < now,
    stale: expiresAtMs + HARD_STALE_GRACE_MS < now,
    fromSnapshot: true,
    status: snapshot.status,
    error: snapshot.lastError,
  };
}

export async function readLatestSuccessfulSnapshot<T = unknown>(
  input: SnapshotQueryInput
): Promise<SnapshotResult<T>> {
  const snapshot = await prisma.analyticsSnapshot.findFirst({
    where: {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey: contextKeyOrDefault(input.contextKey),
      rangePreset: input.rangePreset,
      toDate: input.toDate,
      status: AnalyticsSnapshotStatus.SUCCESS,
    },
    orderBy: [{ capturedAt: "desc" }],
  });

  if (!snapshot) {
    return {
      payload: null,
      capturedAt: null,
      expiresAt: null,
      needsRefresh: false,
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    };
  }

  const expiresAtMs = snapshot.expiresAt.getTime();
  const now = Date.now();

  return {
    payload: (snapshot.payload as T | null) ?? null,
    capturedAt: snapshot.capturedAt.toISOString(),
    expiresAt: snapshot.expiresAt.toISOString(),
    needsRefresh: expiresAtMs < now,
    stale: expiresAtMs + HARD_STALE_GRACE_MS < now,
    fromSnapshot: true,
    status: snapshot.status,
    error: snapshot.lastError,
  };
}

export function snapshotExpiryFromNow(hours = 1): Date {
  return new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
}

export async function pruneAnalyticsSnapshots(input: { olderThanDays: number }): Promise<{
  deleted: number;
  cutoff: string;
}> {
  const olderThanDays = Math.max(1, Math.floor(input.olderThanDays));
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.analyticsSnapshot.deleteMany({
    where: {
      capturedAt: { lt: cutoffDate },
      NOT: {
        contextKey: MONTHLY_HISTORY_CONTEXT_KEY,
        rangePreset: MONTHLY_HISTORY_RANGE_PRESET,
      },
    },
  });
  return { deleted: result.count, cutoff: cutoffDate.toISOString() };
}
