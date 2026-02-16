/**
 * Outbox Event Bus — Type definitions
 *
 * Defines the canonical DomainEvent discriminated union and OutboxEvent
 * interface. All integration consumers subscribe to typed domain events
 * rather than raw database rows.
 *
 * @module events/outbox-types
 */

// ---------------------------------------------------------------------------
// OutboxEvent Status (mirrors Prisma enum)
// ---------------------------------------------------------------------------

export type OutboxEventStatus = "PENDING" | "DISPATCHED" | "FAILED" | "DEAD_LETTER";

// ---------------------------------------------------------------------------
// OutboxEvent interface (mirrors Prisma model shape for pure-function use)
// ---------------------------------------------------------------------------

export interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  schemaVersion: number;
  payload: unknown;

  idempotencyKey: string;
  status: OutboxEventStatus;
  retryCount: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  dispatchedAt: Date | null;
  failedAt: Date | null;
  error: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Domain Event Payloads
// ---------------------------------------------------------------------------

export interface TaskCreatedPayload {
  taskId: string;
  title: string;
  projectId: string | null;
  assigneeId: string | null;
  priority: string | null;
  createdBy: string;
}

export interface TaskMovedPayload {
  taskId: string;
  fromColumn: string;
  toColumn: string;
  movedBy: string;
}

export interface TaskAssignedPayload {
  taskId: string;
  previousAssigneeId: string | null;
  newAssigneeId: string;
  assignedBy: string;
}

export interface TaskUpdatedPayload {
  taskId: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  updatedBy: string;
}

export interface TaskDeletedPayload {
  taskId: string;
  deletedBy: string;
}

export interface TaskBlockedPayload {
  taskId: string;
  reason: string;
  blockedBy: string;
}

export interface TaskUnblockedPayload {
  taskId: string;
  unblockedBy: string;
}

export interface SprintStartedPayload {
  sprintId: string;
  name: string;
  startDate: string;
  endDate: string;
  startedBy: string;
}

export interface SprintCompletedPayload {
  sprintId: string;
  name: string;
  completedTaskCount: number;
  totalTaskCount: number;
  completedBy: string;
}

export interface SprintPlanningPayload {
  sprintId: string;
  taskIds: string[];
  plannedBy: string;
}

export interface IntegrationSyncPayload {
  provider: string;
  direction: "inbound" | "outbound";
  recordCount: number;
  triggeredBy: string;
}

// ---------------------------------------------------------------------------
// Discriminated Union — DomainEvent
// ---------------------------------------------------------------------------

export type DomainEvent =
  | { eventType: "task.created"; aggregateType: "task"; payload: TaskCreatedPayload }
  | { eventType: "task.moved"; aggregateType: "task"; payload: TaskMovedPayload }
  | { eventType: "task.assigned"; aggregateType: "task"; payload: TaskAssignedPayload }
  | { eventType: "task.updated"; aggregateType: "task"; payload: TaskUpdatedPayload }
  | { eventType: "task.deleted"; aggregateType: "task"; payload: TaskDeletedPayload }
  | { eventType: "task.blocked"; aggregateType: "task"; payload: TaskBlockedPayload }
  | { eventType: "task.unblocked"; aggregateType: "task"; payload: TaskUnblockedPayload }
  | { eventType: "sprint.started"; aggregateType: "sprint"; payload: SprintStartedPayload }
  | { eventType: "sprint.completed"; aggregateType: "sprint"; payload: SprintCompletedPayload }
  | { eventType: "sprint.planning"; aggregateType: "sprint"; payload: SprintPlanningPayload }
  | { eventType: "integration.sync"; aggregateType: "integration"; payload: IntegrationSyncPayload };

/**
 * Extract the payload type for a given event type string.
 */
export type PayloadFor<T extends DomainEvent["eventType"]> = Extract<
  DomainEvent,
  { eventType: T }
>["payload"];

/**
 * All known event type strings.
 */
export const DOMAIN_EVENT_TYPES = [
  "task.created",
  "task.moved",
  "task.assigned",
  "task.updated",
  "task.deleted",
  "task.blocked",
  "task.unblocked",
  "sprint.started",
  "sprint.completed",
  "sprint.planning",
  "integration.sync",
] as const satisfies readonly DomainEvent["eventType"][];

export type DomainEventType = DomainEvent["eventType"];

// ---------------------------------------------------------------------------
// Handler registry types
// ---------------------------------------------------------------------------

/**
 * A typed event handler receives an OutboxEvent whose payload is narrowed
 * to the corresponding DomainEvent payload type.
 */
export type EventHandler<T extends DomainEventType = DomainEventType> = (
  event: OutboxEvent & { payload: PayloadFor<T> }
) => Promise<void>;

/**
 * Registry mapping event types to arrays of handlers.
 */
export type HandlerRegistry = Partial<{
  [K in DomainEventType]: EventHandler<K>[];
}>;

// ---------------------------------------------------------------------------
// Outbox write input
// ---------------------------------------------------------------------------

export interface OutboxWriteInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  schemaVersion?: number;
}
