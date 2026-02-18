/**
 * HubSpot Bi-directional Sync MVP — Issue #9 (WGX-009)
 *
 * Adds real-time webhook ingestion, inbound reconciliation, drift detection,
 * conflict resolution tracing, and sync audit logging on top of the existing
 * polling-based bidirectional sync engine.
 *
 * Architecture:
 *   HubSpot webhook -> verify signature -> parse payload -> reconcile
 *   Local task change -> outbox event -> outbound sync to HubSpot
 *   Periodic drift scan -> compare local state vs HubSpot state -> report
 *
 * HubSpot is treated as the external system-of-record for deal state.
 * All reconciliation decisions are traced for audit.
 *
 * @module integrations/hubspot-sync
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { TaskStatus } from "@/generated/prisma/client";
import {
  type HubSpotBidirectionalSyncConfig,
  type HubSpotSyncConflict,
  type HubSpotSyncDrift,
  defaultHubSpotBidirectionalConfig,
  __private__ as bidirectionalPrivate,
} from "./hubspot-bidirectional-sync";

export type { HubSpotBidirectionalSyncConfig };

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface WebhookVerificationInput {
  signatureHeader: string | null;
  timestampHeader: string | null;
  method: string;
  url: string;
  body: string;
  clientSecret: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason: string;
}

/**
 * Verify a HubSpot webhook signature using v3 HMAC-SHA256 verification.
 *
 * HubSpot v3 signature = HMAC-SHA256(clientSecret, method + url + body + timestamp)
 *
 * @see https://developers.hubspot.com/docs/api/webhooks#security
 */
export function verifyWebhookSignature(
  input: WebhookVerificationInput
): WebhookVerificationResult {
  if (!input.signatureHeader) {
    return { valid: false, reason: "Missing signature header" };
  }

  if (!input.timestampHeader) {
    return { valid: false, reason: "Missing timestamp header" };
  }

  if (!input.clientSecret || input.clientSecret.trim().length === 0) {
    return { valid: false, reason: "Client secret not configured" };
  }

  const timestamp = parseInt(input.timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, reason: "Invalid timestamp format" };
  }

  const now = Date.now();
  if (Math.abs(now - timestamp) > MAX_TIMESTAMP_AGE_MS) {
    return { valid: false, reason: "Timestamp expired (replay protection)" };
  }

  const sourceString = `${input.method}${input.url}${input.body}${input.timestampHeader}`;
  const expectedSignature = createHmac("sha256", input.clientSecret)
    .update(sourceString, "utf8")
    .digest("base64");

  try {
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(input.signatureHeader, "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }

    const isValid = timingSafeEqual(expectedBuffer, actualBuffer);
    return isValid
      ? { valid: true, reason: "Signature verified" }
      : { valid: false, reason: "Signature mismatch" };
  } catch {
    return { valid: false, reason: "Signature comparison error" };
  }
}

// ---------------------------------------------------------------------------
// Webhook payload parsing
// ---------------------------------------------------------------------------

/**
 * A single HubSpot webhook event from the subscription payload.
 * HubSpot batches events in an array.
 */
export interface HubSpotWebhookEvent {
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
  eventId?: number;
  sourceId?: string;
}

export interface ParsedDealStageChange {
  dealId: string;
  newStage: string;
  occurredAt: Date;
  changeSource: string;
  eventId: string;
  portalId: number;
  raw: HubSpotWebhookEvent;
}

/**
 * Parse HubSpot webhook events and extract deal stage changes.
 *
 * HubSpot sends an array of events. We filter for deal property changes
 * where propertyName === "dealstage".
 */
export function parseDealStageChanges(
  events: unknown
): ParsedDealStageChange[] {
  if (!Array.isArray(events)) {
    return [];
  }

  const changes: ParsedDealStageChange[] = [];

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const e = event as Record<string, unknown>;

    const subscriptionType =
      typeof e.subscriptionType === "string" ? e.subscriptionType : "";
    if (subscriptionType !== "deal.propertyChange") continue;

    const propertyName =
      typeof e.propertyName === "string" ? e.propertyName : "";
    if (propertyName !== "dealstage") continue;

    const objectId =
      typeof e.objectId === "number" ? e.objectId : parseInt(String(e.objectId), 10);
    if (isNaN(objectId)) continue;

    const propertyValue =
      typeof e.propertyValue === "string" ? e.propertyValue.trim() : "";
    if (!propertyValue) continue;

    const occurredAt =
      typeof e.occurredAt === "number"
        ? new Date(e.occurredAt)
        : new Date();

    const changeSource =
      typeof e.changeSource === "string" ? e.changeSource : "UNKNOWN";

    const eventId =
      typeof e.eventId === "number"
        ? String(e.eventId)
        : typeof e.eventId === "string"
          ? e.eventId
          : `webhook-${objectId}-${occurredAt.getTime()}`;

    const portalId =
      typeof e.portalId === "number" ? e.portalId : 0;

    changes.push({
      dealId: String(objectId),
      newStage: propertyValue,
      occurredAt,
      changeSource,
      eventId,
      portalId,
      raw: e as unknown as HubSpotWebhookEvent,
    });
  }

  // Sort by occurredAt ascending so we process in chronological order
  changes.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return changes;
}

// ---------------------------------------------------------------------------
// Inbound reconciliation
// ---------------------------------------------------------------------------

export interface ReconciliationInput {
  dealId: string;
  newDealStage: string;
  dealUpdatedAt: Date;
  task: {
    id: string;
    status: TaskStatus;
    updatedAt: Date;
  } | null;
  config: HubSpotBidirectionalSyncConfig;
}

export type ReconciliationAction =
  | { type: "update_task"; taskId: string; fromStatus: TaskStatus; toStatus: TaskStatus; reason: string }
  | { type: "skip_no_task"; dealId: string; reason: string }
  | { type: "skip_unmapped_stage"; dealId: string; stage: string; reason: string }
  | { type: "skip_already_synced"; dealId: string; taskId: string; reason: string }
  | { type: "skip_task_wins"; dealId: string; taskId: string; reason: string }
  | { type: "conflict_detected"; conflict: HubSpotSyncConflict };

/**
 * Determine the reconciliation action for an inbound deal stage change.
 *
 * This is a pure function that computes the required action without side effects,
 * enabling thorough testing.
 */
export function computeReconciliation(input: ReconciliationInput): ReconciliationAction {
  const { dealId, newDealStage, dealUpdatedAt, task, config } = input;

  // No linked task
  if (!task) {
    return {
      type: "skip_no_task",
      dealId,
      reason: `No local task linked to HubSpot deal ${dealId}`,
    };
  }

  // Unmapped stage
  const mappedTaskStatus = config.dealStageToTaskStatus[newDealStage] ?? null;
  if (!mappedTaskStatus) {
    return {
      type: "skip_unmapped_stage",
      dealId,
      stage: newDealStage,
      reason: `No local status mapping for HubSpot stage "${newDealStage}"`,
    };
  }

  // Already in sync
  if (task.status === mappedTaskStatus) {
    return {
      type: "skip_already_synced",
      dealId,
      taskId: task.id,
      reason: `Task already has status ${mappedTaskStatus}`,
    };
  }

  // Determine conflict winner
  const winner = bidirectionalPrivate.chooseConflictWinner({
    resolution: config.conflictResolution,
    dealUpdatedAt,
    taskUpdatedAt: task.updatedAt,
  });

  if (winner.winner === "task") {
    return {
      type: "skip_task_wins",
      dealId,
      taskId: task.id,
      reason: `Task wins conflict: ${winner.reason}`,
    };
  }

  return {
    type: "update_task",
    taskId: task.id,
    fromStatus: task.status,
    toStatus: mappedTaskStatus,
    reason: `Deal wins conflict: ${winner.reason}`,
  };
}

// ---------------------------------------------------------------------------
// Sync Audit Log
// ---------------------------------------------------------------------------

export type SyncDirection = "inbound" | "outbound";
export type SyncOutcome =
  | "applied"
  | "skipped_deduped"
  | "skipped_no_task"
  | "skipped_unmapped"
  | "skipped_already_synced"
  | "skipped_conflict_task_wins"
  | "conflict_deal_wins"
  | "error";

export interface SyncAuditEntry {
  timestamp: string;
  direction: SyncDirection;
  dealId: string;
  taskId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  fromStage: string | null;
  toStage: string | null;
  outcome: SyncOutcome;
  conflictResolution: string | null;
  conflictWinner: string | null;
  reason: string;
  eventId: string | null;
  dedupeKey: string | null;
}

/**
 * Build an audit entry from a reconciliation action.
 */
export function buildAuditEntry(input: {
  action: ReconciliationAction;
  direction: SyncDirection;
  dealId: string;
  dealStage: string;
  eventId: string | null;
  dedupeKey: string | null;
  config: HubSpotBidirectionalSyncConfig;
}): SyncAuditEntry {
  const base: Pick<SyncAuditEntry, "timestamp" | "direction" | "dealId" | "eventId" | "dedupeKey"> = {
    timestamp: new Date().toISOString(),
    direction: input.direction,
    dealId: input.dealId,
    eventId: input.eventId,
    dedupeKey: input.dedupeKey,
  };

  switch (input.action.type) {
    case "update_task":
      return {
        ...base,
        taskId: input.action.taskId,
        fromStatus: input.action.fromStatus,
        toStatus: input.action.toStatus,
        fromStage: input.dealStage,
        toStage: null,
        outcome: "conflict_deal_wins",
        conflictResolution: input.config.conflictResolution,
        conflictWinner: "deal",
        reason: input.action.reason,
      };

    case "skip_no_task":
      return {
        ...base,
        taskId: null,
        fromStatus: null,
        toStatus: null,
        fromStage: input.dealStage,
        toStage: null,
        outcome: "skipped_no_task",
        conflictResolution: null,
        conflictWinner: null,
        reason: input.action.reason,
      };

    case "skip_unmapped_stage":
      return {
        ...base,
        taskId: null,
        fromStatus: null,
        toStatus: null,
        fromStage: input.action.stage,
        toStage: null,
        outcome: "skipped_unmapped",
        conflictResolution: null,
        conflictWinner: null,
        reason: input.action.reason,
      };

    case "skip_already_synced":
      return {
        ...base,
        taskId: input.action.taskId,
        fromStatus: null,
        toStatus: null,
        fromStage: input.dealStage,
        toStage: null,
        outcome: "skipped_already_synced",
        conflictResolution: null,
        conflictWinner: null,
        reason: input.action.reason,
      };

    case "skip_task_wins":
      return {
        ...base,
        taskId: input.action.taskId,
        fromStatus: null,
        toStatus: null,
        fromStage: input.dealStage,
        toStage: null,
        outcome: "skipped_conflict_task_wins",
        conflictResolution: input.config.conflictResolution,
        conflictWinner: "task",
        reason: input.action.reason,
      };

    case "conflict_detected":
      return {
        ...base,
        taskId: input.action.conflict.taskId,
        fromStatus: input.action.conflict.taskStatus,
        toStatus: input.action.conflict.mappedTaskStatus,
        fromStage: input.action.conflict.dealStage,
        toStage: input.action.conflict.mappedDealStage,
        outcome: input.action.conflict.winner === "deal" ? "conflict_deal_wins" : "skipped_conflict_task_wins",
        conflictResolution: input.action.conflict.resolution,
        conflictWinner: input.action.conflict.winner,
        reason: input.action.conflict.reason,
      };
  }
}

// ---------------------------------------------------------------------------
// Drift Detection
// ---------------------------------------------------------------------------

export interface DriftDetectionInput {
  /** Current HubSpot deals with their stages */
  deals: Array<{
    dealId: string;
    stage: string;
    lastModified: Date | null;
    pipeline: string | null;
  }>;
  /** Current linked tasks */
  linkedTasks: Map<
    string,
    Array<{
      id: string;
      status: TaskStatus;
      updatedAt: Date;
    }>
  >;
  config: HubSpotBidirectionalSyncConfig;
}

export interface DriftReport {
  scannedDeals: number;
  scannedTasks: number;
  drifts: HubSpotSyncDrift[];
  summary: {
    missingLocalTasks: number;
    missingHubSpotDeals: number;
    unmappedDealStages: number;
    unmappedTaskStatuses: number;
    statusMismatches: number;
  };
  generatedAt: string;
}

/**
 * Detect drift between HubSpot deals and local tasks.
 *
 * This is a pure function operating on pre-fetched data. It identifies:
 * - Deals without local tasks
 * - Local tasks without HubSpot deals
 * - Unmapped deal stages
 * - Unmapped task statuses
 * - Status/stage mismatches (both sides have a value but they disagree)
 */
export function detectDrift(input: DriftDetectionInput): DriftReport {
  const { deals, linkedTasks, config } = input;
  const drifts: HubSpotSyncDrift[] = [];
  const touchedDealIds = new Set<string>();

  let scannedTasks = 0;
  for (const tasks of linkedTasks.values()) {
    scannedTasks += tasks.length;
  }

  let statusMismatches = 0;

  for (const deal of deals) {
    touchedDealIds.add(deal.dealId);

    if (!deal.stage) {
      drifts.push({
        dealId: deal.dealId,
        taskId: null,
        kind: "unmapped_deal_stage",
        detail: "HubSpot deal is missing dealstage",
      });
      continue;
    }

    const tasks = linkedTasks.get(deal.dealId) ?? [];
    const task = tasks[0] ?? null;

    if (!task) {
      drifts.push({
        dealId: deal.dealId,
        taskId: null,
        kind: "missing_local_task",
        detail: `No local task linked to HubSpot deal ${deal.dealId}`,
      });
      continue;
    }

    const mappedTaskStatus = config.dealStageToTaskStatus[deal.stage] ?? null;
    if (!mappedTaskStatus) {
      drifts.push({
        dealId: deal.dealId,
        taskId: task.id,
        kind: "unmapped_deal_stage",
        detail: `No local status mapping for HubSpot stage "${deal.stage}"`,
      });
      continue;
    }

    const mappedDealStage = config.taskStatusToDealStage[task.status] ?? null;
    if (!mappedDealStage) {
      drifts.push({
        dealId: deal.dealId,
        taskId: task.id,
        kind: "unmapped_task_status",
        detail: `No HubSpot stage mapping for task status "${task.status}"`,
      });
      continue;
    }

    // Both sides mapped but they disagree
    if (task.status !== mappedTaskStatus || deal.stage !== mappedDealStage) {
      statusMismatches += 1;
      drifts.push({
        dealId: deal.dealId,
        taskId: task.id,
        kind: "unmapped_deal_stage", // reuse closest kind
        detail: `Status mismatch: deal stage "${deal.stage}" maps to "${mappedTaskStatus}" but task has "${task.status}"; task status "${task.status}" maps to "${mappedDealStage}" but deal has "${deal.stage}"`,
      });
    }
  }

  // Linked tasks without corresponding deals
  for (const [dealId, tasks] of linkedTasks.entries()) {
    if (touchedDealIds.has(dealId)) continue;

    const task = tasks[0] ?? null;
    drifts.push({
      dealId,
      taskId: task?.id ?? null,
      kind: "missing_hubspot_deal",
      detail: `No HubSpot deal found for linked task(s) on deal ${dealId}`,
    });

    if (task) {
      const mappedDealStage = config.taskStatusToDealStage[task.status] ?? null;
      if (!mappedDealStage) {
        drifts.push({
          dealId,
          taskId: task.id,
          kind: "unmapped_task_status",
          detail: `No HubSpot stage mapping for task status "${task.status}"`,
        });
      }
    }
  }

  const summary = {
    missingLocalTasks: drifts.filter((d) => d.kind === "missing_local_task").length,
    missingHubSpotDeals: drifts.filter((d) => d.kind === "missing_hubspot_deal").length,
    unmappedDealStages: drifts.filter((d) => d.kind === "unmapped_deal_stage").length,
    unmappedTaskStatuses: drifts.filter((d) => d.kind === "unmapped_task_status").length,
    statusMismatches,
  };

  return {
    scannedDeals: deals.length,
    scannedTasks,
    drifts,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers (pure functions)
// ---------------------------------------------------------------------------

/**
 * Get the default stage mapping configuration.
 * Delegates to the existing bidirectional sync module.
 */
export function getDefaultMappingConfig(): HubSpotBidirectionalSyncConfig {
  return defaultHubSpotBidirectionalConfig();
}

/**
 * Validate a mapping configuration for completeness.
 * Returns a list of issues found.
 */
export function validateMappingConfig(
  config: HubSpotBidirectionalSyncConfig
): string[] {
  const issues: string[] = [];

  // Check all task statuses have a deal stage mapping
  const allStatuses: TaskStatus[] = [
    "BACKLOG",
    "QUEUED",
    "WORKING_ON_TODAY",
    "ACTIVE",
    "NOT_DONE",
    "DONE",
  ];

  for (const status of allStatuses) {
    if (!config.taskStatusToDealStage[status]) {
      issues.push(`Task status "${status}" has no mapped deal stage`);
    }
  }

  // Check that deal stages referenced in taskStatusToDealStage have reverse mappings
  const uniqueStages = new Set(Object.values(config.taskStatusToDealStage));
  for (const stage of uniqueStages) {
    if (!config.dealStageToTaskStatus[stage]) {
      issues.push(
        `Deal stage "${stage}" (from taskStatusToDealStage) has no reverse mapping in dealStageToTaskStatus`
      );
    }
  }

  // Validate conflict resolution strategy
  const validStrategies = ["hubspot_wins", "task_wins", "newest_wins"];
  if (!validStrategies.includes(config.conflictResolution)) {
    issues.push(
      `Invalid conflict resolution strategy: "${config.conflictResolution}"`
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Idempotency key builders for webhook events
// ---------------------------------------------------------------------------

/**
 * Build a dedupe key for an inbound webhook event.
 * Uses the HubSpot event ID and deal ID to prevent reprocessing.
 */
export function buildWebhookDedupeKey(input: {
  dealId: string;
  eventId: string;
  targetStatus: TaskStatus;
}): string {
  return [
    "hubspot",
    "webhook",
    input.dealId,
    input.eventId,
    `to-status-${input.targetStatus}`,
  ].join(":");
}

/**
 * Build an idempotency key for an outbound sync event.
 */
export function buildOutboundSyncDedupeKey(input: {
  taskId: string;
  dealId: string;
  targetStage: string;
}): string {
  return [
    "hubspot",
    "outbound",
    input.taskId,
    input.dealId,
    `to-stage-${input.targetStage}`,
  ].join(":");
}

// ---------------------------------------------------------------------------
// Webhook processing result
// ---------------------------------------------------------------------------

export interface WebhookProcessingResult {
  processed: number;
  applied: number;
  skipped: number;
  errors: number;
  auditLog: SyncAuditEntry[];
  conflicts: HubSpotSyncConflict[];
}

/**
 * Aggregate multiple reconciliation actions into a processing result.
 * This is used by the webhook handler route to summarize what happened.
 */
export function aggregateWebhookResults(
  entries: Array<{
    action: ReconciliationAction;
    applied: boolean;
    error: string | null;
  }>,
  auditLog: SyncAuditEntry[],
): WebhookProcessingResult {
  let applied = 0;
  let skipped = 0;
  let errors = 0;
  const conflicts: HubSpotSyncConflict[] = [];

  for (const entry of entries) {
    if (entry.error) {
      errors += 1;
    } else if (entry.applied) {
      applied += 1;
    } else {
      skipped += 1;
    }

    if (entry.action.type === "update_task" || entry.action.type === "skip_task_wins") {
      // Both represent conflict detection
      const config = defaultHubSpotBidirectionalConfig();
      const mappedDealStage = entry.action.type === "update_task"
        ? config.taskStatusToDealStage[entry.action.fromStatus] ?? "UNMAPPED"
        : "UNMAPPED";
      conflicts.push({
        dealId: "unknown",
        taskId: entry.action.type === "update_task" ? entry.action.taskId : entry.action.taskId,
        dealStage: "unknown",
        mappedTaskStatus: entry.action.type === "update_task" ? entry.action.toStatus : "BACKLOG" as TaskStatus,
        taskStatus: entry.action.type === "update_task" ? entry.action.fromStatus : "BACKLOG" as TaskStatus,
        mappedDealStage,
        resolution: config.conflictResolution,
        winner: entry.action.type === "update_task" ? "deal" : "task",
        reason: entry.action.reason,
      });
    }
  }

  return {
    processed: entries.length,
    applied,
    skipped,
    errors,
    auditLog,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Export privates for testing
// ---------------------------------------------------------------------------

export const __test__ = {
  verifyWebhookSignature,
  parseDealStageChanges,
  computeReconciliation,
  buildAuditEntry,
  detectDrift,
  validateMappingConfig,
  buildWebhookDedupeKey,
  buildOutboundSyncDedupeKey,
  aggregateWebhookResults,
  MAX_TIMESTAMP_AGE_MS,
};
