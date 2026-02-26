/**
 * Slack Task Creation Service
 *
 * Creates WIPGuard tasks from Slack messages via:
 *  - Reaction triggers (e.g., :pushpin: on a message)
 *  - Slack shortcuts / slash commands
 *  - Webhook event payloads from Slack Event API
 *
 * Every created task includes full source traceability back to the
 * originating Slack message, channel, and user.
 */

import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { withRetries } from "@/lib/integrations/with-retries";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { getNextColumnOrder } from "@/lib/task-order";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlackTaskTrigger = "reaction" | "shortcut" | "slash_command" | "webhook";

export interface SlackTaskCreationInput {
  /** How the task creation was triggered */
  triggerType: SlackTaskTrigger;
  /** The Slack channel ID */
  channelId: string;
  /** Thread timestamp (root message ts) */
  threadTs: string;
  /** Message timestamp (for reactions, the message that was reacted to) */
  messageTs?: string;
  /** Reaction emoji name (for reaction triggers) */
  reaction?: string;
  /** Raw message text from Slack */
  text?: string;
  /** User-supplied title override */
  title?: string;
  /** Slack user ID of the person who triggered creation */
  slackUserId?: string;
  /** Optional project to associate the task with */
  projectId?: string;
  /** Optional priority assignment */
  priority?: "P0" | "P1" | "P2" | "P3";
}

export interface SlackTaskCreationResult {
  created: boolean;
  deduped: boolean;
  taskId: string | null;
  taskTitle: string;
  sourceUrl: string;
  externalId: string;
  triggerType: SlackTaskTrigger;
  sourceTraceability: SlackSourceTraceability;
}

export interface SlackSourceTraceability {
  provider: "slack";
  channelId: string;
  threadTs: string;
  messageTs: string | null;
  triggerType: SlackTaskTrigger;
  triggerValue: string | null;
  slackUserId: string | null;
  sourceUrl: string;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}


class SlackAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackAuthError";
  }
}

export function buildSlackExternalId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function buildSlackTaskDedupeKey(input: {
  channelId: string;
  threadTs: string;
  triggerType: SlackTaskTrigger;
  triggerValue?: string;
}): string {
  const triggerPart = input.triggerValue
    ? `${input.triggerType}:${input.triggerValue}`
    : input.triggerType;
  return [
    "slack",
    "slack_task_create",
    buildSlackExternalId(input.channelId, input.threadTs),
    triggerPart,
  ].join(":");
}

export function buildSlackThreadUrl(
  workspaceUrl: string | null,
  channelId: string,
  threadTs: string
): string {
  const sanitized = workspaceUrl?.replace(/\/+$/, "") ?? "https://app.slack.com/client";
  const messageId = threadTs.replace(".", "");

  if (sanitized.startsWith("https://app.slack.com/client")) {
    return `${sanitized}/${channelId}/thread/${channelId}-${messageId}`;
  }

  return `${sanitized}/archives/${channelId}/p${messageId}`;
}

function buildTaskTitle(input: {
  text?: string;
  title?: string;
  triggerType: SlackTaskTrigger;
}): string {
  if (input.title && input.title.trim().length > 0) {
    return `[Slack] ${input.title.trim()}`;
  }

  if (input.text && input.text.trim().length > 0) {
    // Truncate long messages for titles
    const cleaned = input.text.trim().replace(/\n/g, " ");
    const truncated = cleaned.length > 100 ? `${cleaned.slice(0, 97)}...` : cleaned;
    return `[Slack] ${truncated}`;
  }

  const triggerLabels: Record<SlackTaskTrigger, string> = {
    reaction: "Slack reaction task",
    shortcut: "Slack shortcut task",
    slash_command: "Slack command task",
    webhook: "Slack webhook task",
  };

  return `[Slack] ${triggerLabels[input.triggerType]}`;
}

function buildTaskNotes(input: {
  sourceUrl: string;
  text?: string;
  triggerType: SlackTaskTrigger;
  triggerValue?: string;
  channelId: string;
  threadTs: string;
  slackUserId?: string;
}): string {
  const lines = [
    "Created from Slack message",
    `Trigger: ${input.triggerType}${input.triggerValue ? ` (${input.triggerValue})` : ""}`,
    `Channel: ${input.channelId}`,
    `Thread TS: ${input.threadTs}`,
    input.slackUserId ? `Slack User: ${input.slackUserId}` : null,
    `Source: ${input.sourceUrl}`,
  ];

  if (input.text) {
    lines.push("", "Original message:", input.text);
  }

  return lines.filter((line) => line !== null).join("\n");
}

function toValidTaskStatus(): TaskStatus {
  // Default new Slack tasks to QUEUED status
  return "QUEUED";
}

// ---------------------------------------------------------------------------
// Slack API - fetch message details
// ---------------------------------------------------------------------------

interface SlackMessageInfo {
  text: string;
  user: string | null;
  ts: string;
}

async function fetchSlackMessage(input: {
  token: string;
  channelId: string;
  messageTs: string;
}): Promise<SlackMessageInfo> {
  const params = new URLSearchParams({
    channel: input.channelId,
    latest: input.messageTs,
    inclusive: "true",
    limit: "1",
  });

  const response = await fetch(
    `https://slack.com/api/conversations.history?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store",
    }
  );

  if (response.status === 401) {
    throw new SlackAuthError("Slack access token is invalid");
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        messages?: Array<{ text?: string; user?: string; ts?: string }>;
      }
    | null;

  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(payload?.error ?? `Slack API error (${response.status})`);
  }

  const message = payload.messages?.[0];
  return {
    text: message?.text?.trim() || "(No message text)",
    user: message?.user ?? null,
    ts: message?.ts ?? input.messageTs,
  };
}

// ---------------------------------------------------------------------------
// Main task creation function
// ---------------------------------------------------------------------------

export async function createTaskFromSlack(input: {
  userId: string;
  payload: SlackTaskCreationInput;
}): Promise<SlackTaskCreationResult> {
  const { payload } = input;

  // 1. Get Slack auth context
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new SlackAuthError("Slack is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new SlackAuthError("Slack access token is missing");
  }

  const metadata = asRecord(connection.metadata);
  const workspaceUrl = typeof metadata.url === "string" ? metadata.url : null;

  // 2. Build identifiers
  const externalId = buildSlackExternalId(payload.channelId, payload.threadTs);
  const triggerValue =
    payload.triggerType === "reaction"
      ? payload.reaction?.trim().replace(/^:+|:+$/g, "")
      : payload.triggerType;

  const dedupeKey = buildSlackTaskDedupeKey({
    channelId: payload.channelId,
    threadTs: payload.threadTs,
    triggerType: payload.triggerType,
    triggerValue,
  });

  const sourceUrl = buildSlackThreadUrl(workspaceUrl, payload.channelId, payload.threadTs);

  // 3. Optionally fetch message details from Slack
  let messageText = payload.text;
  if (!messageText && payload.messageTs) {
    try {
      const messageInfo = await withRetries(() =>
        fetchSlackMessage({
          token,
          channelId: payload.channelId,
          messageTs: payload.messageTs!,
        })
      );
      messageText = messageInfo.text;
    } catch {
      // Non-fatal: we can still create the task without message text
      messageText = undefined;
    }
  }

  // 4. Build task data
  const taskTitle = buildTaskTitle({
    text: messageText,
    title: payload.title,
    triggerType: payload.triggerType,
  });

  const taskNotes = buildTaskNotes({
    sourceUrl,
    text: messageText,
    triggerType: payload.triggerType,
    triggerValue,
    channelId: payload.channelId,
    threadTs: payload.threadTs,
    slackUserId: payload.slackUserId,
  });

  const status = toValidTaskStatus();

  const sourceTraceability: SlackSourceTraceability = {
    provider: "slack",
    channelId: payload.channelId,
    threadTs: payload.threadTs,
    messageTs: payload.messageTs ?? null,
    triggerType: payload.triggerType,
    triggerValue: triggerValue ?? null,
    slackUserId: payload.slackUserId ?? null,
    sourceUrl,
    capturedAt: new Date().toISOString(),
  };

  // 5. Create task in transaction with dedupe
  try {
    const createdTask = await withRetries(async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          // Create receipt for deduplication
          await tx.integrationReceipt.create({
            data: {
              ruleId: "slack-task-creation", // Virtual rule ID for direct task creation
              dedupeKey,
              externalObjectType: "slack_message",
              externalObjectId: externalId,
              sourceUrl,
              lastObservedAt: new Date(),
              metadata: sourceTraceability as unknown as Prisma.InputJsonValue,
            },
          });

          const nextColumnOrder = await getNextColumnOrder(
            tx as unknown as typeof prisma,
            status
          );

          const taskData: Prisma.TaskCreateInput = {
            title: taskTitle,
            notes: taskNotes,
            status,
            assignedOn: new Date(),
            columnOrder: nextColumnOrder,
            slackThread: payload.threadTs,
            metadata: {
              integration: {
                provider: "slack",
                externalId,
                externalObjectType: "slack_message",
                sourceUrl,
                sourceTraceability,
                dedupeKey,
                lastObservedAt: new Date().toISOString(),
              },
            } as unknown as Prisma.InputJsonValue,
            responsible: {
              connect: [{ id: input.userId }],
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: status,
                changedBy: input.userId,
              },
            },
          };

          // Optionally link to project
          if (payload.projectId) {
            taskData.project = { connect: { id: payload.projectId } };
          }

          // Optionally set priority
          if (payload.priority) {
            taskData.priority = payload.priority;
          }

          const task = await tx.task.create({
            data: taskData,
            select: { id: true, title: true },
          });

          // Update receipt with task ID
          await tx.integrationReceipt.updateMany({
            where: { dedupeKey },
            data: { taskId: task.id },
          });

          // Publish domain event
          await publishDomainEvent(
            {
              eventType: "integration.slack.task_created",
              aggregateType: "task",
              aggregateId: task.id,
              payload: {
                taskId: task.id,
                externalId,
                sourceUrl,
                triggerType: payload.triggerType,
                channelId: payload.channelId,
              },
              idempotencyKey: buildOutboxIdempotencyKey({
                aggregateType: "task",
                aggregateId: task.id,
                eventType: `slack_task_created_${externalId}`,
              }),
            },
            tx
          );

          console.info("integration.slack.task_creation.created", {
            provider: "slack",
            taskId: task.id,
            externalId,
            triggerType: payload.triggerType,
            channelId: payload.channelId,
          });

          return task;
        });
      } catch (error) {
        // Dedupe: receipt already exists for this channel:thread:trigger combo
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return null;
        }
        throw error;
      }
    });

    if (!createdTask) {
      console.info("integration.slack.task_creation.deduped", {
        provider: "slack",
        externalId,
        dedupeKey,
      });

      return {
        created: false,
        deduped: true,
        taskId: null,
        taskTitle,
        sourceUrl,
        externalId,
        triggerType: payload.triggerType,
        sourceTraceability,
      };
    }

    return {
      created: true,
      deduped: false,
      taskId: createdTask.id,
      taskTitle: createdTask.title,
      sourceUrl,
      externalId,
      triggerType: payload.triggerType,
      sourceTraceability,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Dead letter for failed creation
    await prisma.outboxEvent.create({
      data: {
        eventType: "integration.slack.task_creation.failed",
        aggregateType: "integration_connection",
        aggregateId: connection.id,
        schemaVersion: 1,
        payload: {
          externalId,
          channelId: payload.channelId,
          triggerType: payload.triggerType,
          error: message,
        },
        idempotencyKey: `dead-letter:slack-task-create:${dedupeKey}:${Date.now()}`,
        status: "DEAD_LETTER",
        retryCount: 0,
        nextAttemptAt: new Date(),
        failedAt: new Date(),
        error: message,
        lastAttemptAt: new Date(),
      },
    });

    console.error("integration.slack.task_creation.failed", {
      provider: "slack",
      externalId,
      error: message,
    });

    throw error;
  }
}
