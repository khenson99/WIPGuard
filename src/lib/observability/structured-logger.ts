/**
 * Structured Logging, Metrics, and Traces
 *
 * Provides structured event instrumentation by domain event.
 * All functions are pure -- no I/O. Consumers decide how to
 * persist or ship log entries.
 *
 * @module observability/structured-logger
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

export type DomainEventCategory =
  | "metrics"
  | "integration"
  | "outbox"
  | "auth"
  | "sync"
  | "websocket"
  | "oncall";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  category: DomainEventCategory;
  event: string;
  message: string;
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
}

export interface MetricPoint {
  name: string;
  value: number;
  unit: MetricUnit;
  tags: Record<string, string>;
  timestamp: string;
}

export type MetricUnit =
  | "count"
  | "seconds"
  | "milliseconds"
  | "percent"
  | "bytes"
  | "events";

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operation: string;
  category: DomainEventCategory;
  startedAt: string;
  endedAt: string | null;
  duration_ms: number | null;
  status: "ok" | "error" | "timeout";
  attributes: Record<string, unknown>;
}

export interface InstrumentationSnapshot {
  collectedAt: string;
  logs: StructuredLogEntry[];
  metrics: MetricPoint[];
  traces: TraceSpan[];
}

// ---------------------------------------------------------------------------
// ID generation (deterministic for testing)
// ---------------------------------------------------------------------------

export type IdGenerator = () => string;

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

export function sequentialIdGenerator(): string {
  idCounter += 1;
  return `span_${String(idCounter).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Structured log builder (pure)
// ---------------------------------------------------------------------------

export function createLogEntry(
  level: LogLevel,
  category: DomainEventCategory,
  event: string,
  message: string,
  opts: {
    traceId?: string | null;
    spanId?: string | null;
    parentSpanId?: string | null;
    duration_ms?: number | null;
    metadata?: Record<string, unknown>;
    now?: Date;
  } = {}
): StructuredLogEntry {
  return {
    timestamp: (opts.now ?? new Date()).toISOString(),
    level,
    category,
    event,
    message,
    traceId: opts.traceId ?? null,
    spanId: opts.spanId ?? null,
    parentSpanId: opts.parentSpanId ?? null,
    duration_ms: opts.duration_ms ?? null,
    metadata: opts.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Metric builder (pure)
// ---------------------------------------------------------------------------

export function createMetric(
  name: string,
  value: number,
  unit: MetricUnit,
  tags: Record<string, string> = {},
  now?: Date
): MetricPoint {
  return {
    name,
    value,
    unit,
    tags,
    timestamp: (now ?? new Date()).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Trace span builder (pure)
// ---------------------------------------------------------------------------

export function createTraceSpan(
  operation: string,
  category: DomainEventCategory,
  opts: {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string | null;
    startedAt?: Date;
    endedAt?: Date | null;
    status?: "ok" | "error" | "timeout";
    attributes?: Record<string, unknown>;
    idGen?: IdGenerator;
  } = {}
): TraceSpan {
  const idGen = opts.idGen ?? sequentialIdGenerator;
  const startedAt = opts.startedAt ?? new Date();
  const endedAt = opts.endedAt ?? null;
  const duration_ms = endedAt
    ? endedAt.getTime() - startedAt.getTime()
    : null;

  return {
    traceId: opts.traceId ?? idGen(),
    spanId: opts.spanId ?? idGen(),
    parentSpanId: opts.parentSpanId ?? null,
    operation,
    category,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
    duration_ms,
    status: opts.status ?? "ok",
    attributes: opts.attributes ?? {},
  };
}

// ---------------------------------------------------------------------------
// Domain event instrumentation factories
// ---------------------------------------------------------------------------

/**
 * Instrument an outbox dispatch cycle.
 */
export function instrumentOutboxDispatch(
  batchSize: number,
  dispatchedCount: number,
  failedCount: number,
  duration_ms: number,
  now: Date = new Date()
): { log: StructuredLogEntry; metrics: MetricPoint[]; span: TraceSpan } {
  const level: LogLevel = failedCount > 0 ? "warn" : "info";
  const traceId = sequentialIdGenerator();
  const spanId = sequentialIdGenerator();

  return {
    log: createLogEntry(level, "outbox", "outbox.dispatch.completed",
      `Dispatched ${dispatchedCount}/${batchSize} events (${failedCount} failed) in ${duration_ms}ms`, {
      traceId,
      spanId,
      duration_ms,
      metadata: { batchSize, dispatchedCount, failedCount },
      now,
    }),
    metrics: [
      createMetric("outbox.dispatch.batch_size", batchSize, "events", {}, now),
      createMetric("outbox.dispatch.success_count", dispatchedCount, "events", {}, now),
      createMetric("outbox.dispatch.failure_count", failedCount, "events", {}, now),
      createMetric("outbox.dispatch.duration", duration_ms, "milliseconds", {}, now),
    ],
    span: createTraceSpan("outbox.dispatch", "outbox", {
      traceId,
      spanId,
      startedAt: new Date(now.getTime() - duration_ms),
      endedAt: now,
      status: failedCount > 0 ? "error" : "ok",
      attributes: { batchSize, dispatchedCount, failedCount },
    }),
  };
}

/**
 * Instrument an integration sync operation.
 */
export function instrumentIntegrationSync(
  provider: string,
  recordsSynced: number,
  duration_ms: number,
  error: string | null,
  now: Date = new Date()
): { log: StructuredLogEntry; metrics: MetricPoint[]; span: TraceSpan } {
  const level: LogLevel = error ? "error" : "info";
  const traceId = sequentialIdGenerator();
  const spanId = sequentialIdGenerator();

  return {
    log: createLogEntry(level, "sync", "integration.sync.completed",
      error
        ? `Sync failed for ${provider}: ${error}`
        : `Synced ${recordsSynced} records from ${provider} in ${duration_ms}ms`, {
      traceId,
      spanId,
      duration_ms,
      metadata: { provider, recordsSynced, error },
      now,
    }),
    metrics: [
      createMetric("integration.sync.records", recordsSynced, "events", { provider }, now),
      createMetric("integration.sync.duration", duration_ms, "milliseconds", { provider }, now),
      createMetric("integration.sync.error", error ? 1 : 0, "count", { provider }, now),
    ],
    span: createTraceSpan("integration.sync", "sync", {
      traceId,
      spanId,
      startedAt: new Date(now.getTime() - duration_ms),
      endedAt: now,
      status: error ? "error" : "ok",
      attributes: { provider, recordsSynced, error },
    }),
  };
}

/**
 * Instrument an operating metric event.
 */
export function instrumentMetricEvent(
  action: string,
  metricId: string,
  metadata: Record<string, unknown>,
  now: Date = new Date()
): { log: StructuredLogEntry; metric: MetricPoint } {
  return {
    log: createLogEntry("info", "metrics", `metrics.${action}`,
      `Metric action: ${action} on ${metricId}`, {
      metadata: { metricId, ...metadata },
      now,
    }),
    metric: createMetric(`metrics.${action}`, 1, "count", { action }, now),
  };
}

/**
 * Instrument a websocket event delivery.
 */
export function instrumentWebsocketDelivery(
  eventType: string,
  connectedClients: number,
  deliveredCount: number,
  duration_ms: number,
  now: Date = new Date()
): { log: StructuredLogEntry; metrics: MetricPoint[]; span: TraceSpan } {
  const traceId = sequentialIdGenerator();
  const spanId = sequentialIdGenerator();
  const dropRate = connectedClients > 0
    ? ((connectedClients - deliveredCount) / connectedClients) * 100
    : 0;

  return {
    log: createLogEntry(
      dropRate > 10 ? "warn" : "info",
      "websocket",
      "websocket.delivery.completed",
      `Delivered ${eventType} to ${deliveredCount}/${connectedClients} clients in ${duration_ms}ms`,
      {
        traceId,
        spanId,
        duration_ms,
        metadata: { eventType, connectedClients, deliveredCount, dropRate },
        now,
      }
    ),
    metrics: [
      createMetric("websocket.delivery.clients", connectedClients, "count", { eventType }, now),
      createMetric("websocket.delivery.delivered", deliveredCount, "count", { eventType }, now),
      createMetric("websocket.delivery.drop_rate", dropRate, "percent", { eventType }, now),
      createMetric("websocket.delivery.duration", duration_ms, "milliseconds", { eventType }, now),
    ],
    span: createTraceSpan("websocket.delivery", "websocket", {
      traceId,
      spanId,
      startedAt: new Date(now.getTime() - duration_ms),
      endedAt: now,
      status: dropRate > 50 ? "error" : "ok",
      attributes: { eventType, connectedClients, deliveredCount, dropRate },
    }),
  };
}

// ---------------------------------------------------------------------------
// Snapshot aggregation (pure)
// ---------------------------------------------------------------------------

/**
 * Collect all instrumentation data into a point-in-time snapshot.
 */
export function createInstrumentationSnapshot(
  logs: StructuredLogEntry[],
  metrics: MetricPoint[],
  traces: TraceSpan[],
  now: Date = new Date()
): InstrumentationSnapshot {
  return {
    collectedAt: now.toISOString(),
    logs,
    metrics,
    traces,
  };
}
