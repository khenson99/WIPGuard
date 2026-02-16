/**
 * Runbook Definitions
 *
 * Executable, structured runbooks for operational scenarios:
 * - Sync lag
 * - Queue backup
 * - WebSocket degradation
 *
 * Each runbook contains diagnostic steps, remediation actions,
 * and escalation criteria. All functions are pure.
 *
 * @module observability/runbooks
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunbookSeverity = "low" | "medium" | "high" | "critical";

export type RunbookStepType = "diagnostic" | "remediation" | "escalation" | "verification";

export interface RunbookStep {
  id: string;
  order: number;
  type: RunbookStepType;
  title: string;
  description: string;
  command: string | null;
  expectedOutcome: string;
  timeoutMinutes: number;
}

export interface RunbookEscalation {
  condition: string;
  target: string;
  channel: string;
  withinMinutes: number;
}

export interface Runbook {
  id: string;
  title: string;
  description: string;
  severity: RunbookSeverity;
  triggerConditions: string[];
  sloKeys: string[];
  steps: RunbookStep[];
  escalation: RunbookEscalation;
  lastTestedAt: string | null;
  estimatedResolutionMinutes: number;
}

export interface RunbookExecutionResult {
  runbookId: string;
  startedAt: string;
  completedAt: string;
  stepsCompleted: number;
  totalSteps: number;
  success: boolean;
  failedStepId: string | null;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Runbook definitions
// ---------------------------------------------------------------------------

export const RUNBOOK_SYNC_LAG: Runbook = {
  id: "sync-lag",
  title: "Integration Sync Lag",
  description:
    "Execute when provider syncs fall behind freshness SLOs or integration status enters ERROR state. " +
    "Covers stale connections, failed rule executions, and provider-specific auth issues.",
  severity: "high",
  triggerConditions: [
    "integration_sync_freshness SLO breached",
    "integration_connection_health SLO breached",
    "Provider status is ERROR for > 5 minutes",
  ],
  sloKeys: ["integration_sync_freshness", "integration_connection_health"],
  steps: [
    {
      id: "sync-lag-diag-1",
      order: 1,
      type: "diagnostic",
      title: "Check provider connection status",
      description: "Query the integrations API for current connection statuses across all providers.",
      command: "GET /api/ops/observability -> integrationHealth.providers",
      expectedOutcome: "Identify which providers are in ERROR or have stale connections.",
      timeoutMinutes: 2,
    },
    {
      id: "sync-lag-diag-2",
      order: 2,
      type: "diagnostic",
      title: "Check provider-specific error logs",
      description: "Review structured logs for the affected provider to identify root cause.",
      command: "GET /api/ops/oncall-dashboard -> recentLogs filtered by category=sync",
      expectedOutcome: "Identify error pattern: auth expiry, rate limit, API outage, or data format issue.",
      timeoutMinutes: 3,
    },
    {
      id: "sync-lag-remed-1",
      order: 3,
      type: "remediation",
      title: "Refresh provider OAuth tokens",
      description: "If auth-related error: trigger token refresh via the integration settings.",
      command: "POST /api/integrations/{provider}/reconnect",
      expectedOutcome: "Connection status returns to CONNECTED within 2 minutes.",
      timeoutMinutes: 5,
    },
    {
      id: "sync-lag-remed-2",
      order: 4,
      type: "remediation",
      title: "Force-trigger sync rule execution",
      description: "Manually trigger the stale sync rules to re-establish freshness.",
      command: "POST /api/integrations/{provider}/sync",
      expectedOutcome: "Rule lastRunAt updates to current time; stale count drops to 0.",
      timeoutMinutes: 5,
    },
    {
      id: "sync-lag-verify",
      order: 5,
      type: "verification",
      title: "Verify SLO recovery",
      description: "Re-check the observability dashboard to confirm SLOs are no longer breached.",
      command: "GET /api/ops/observability -> report.overallStatus",
      expectedOutcome: "integration_sync_freshness and integration_connection_health show breached=false.",
      timeoutMinutes: 2,
    },
  ],
  escalation: {
    condition: "Steps 3-4 fail or connection remains in ERROR after remediation attempts.",
    target: "Platform Engineering Lead",
    channel: "#ops-escalation",
    withinMinutes: 15,
  },
  lastTestedAt: null,
  estimatedResolutionMinutes: 15,
};

export const RUNBOOK_QUEUE_BACKUP: Runbook = {
  id: "queue-backup",
  title: "Queue Backup",
  description:
    "Execute when outbox delivery lag grows beyond 5 minutes, retry counts spike, " +
    "or dead-letter events exceed the failure budget threshold.",
  severity: "critical",
  triggerConditions: [
    "outbox_delivery_lag SLO breached (>300s)",
    "outbox_failure_budget SLO breached (>=20 failed+dead-letter)",
    "Dead-letter event count increases rapidly",
  ],
  sloKeys: ["outbox_delivery_lag", "outbox_failure_budget"],
  steps: [
    {
      id: "queue-diag-1",
      order: 1,
      type: "diagnostic",
      title: "Check outbox metrics",
      description: "Review current outbox event counts, lag, and failure distribution.",
      command: "GET /api/events/dashboard -> metrics.counts, metrics.lag",
      expectedOutcome: "Identify pending/failed event counts and lag duration.",
      timeoutMinutes: 2,
    },
    {
      id: "queue-diag-2",
      order: 2,
      type: "diagnostic",
      title: "Inspect dead-letter events",
      description: "Review recent dead-letter events for common error patterns.",
      command: "GET /api/events/dashboard -> metrics.recentDeadLetters",
      expectedOutcome: "Identify error pattern: dispatcher crash, downstream unavailable, or data corruption.",
      timeoutMinutes: 3,
    },
    {
      id: "queue-diag-3",
      order: 3,
      type: "diagnostic",
      title: "Check dispatcher health",
      description: "Verify the outbox worker process is running and processing events.",
      command: "GET /api/ops/oncall-dashboard -> systemHealth.outboxWorker",
      expectedOutcome: "Worker is running and consuming events. If stuck, identify the blocking event.",
      timeoutMinutes: 2,
    },
    {
      id: "queue-remed-1",
      order: 4,
      type: "remediation",
      title: "Replay failed events",
      description: "Trigger replay of failed events that haven't exceeded max retries.",
      command: "POST /api/events/replay { statuses: ['FAILED'], limit: 50 }",
      expectedOutcome: "Failed events move back to PENDING and are re-dispatched within 2 minutes.",
      timeoutMinutes: 5,
    },
    {
      id: "queue-remed-2",
      order: 5,
      type: "remediation",
      title: "Clear stuck events",
      description: "If specific events are blocking the queue, move them to dead-letter to unblock processing.",
      command: "POST /api/events/dead-letter { eventIds: ['...'] }",
      expectedOutcome: "Queue resumes processing. Lag begins decreasing.",
      timeoutMinutes: 3,
    },
    {
      id: "queue-verify",
      order: 6,
      type: "verification",
      title: "Verify queue recovery",
      description: "Monitor outbox metrics to confirm lag is decreasing and new events are being dispatched.",
      command: "GET /api/ops/observability -> report.slos[outbox_delivery_lag].breached",
      expectedOutcome: "outbox_delivery_lag breached=false within 5 minutes of remediation.",
      timeoutMinutes: 5,
    },
  ],
  escalation: {
    condition: "Lag continues to grow after replay and dead-letter remediation, or dead-letter count exceeds 50.",
    target: "Backend Engineering Lead + CTO",
    channel: "#ops-critical",
    withinMinutes: 10,
  },
  lastTestedAt: null,
  estimatedResolutionMinutes: 20,
};

export const RUNBOOK_WEBSOCKET_DEGRADATION: Runbook = {
  id: "websocket-degradation",
  title: "WebSocket Degradation",
  description:
    "Execute when realtime board updates are delayed, not delivered, or the websocket " +
    "delivery proxy SLO is breached. Covers event delivery failures and client disconnect spikes.",
  severity: "high",
  triggerConditions: [
    "websocket_delivery_proxy SLO breached",
    "Client-reported stale board state",
    "WebSocket drop rate exceeds 10%",
  ],
  sloKeys: ["websocket_delivery_proxy"],
  steps: [
    {
      id: "ws-diag-1",
      order: 1,
      type: "diagnostic",
      title: "Check websocket delivery metrics",
      description: "Review websocket delivery stats: connected clients, delivery rate, drop rate.",
      command: "GET /api/ops/oncall-dashboard -> recentMetrics filtered by websocket.*",
      expectedOutcome: "Identify drop rate, delivery latency, and affected event types.",
      timeoutMinutes: 2,
    },
    {
      id: "ws-diag-2",
      order: 2,
      type: "diagnostic",
      title: "Check upstream event delivery",
      description: "Verify outbox events are being dispatched -- websocket issues may be downstream of queue backup.",
      command: "GET /api/events/dashboard -> metrics.lag",
      expectedOutcome: "If outbox lag is high, this is a queue backup issue. Follow queue-backup runbook first.",
      timeoutMinutes: 2,
    },
    {
      id: "ws-remed-1",
      order: 3,
      type: "remediation",
      title: "Verify server-side websocket health",
      description: "Check that the websocket server process is accepting connections and broadcasting events.",
      command: "GET /api/ops/oncall-dashboard -> systemHealth.websocket",
      expectedOutcome: "Server reports healthy connection pool. If not, restart websocket service.",
      timeoutMinutes: 3,
    },
    {
      id: "ws-remed-2",
      order: 4,
      type: "remediation",
      title: "Force client reconnection",
      description: "If server is healthy but clients are stale, broadcast a reconnection signal.",
      command: "POST /api/ops/websocket/reconnect-signal",
      expectedOutcome: "Connected clients re-establish connections. Delivery rate normalizes.",
      timeoutMinutes: 3,
    },
    {
      id: "ws-verify",
      order: 5,
      type: "verification",
      title: "Verify realtime delivery recovery",
      description: "Confirm websocket delivery proxy SLO is no longer breached.",
      command: "GET /api/ops/observability -> report.slos[websocket_delivery_proxy].breached",
      expectedOutcome: "websocket_delivery_proxy breached=false. Drop rate returns below 10%.",
      timeoutMinutes: 3,
    },
  ],
  escalation: {
    condition: "Drop rate remains above 50% after remediation or server-side websocket process is unresponsive.",
    target: "Platform Engineering Lead",
    channel: "#ops-escalation",
    withinMinutes: 10,
  },
  lastTestedAt: null,
  estimatedResolutionMinutes: 15,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const RUNBOOK_REGISTRY: Record<string, Runbook> = {
  "sync-lag": RUNBOOK_SYNC_LAG,
  "queue-backup": RUNBOOK_QUEUE_BACKUP,
  "websocket-degradation": RUNBOOK_WEBSOCKET_DEGRADATION,
};

/**
 * Get all runbooks.
 */
export function getAllRunbooks(): Runbook[] {
  return Object.values(RUNBOOK_REGISTRY);
}

/**
 * Get a runbook by ID.
 */
export function getRunbookById(id: string): Runbook | null {
  return RUNBOOK_REGISTRY[id] ?? null;
}

/**
 * Get runbooks triggered by a given SLO key.
 */
export function getRunbooksForSlo(sloKey: string): Runbook[] {
  return getAllRunbooks().filter((rb) => rb.sloKeys.includes(sloKey));
}

/**
 * Get suggested runbooks for a set of breached SLO keys.
 */
export function getSuggestedRunbooks(breachedSloKeys: string[]): Runbook[] {
  const seen = new Set<string>();
  const result: Runbook[] = [];

  for (const sloKey of breachedSloKeys) {
    for (const runbook of getRunbooksForSlo(sloKey)) {
      if (!seen.has(runbook.id)) {
        seen.add(runbook.id);
        result.push(runbook);
      }
    }
  }

  // Sort by severity: critical first
  const severityOrder: Record<RunbookSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return result.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

// ---------------------------------------------------------------------------
// Runbook execution simulation (pure -- for testing)
// ---------------------------------------------------------------------------

/**
 * Simulate executing a runbook and return the result.
 * This is a pure function for testing; real execution would
 * involve actual API calls.
 */
export function simulateRunbookExecution(
  runbook: Runbook,
  stepResults: Record<string, boolean>,
  now: Date = new Date()
): RunbookExecutionResult {
  const startedAt = new Date(
    now.getTime() - runbook.estimatedResolutionMinutes * 60 * 1000
  );

  let stepsCompleted = 0;
  let failedStepId: string | null = null;
  const notes: string[] = [];

  for (const step of runbook.steps) {
    const passed = stepResults[step.id] ?? true;

    if (passed) {
      stepsCompleted += 1;
      notes.push(`[PASS] ${step.title}`);
    } else {
      failedStepId = step.id;
      notes.push(`[FAIL] ${step.title}`);
      break;
    }
  }

  return {
    runbookId: runbook.id,
    startedAt: startedAt.toISOString(),
    completedAt: now.toISOString(),
    stepsCompleted,
    totalSteps: runbook.steps.length,
    success: failedStepId === null,
    failedStepId,
    notes,
  };
}
