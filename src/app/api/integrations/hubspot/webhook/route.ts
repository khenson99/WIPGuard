export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { getNextColumnOrder } from "@/lib/task-order";
import {
  verifyWebhookSignature,
  parseDealStageChanges,
  computeReconciliation,
  buildAuditEntry,
  buildWebhookDedupeKey,
  type SyncAuditEntry,
  type ParsedDealStageChange,
} from "@/lib/integrations/hubspot-sync";
import {
  HUBSPOT_BIDIRECTIONAL_RULE_KEY,
  __private__ as bidirectionalPrivate,
} from "@/lib/integrations/hubspot-bidirectional-sync";

const WEBHOOK_PROCESSING_TIMEOUT_MS = 30_000;
const WEBHOOK_TIMEOUT_MESSAGE = `HubSpot webhook processing timed out after ${WEBHOOK_PROCESSING_TIMEOUT_MS}ms`;

interface WebhookProcessingError {
  dealId: string;
  error: string;
}

interface WebhookProcessingResult {
  applied: number;
  skipped: number;
  errors: WebhookProcessingError[];
}

function assertWithinDeadline(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error(WEBHOOK_TIMEOUT_MESSAGE);
  }
}

function isWebhookTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === WEBHOOK_TIMEOUT_MESSAGE;
}

async function withWebhookProcessingTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(WEBHOOK_TIMEOUT_MESSAGE));
    }, WEBHOOK_PROCESSING_TIMEOUT_MS);

    operation(controller.signal)
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  userId: string;
  change: ParsedDealStageChange;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.hubspot.webhook.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        dealId: input.change.dealId,
        eventId: input.change.eventId,
        portalId: input.change.portalId,
        newStage: input.change.newStage,
        occurredAt: input.change.occurredAt.toISOString(),
        changeSource: input.change.changeSource,
        userId: input.userId,
        error: input.error,
      } as unknown as Prisma.InputJsonValue,
      idempotencyKey: [
        "dead-letter:hubspot-webhook",
        input.ruleId,
        input.change.dealId,
        input.change.eventId || input.change.occurredAt.getTime().toString(),
        Date.now().toString(),
      ].join(":"),
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

/**
 * POST /api/integrations/hubspot/webhook
 *
 * Receives HubSpot webhook events for deal property changes.
 * Verifies the webhook signature, parses deal stage changes,
 * and reconciles with local task state.
 *
 * This endpoint does NOT require auth() because it is called
 * by HubSpot servers. Authentication is via HMAC signature.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (!clientSecret) {
      console.error("hubspot.webhook: HUBSPOT_CLIENT_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook handler not configured" },
        { status: 500 }
      );
    }

    // Read raw body for signature verification
    const body = await request.text();
    const url = request.url;
    const method = request.method;

    const signatureResult = verifyWebhookSignature({
      signatureHeader: request.headers.get("x-hubspot-signature-v3"),
      timestampHeader: request.headers.get("x-hubspot-request-timestamp"),
      method,
      url,
      body,
      clientSecret,
    });

    if (!signatureResult.valid) {
      console.warn("hubspot.webhook: signature verification failed", {
        reason: signatureResult.reason,
      });
      return NextResponse.json(
        { error: "Invalid webhook signature", reason: signatureResult.reason },
        { status: 401 }
      );
    }

    let events: unknown;
    try {
      events = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const dealChanges = parseDealStageChanges(events);
    if (dealChanges.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const result = await withWebhookProcessingTimeout((signal) =>
      processWebhookChanges({ dealChanges, signal })
    );

    console.info("hubspot.webhook: processed", {
      total: dealChanges.length,
      applied: result.applied,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    const hasErrors = result.errors.length > 0;
    return NextResponse.json(
      {
        ok: !hasErrors,
        processed: dealChanges.length,
        applied: result.applied,
        skipped: result.skipped,
        errors: result.errors.length,
        failures: result.errors,
      },
      { status: hasErrors ? 207 : 200 }
    );
  } catch (error) {
    if (isWebhookTimeoutError(error)) {
      console.error("hubspot.webhook: processing timed out", {
        timeoutMs: WEBHOOK_PROCESSING_TIMEOUT_MS,
      });
      return NextResponse.json(
        {
          error: "HubSpot webhook processing timed out",
          timeoutMs: WEBHOOK_PROCESSING_TIMEOUT_MS,
        },
        { status: 500 }
      );
    }

    console.error("hubspot.webhook: fatal error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to process HubSpot webhook" },
      { status: 500 }
    );
  }
}

async function processWebhookChanges(input: {
  dealChanges: ParsedDealStageChange[];
  signal: AbortSignal;
}): Promise<WebhookProcessingResult> {
  const { dealChanges, signal } = input;

  const auditLog: SyncAuditEntry[] = [];
  let applied = 0;
  let skipped = 0;
  const errors: WebhookProcessingError[] = [];

  assertWithinDeadline(signal);

  const portalId = dealChanges[0]?.portalId;
  const connections = portalId
    ? await prisma.integrationConnection.findMany({
        where: {
          provider: IntegrationProvider.HUBSPOT,
          metadata: {
            path: ["hubId"],
            equals: portalId,
          },
        },
      })
    : [];

  assertWithinDeadline(signal);

  const targetConnections =
    connections.length > 0
      ? connections
      : await prisma.integrationConnection.findMany({
          where: { provider: IntegrationProvider.HUBSPOT },
          take: 10,
        });

  for (const connection of targetConnections) {
    assertWithinDeadline(signal);

    const rule = await prisma.integrationRule.findUnique({
      where: {
        userId_provider_key: {
          userId: connection.userId,
          provider: IntegrationProvider.HUBSPOT,
          key: HUBSPOT_BIDIRECTIONAL_RULE_KEY,
        },
      },
    });

    if (!rule || !rule.enabled) continue;

    const config = bidirectionalPrivate.normalizeConfig(rule.config);

    for (const change of dealChanges) {
      assertWithinDeadline(signal);

      try {
        await processInboundChange({
          change,
          userId: connection.userId,
          ruleId: rule.id,
          config,
          auditLog,
          onApplied: () => {
            applied += 1;
          },
          onSkipped: () => {
            skipped += 1;
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ dealId: change.dealId, error: message });
        console.error("hubspot.webhook: processing error", {
          dealId: change.dealId,
          error: message,
        });

        try {
          await recordDeadLetterFailure({
            ruleId: rule.id,
            userId: connection.userId,
            change,
            error: message,
          });
        } catch (deadLetterError) {
          console.error("hubspot.webhook: failed to record dead-letter event", {
            dealId: change.dealId,
            error:
              deadLetterError instanceof Error
                ? deadLetterError.message
                : String(deadLetterError),
          });
        }
      }
    }

    assertWithinDeadline(signal);

    const newestChange = dealChanges[dealChanges.length - 1];
    if (newestChange) {
      await prisma.integrationRule.update({
        where: { id: rule.id },
        data: {
          lastRunAt: new Date(),
          lastObservedAt: newestChange.occurredAt,
          lastError:
            errors.length > 0
              ? `${errors.length} webhook processing error(s)`
              : null,
        },
      });
    }
  }

  return { applied, skipped, errors };
}

async function processInboundChange(input: {
  change: ParsedDealStageChange;
  userId: string;
  ruleId: string;
  config: ReturnType<typeof bidirectionalPrivate.normalizeConfig>;
  auditLog: SyncAuditEntry[];
  onApplied: () => void;
  onSkipped: () => void;
}): Promise<void> {
  const { change, userId, ruleId, config, auditLog, onApplied, onSkipped } = input;

  // Look up linked task for this deal
  const receipts = await prisma.integrationReceipt.findMany({
    where: {
      rule: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
      },
      externalObjectId: {
        startsWith: `${change.dealId}:`,
      },
      taskId: { not: null },
    },
    select: {
      task: {
        select: {
          id: true,
          status: true,
          updatedAt: true,
          completedOn: true,
        },
      },
    },
    orderBy: { lastObservedAt: "desc" },
    take: 1,
  });

  const task = receipts[0]?.task ?? null;

  // Compute reconciliation action
  const action = computeReconciliation({
    dealId: change.dealId,
    newDealStage: change.newStage,
    dealUpdatedAt: change.occurredAt,
    task: task
      ? { id: task.id, status: task.status, updatedAt: task.updatedAt }
      : null,
    config,
  });

  const dedupeKey =
    action.type === "update_task"
      ? buildWebhookDedupeKey({
          dealId: change.dealId,
          eventId: change.eventId,
          targetStatus: action.toStatus,
        })
      : null;

  // Build audit entry
  const audit = buildAuditEntry({
    action,
    direction: "inbound",
    dealId: change.dealId,
    dealStage: change.newStage,
    eventId: change.eventId,
    dedupeKey,
    config,
  });
  auditLog.push(audit);

  if (action.type !== "update_task") {
    onSkipped();
    return;
  }

  // Check idempotency
  if (dedupeKey) {
    const existing = await prisma.integrationReceipt.findUnique({
      where: { dedupeKey },
    });
    if (existing) {
      onSkipped();
      return;
    }
  }

  // Apply the update in a transaction
  await prisma.$transaction(async (tx) => {
    if (dedupeKey) {
      await tx.integrationReceipt.create({
        data: {
          ruleId,
          dedupeKey,
          externalObjectType: "hubspot_webhook_deal_to_task",
          externalObjectId: `${change.dealId}:${action.taskId}`,
          sourceUrl: `https://app.hubspot.com/contacts/record/0-3/${change.dealId}`,
          taskId: action.taskId,
          lastObservedAt: change.occurredAt,
          metadata: {
            direction: "inbound_webhook",
            fromStatus: action.fromStatus,
            toStatus: action.toStatus,
            fromStage: change.newStage,
            changeSource: change.changeSource,
            eventId: change.eventId,
          },
        },
      });
    }

    const nextColumnOrder = await getNextColumnOrder(
      tx as unknown as typeof prisma,
      action.toStatus
    );

    await tx.task.update({
      where: { id: action.taskId },
      data: {
        status: action.toStatus,
        columnOrder: nextColumnOrder,
        completedOn:
          action.toStatus === "DONE"
            ? task?.completedOn ?? new Date()
            : task?.completedOn ?? null,
        statusHistory: {
          create: {
            fromStatus: action.fromStatus,
            toStatus: action.toStatus,
            changedBy: userId,
          },
        },
        metadata: {
          integration: {
            provider: "hubspot",
            externalId: change.dealId,
            externalObjectType: "hubspot_deal",
            ruleId,
            sourceUrl: `https://app.hubspot.com/contacts/record/0-3/${change.dealId}`,
            lastObservedAt: change.occurredAt.toISOString(),
            dedupeKey,
            direction: "inbound_webhook",
          },
        },
      },
    });

    await publishDomainEvent(
      {
        eventType: "integration.hubspot.bidirectional.webhook_deal_to_task_applied",
        aggregateType: "integration_rule",
        aggregateId: ruleId,
        payload: {
          dealId: change.dealId,
          taskId: action.taskId,
          fromStatus: action.fromStatus,
          toStatus: action.toStatus,
          eventId: change.eventId,
          changeSource: change.changeSource,
        } as unknown as Prisma.InputJsonValue,
        idempotencyKey: buildOutboxIdempotencyKey({
          aggregateType: "integration_rule",
          aggregateId: ruleId,
          eventType: `hubspot_webhook_${change.dealId}_${action.taskId}_${action.toStatus}`,
        }),
      },
      tx as unknown as Parameters<typeof publishDomainEvent>[1]
    );
  });

  onApplied();
}
