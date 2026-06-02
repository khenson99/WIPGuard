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

export interface MetricRefreshedPayload {
  metricKey: string;
  sourceKey: string;
  value: unknown;
  refreshedBy: string;
}

export interface DashboardComputedPayload {
  dashboardId: string;
  metricKeys: string[];
  computedBy: string;
}

export interface AlertRaisedPayload {
  alertId: string;
  metricKey: string;
  severity: "info" | "warning" | "critical";
  raisedBy: string;
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
  | { eventType: "metric.refreshed"; aggregateType: "metric"; payload: MetricRefreshedPayload }
  | { eventType: "dashboard.computed"; aggregateType: "dashboard"; payload: DashboardComputedPayload }
  | { eventType: "alert.raised"; aggregateType: "alert"; payload: AlertRaisedPayload }
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
  "metric.refreshed",
  "dashboard.computed",
  "alert.raised",
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
