import { Prisma, AnalyticsSnapshotStatus } from "@/generated/prisma/client";
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
  stale: boolean;
  fromSnapshot: boolean;
  status: "SUCCESS" | "ERROR" | null;
  error: string | null;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function contextKeyOrDefault(value?: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "default";
}

export async function storeAnalyticsSnapshot(input: SnapshotUpsertInput): Promise<void> {
  await prisma.analyticsSnapshot.create({
    data: {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey: contextKeyOrDefault(input.contextKey),
      rangePreset: input.rangePreset,
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
  await prisma.analyticsSnapshot.create({
    data: {
      userId: input.userId,
      providerKey: input.providerKey,
      contextKey: contextKeyOrDefault(input.contextKey),
      rangePreset: input.rangePreset,
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
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    };
  }

  const isSuccess = snapshot.status === AnalyticsSnapshotStatus.SUCCESS;
  const payload = (isSuccess ? (snapshot.payload as T | null) : null) ?? null;

  return {
    payload,
    capturedAt: snapshot.capturedAt.toISOString(),
    expiresAt: snapshot.expiresAt.toISOString(),
    stale: snapshot.expiresAt.getTime() < Date.now(),
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
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    };
  }

  return {
    payload: (snapshot.payload as T | null) ?? null,
    capturedAt: snapshot.capturedAt.toISOString(),
    expiresAt: snapshot.expiresAt.toISOString(),
    stale: snapshot.expiresAt.getTime() < Date.now(),
    fromSnapshot: true,
    status: snapshot.status,
    error: snapshot.lastError,
  };
}

export function snapshotExpiryFromNow(hours = 1): Date {
  return new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
}
