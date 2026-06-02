/**
 * Outbox Event Bus — Public API
 *
 * Re-exports the core modules for ergonomic imports:
 *
 *   import { publishTypedDomainEvent, processOutboxBatch } from "@/lib/events";
 *
 * @module events
 */

// Types
export type {
  DomainEvent,
  DomainEventType,
  EventHandler,
  HandlerRegistry,
  OutboxEvent,
  OutboxEventStatus,
  OutboxWriteInput,
  PayloadFor,
  MetricRefreshedPayload,
  DashboardComputedPayload,
  AlertRaisedPayload,
  IntegrationSyncPayload,
} from "./outbox-types";
export { DOMAIN_EVENT_TYPES } from "./outbox-types";

// Writer
export {
  writeOutboxEvent,
  writeOutboxEventBatch,
  findExistingEvent,
  publishTypedDomainEvent,
} from "./outbox-writer";
export type { OutboxWriteClient, BatchWriteResult } from "./outbox-writer";

// Worker
export {
  computeRetryDelay,
  pollPendingEvents,
  markDispatched,
  markFailed,
  createHandlerRegistry,
  registerHandler,
  resolveHandlers,
  dispatchEvent,
  processOutboxBatch,
  DEFAULT_WORKER_CONFIG,
} from "./outbox-worker";
export type {
  WorkerConfig,
  WorkerDbClient,
  DispatchBatchResult,
} from "./outbox-worker";

// Idempotency
export {
  generateIdempotencyKey,
  canonicalize,
  isValidIdempotencyKey,
  checkDuplicate,
  replayEvents,
} from "./idempotency";
export type {
  IdempotencyKeyInput,
  DeduplicationClient,
  DeduplicationResult,
  ReplayClient,
  ReplayOptions,
  ReplayResult,
} from "./idempotency";

// Metrics
export {
  collectOutboxMetrics,
  countByProperty,
  computeAgeSeconds,
} from "./event-metrics";
export type {
  MetricsDbClient,
  OutboxMetrics,
} from "./event-metrics";
