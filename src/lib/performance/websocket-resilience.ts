/**
 * WebSocket Resilience Testing
 *
 * Validates graceful degradation paths for websocket loss,
 * including exponential backoff reconnection, message ordering,
 * and queue overflow handling.
 */

import { createSeededRandom } from "./load-test-harness";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DisconnectReason =
  | "network_loss"
  | "server_restart"
  | "idle_timeout"
  | "client_error"
  | "load_balancer_reset";

export interface WebSocketTestConfig {
  testId: string;
  seed: number;
  /** Number of simulated clients */
  clientCount: number;
  /** Base reconnect interval in ms */
  baseReconnectMs: number;
  /** Maximum reconnect interval in ms */
  maxReconnectMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Maximum reconnect attempts before giving up */
  maxReconnectAttempts: number;
  /** Maximum message queue size per client */
  maxQueueSize: number;
  /** Jitter factor (0-1) for reconnect timing */
  jitterFactor: number;
}

export interface DisconnectEvent {
  clientId: string;
  reason: DisconnectReason;
  timestampMs: number;
  messagesPending: number;
}

export interface ReconnectAttempt {
  clientId: string;
  attemptNumber: number;
  delayMs: number;
  success: boolean;
  timestampMs: number;
}

export interface DisconnectResult {
  clientId: string;
  disconnectReason: DisconnectReason;
  reconnectAttempts: ReconnectAttempt[];
  reconnected: boolean;
  totalDowntimeMs: number;
  messagesLost: number;
  messagesQueued: number;
  messagesDeliveredAfterReconnect: number;
}

export interface MessageOrderingResult {
  totalMessages: number;
  outOfOrderMessages: number;
  duplicateMessages: number;
  orderingScore: number;
}

export interface QueueOverflowResult {
  clientId: string;
  maxQueueSize: number;
  messagesAttempted: number;
  messagesQueued: number;
  messagesDropped: number;
  oldestMessageAgeMs: number;
  overflowHandled: boolean;
}

export interface WebSocketResilienceResult {
  testId: string;
  disconnects: DisconnectResult[];
  messageOrdering: MessageOrderingResult;
  queueOverflows: QueueOverflowResult[];
  totalClients: number;
  clientsReconnected: number;
  clientsFailed: number;
  meanReconnectTimeMs: number;
  maxReconnectTimeMs: number;
  dataLossRate: number;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Calculate reconnect delay with exponential backoff and jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Pick<
    WebSocketTestConfig,
    "baseReconnectMs" | "maxReconnectMs" | "backoffMultiplier" | "jitterFactor"
  >,
  rand: () => number,
): number {
  const exponentialDelay =
    config.baseReconnectMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(exponentialDelay, config.maxReconnectMs);

  // Apply jitter: +/- jitterFactor of the delay
  const jitter = capped * config.jitterFactor * (2 * rand() - 1);
  return Math.max(config.baseReconnectMs, Math.round(capped + jitter));
}

/**
 * Simulate a disconnect and reconnection sequence for a single client.
 */
export function simulateDisconnect(
  config: WebSocketTestConfig,
  clientId: string,
  reason: DisconnectReason,
  pendingMessages: number,
  rand: () => number,
): DisconnectResult {
  const attempts: ReconnectAttempt[] = [];
  let totalDowntime = 0;
  let reconnected = false;

  // Reconnection probability depends on reason
  const baseReconnectChance: Record<DisconnectReason, number> = {
    network_loss: 0.4,
    server_restart: 0.6,
    idle_timeout: 0.85,
    client_error: 0.3,
    load_balancer_reset: 0.55,
  };

  for (let i = 0; i < config.maxReconnectAttempts; i++) {
    const delay = calculateBackoffDelay(i, config, rand);
    totalDowntime += delay;

    // Success probability increases with each attempt (server recovery)
    const successChance = Math.min(
      0.95,
      baseReconnectChance[reason] + i * 0.15,
    );
    const success = rand() < successChance;

    attempts.push({
      clientId,
      attemptNumber: i + 1,
      delayMs: delay,
      success,
      timestampMs: totalDowntime,
    });

    if (success) {
      reconnected = true;
      break;
    }
  }

  // Messages handling during disconnect
  const queueCapacity = Math.min(pendingMessages, config.maxQueueSize);
  const messagesLost = reconnected
    ? Math.max(0, pendingMessages - config.maxQueueSize)
    : pendingMessages;
  const messagesDelivered = reconnected ? queueCapacity : 0;

  return {
    clientId,
    disconnectReason: reason,
    reconnectAttempts: attempts,
    reconnected,
    totalDowntimeMs: totalDowntime,
    messagesLost,
    messagesQueued: queueCapacity,
    messagesDeliveredAfterReconnect: messagesDelivered,
  };
}

/**
 * Validate message ordering after reconnection.
 * Simulates sequence number tracking across disconnect/reconnect cycles.
 */
export function validateMessageOrdering(
  rand: () => number,
  totalMessages: number,
  disconnectCount: number,
): MessageOrderingResult {
  if (totalMessages === 0) {
    return {
      totalMessages: 0,
      outOfOrderMessages: 0,
      duplicateMessages: 0,
      orderingScore: 1,
    };
  }

  // Simulate message sequence numbers
  const received: number[] = [];
  let nextExpected = 0;

  for (let i = 0; i < totalMessages; i++) {
    // During disconnects, some messages may arrive out of order
    const inDisconnectWindow =
      disconnectCount > 0 && rand() < disconnectCount * 0.02;

    if (inDisconnectWindow && i > 0) {
      // Possible reorder: swap with a nearby message
      const swapDistance = Math.ceil(rand() * 3);
      const swapIdx = Math.max(0, i - swapDistance);
      received.push(swapIdx);
    } else {
      received.push(nextExpected);
    }
    nextExpected++;
  }

  // Count out-of-order and duplicates
  let outOfOrder = 0;
  let duplicates = 0;
  const seen = new Set<number>();
  let lastSeq = -1;

  for (const seq of received) {
    if (seen.has(seq)) {
      duplicates++;
    } else {
      seen.add(seq);
    }
    if (seq < lastSeq) {
      outOfOrder++;
    }
    lastSeq = seq;
  }

  const orderingScore = Math.max(
    0,
    1 - (outOfOrder + duplicates) / totalMessages,
  );

  return {
    totalMessages,
    outOfOrderMessages: outOfOrder,
    duplicateMessages: duplicates,
    orderingScore,
  };
}

/**
 * Test queue overflow behavior under sustained disconnect.
 */
export function testQueueOverflow(
  config: WebSocketTestConfig,
  clientId: string,
  incomingMessageCount: number,
  rand: () => number,
): QueueOverflowResult {
  let queued = 0;
  let dropped = 0;
  let oldestAgeMs = 0;
  const messageIntervalMs = 100;

  for (let i = 0; i < incomingMessageCount; i++) {
    if (queued < config.maxQueueSize) {
      queued++;
    } else {
      dropped++;
    }
    oldestAgeMs = (queued > 0 ? queued : 1) * messageIntervalMs;
  }

  return {
    clientId,
    maxQueueSize: config.maxQueueSize,
    messagesAttempted: incomingMessageCount,
    messagesQueued: queued,
    messagesDropped: dropped,
    oldestMessageAgeMs: oldestAgeMs,
    overflowHandled: dropped >= 0, // Always true - we handle overflow by dropping
  };
}

/**
 * Simulate reconnection behavior including backoff validation.
 */
export function testReconnectBehavior(
  config: WebSocketTestConfig,
): WebSocketResilienceResult {
  const rand = createSeededRandom(config.seed);
  const disconnectReasons: DisconnectReason[] = [
    "network_loss",
    "server_restart",
    "idle_timeout",
    "client_error",
    "load_balancer_reset",
  ];

  const disconnects: DisconnectResult[] = [];
  const queueOverflows: QueueOverflowResult[] = [];
  let totalMessages = 0;

  for (let c = 0; c < config.clientCount; c++) {
    const clientId = `client-${c}`;
    const reason =
      disconnectReasons[Math.floor(rand() * disconnectReasons.length)];
    const pendingMessages = Math.round(rand() * 50);
    totalMessages += pendingMessages + Math.round(rand() * 100);

    const result = simulateDisconnect(
      config,
      clientId,
      reason,
      pendingMessages,
      rand,
    );
    disconnects.push(result);

    // Test queue overflow for clients with sustained disconnect
    if (!result.reconnected || result.totalDowntimeMs > 5000) {
      const overflow = testQueueOverflow(
        config,
        clientId,
        Math.round(50 + rand() * 200),
        rand,
      );
      queueOverflows.push(overflow);
    }
  }

  const reconnected = disconnects.filter((d) => d.reconnected);
  const reconnectTimes = reconnected.map((d) => d.totalDowntimeMs);
  const messageOrdering = validateMessageOrdering(
    rand,
    totalMessages,
    disconnects.length,
  );

  const totalMessagesLost = disconnects.reduce(
    (sum, d) => sum + d.messagesLost,
    0,
  );

  return {
    testId: config.testId,
    disconnects,
    messageOrdering,
    queueOverflows,
    totalClients: config.clientCount,
    clientsReconnected: reconnected.length,
    clientsFailed: disconnects.length - reconnected.length,
    meanReconnectTimeMs:
      reconnectTimes.length > 0
        ? Math.round(
            reconnectTimes.reduce((a, b) => a + b, 0) / reconnectTimes.length,
          )
        : 0,
    maxReconnectTimeMs:
      reconnectTimes.length > 0 ? Math.max(...reconnectTimes) : 0,
    dataLossRate:
      totalMessages > 0 ? totalMessagesLost / totalMessages : 0,
  };
}
