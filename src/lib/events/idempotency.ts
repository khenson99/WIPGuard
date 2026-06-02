/**
 * Idempotency — Key generation, deduplication, and replay
 *
 * Generates deterministic SHA-256 idempotency keys from event payloads
 * so that duplicate events are safely rejected at the database level.
 *
 * @module events/idempotency
 */

import { createHash } from "crypto";
import type { OutboxEvent, OutboxEventStatus } from "./outbox-types";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

export interface IdempotencyKeyInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Build a canonical JSON string from the key input. Object keys are
 * sorted to ensure deterministic output regardless of insertion order.
 */
export function canonicalize(input: IdempotencyKeyInput): string {
  const canonical = {
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    eventType: input.eventType,
    payload: sortKeys(input.payload),
  };
  return JSON.stringify(canonical);
}

/**
 * Recursively sort object keys for deterministic serialization.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj !== "object") return obj;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Generate a SHA-256 idempotency key from event metadata and payload.
 *
 * The key is a hex-encoded hash of the canonicalized input, prefixed
 * with the aggregate type and event type for human readability when
 * scanning the database:
 *
 *   `metric:metric.refreshed:sha256:<hex>`
 */
export function generateIdempotencyKey(input: IdempotencyKeyInput): string {
  const canonical = canonicalize(input);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `${input.aggregateType}:${input.eventType}:sha256:${hash}`;
}

/**
 * Validate that a given string looks like a well-formed idempotency key.
 * Does not verify the hash — only checks structural format.
 */
export function isValidIdempotencyKey(key: string): boolean {
  const parts = key.split(":");
  if (parts.length < 4) return false;

  const hashPrefix = parts[parts.length - 2];
  const hashValue = parts[parts.length - 1];

  if (hashPrefix !== "sha256") return false;
  if (!/^[a-f0-9]{64}$/.test(hashValue)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Deduplication check
// ---------------------------------------------------------------------------

export interface DeduplicationClient {
  outboxEvent: {
    findUnique: (args: {
      where: { idempotencyKey: string };
    }) => Promise<OutboxEvent | null>;
  };
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingEvent: OutboxEvent | null;
}

/**
 * Check whether an event with the given idempotency key already exists.
 */
export async function checkDuplicate(
  db: DeduplicationClient,
  idempotencyKey: string
): Promise<DeduplicationResult> {
  const existing = await db.outboxEvent.findUnique({
    where: { idempotencyKey },
  });

  return {
    isDuplicate: existing !== null,
    existingEvent: existing,
  };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface ReplayClient {
  outboxEvent: {
    findMany: (args: {
      where: { id?: { in: string[] }; status?: { in: OutboxEventStatus[] } };
      orderBy?: Array<Record<string, "asc" | "desc">>;
      take?: number;
      select?: Record<string, boolean>;
    }) => Promise<Array<{ id: string }>>;
    updateMany: (args: {
      where: { id: { in: string[] }; status: { in: OutboxEventStatus[] } };
      data: {
        status: "PENDING";
        retryCount: 0;
        nextAttemptAt: Date;
        failedAt: null;
        error: null;
        lastAttemptAt: null;
      };
    }) => Promise<{ count: number }>;
  };
}

export interface ReplayOptions {
  /** Specific event IDs to replay. When empty, replays by status scan. */
  eventIds?: string[];
  /** Statuses eligible for replay. Defaults to FAILED + DEAD_LETTER. */
  statuses?: Array<"FAILED" | "DEAD_LETTER">;
  /** Max events to replay in one call. Defaults to 100. */
  limit?: number;
  /** Current timestamp for nextAttemptAt reset. */
  now?: Date;
}

export interface ReplayResult {
  replayed: number;
  eventIds: string[];
}

/**
 * Replay failed or dead-letter events by resetting their status to PENDING.
 * This allows the outbox worker to re-process them on the next poll cycle.
 *
 * When specific eventIds are provided, only those are replayed.
 * Otherwise, the most recently failed events (up to `limit`) are replayed.
 */
export async function replayEvents(
  db: ReplayClient,
  options?: ReplayOptions
): Promise<ReplayResult> {
  const statuses: OutboxEventStatus[] =
    options?.statuses?.length ? options.statuses : ["FAILED", "DEAD_LETTER"];
  const now = options?.now ?? new Date();

  let eventIds = options?.eventIds?.filter(Boolean) ?? [];

  if (!eventIds.length) {
    const limit = options?.limit ?? 100;
    const candidates = await db.outboxEvent.findMany({
      where: { status: { in: statuses } },
      orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { id: true },
    });
    eventIds = candidates.map((e) => e.id);
  }

  if (!eventIds.length) {
    return { replayed: 0, eventIds: [] };
  }

  const result = await db.outboxEvent.updateMany({
    where: {
      id: { in: eventIds },
      status: { in: statuses },
    },
    data: {
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: now,
      failedAt: null,
      error: null,
      lastAttemptAt: null,
    },
  });

  return { replayed: result.count, eventIds };
}
