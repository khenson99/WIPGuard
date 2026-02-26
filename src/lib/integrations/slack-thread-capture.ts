import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { withRetries } from "@/lib/integrations/with-retries";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { getNextColumnOrder } from "@/lib/task-order";

export const SLACK_RULE_KEY = "slack_thread_capture";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface SlackThreadCaptureConfig {
  triggerReactions: string[];
  allowShortcutTrigger: boolean;
}

interface SlackCaptureCheckpoint {
  lastCapturedAt?: string;
  lastExternalId?: string;
}

export interface SlackCaptureRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: SlackThreadCaptureConfig;
  checkpoint: SlackCaptureCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface SlackRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<SlackThreadCaptureConfig>;
}

export interface SlackCaptureInput {
  triggerType: "reaction" | "shortcut";
  channelId: string;
  threadTs: string;
  messageTs?: string;
  reaction?: string;
  text?: string;
  title?: string;
}

export interface SlackCaptureResult {
  ruleId: string;
  captured: boolean;
  deduped: boolean;
  taskId: string | null;
  sourceUrl: string;
  externalId: string;
}

interface SlackMessage {
  user?: string;
  text?: string;
  ts?: string;
}

class SlackIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackIntegrationAuthError";
  }
}

export function defaultSlackThreadCaptureConfig(): SlackThreadCaptureConfig {
  return {
    triggerReactions: ["white_check_mark", "pushpin", "bookmark"],
    allowShortcutTrigger: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): SlackThreadCaptureConfig {
  const input = asRecord(raw);
  const fallback = defaultSlackThreadCaptureConfig();

  const triggerReactions = Array.isArray(input.triggerReactions)
    ? input.triggerReactions
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().replace(/^:+|:+$/g, ""))
    : fallback.triggerReactions;

  const allowShortcutTrigger =
    typeof input.allowShortcutTrigger === "boolean"
      ? input.allowShortcutTrigger
      : fallback.allowShortcutTrigger;

  return {
    triggerReactions: triggerReactions.length > 0 ? triggerReactions : fallback.triggerReactions,
    allowShortcutTrigger,
  };
}

function normalizeCheckpoint(raw: unknown): SlackCaptureCheckpoint {
  const input = asRecord(raw);
  const checkpoint: SlackCaptureCheckpoint = {};

  if (typeof input.lastCapturedAt === "string" && input.lastCapturedAt.length > 0) {
    checkpoint.lastCapturedAt = input.lastCapturedAt;
  }
  if (typeof input.lastExternalId === "string" && input.lastExternalId.length > 0) {
    checkpoint.lastExternalId = input.lastExternalId;
  }

  return checkpoint;
}

function toSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus {
  if (value === "ACTIVE" || value === "NOT_DONE") {
    return value;
  }
  return "QUEUED";
}

function toOptionalSupportedStatus(
  value: TaskStatus | null | undefined
): SupportedAutoTaskStatus | null {
  if (!value) return null;
  return toSupportedStatus(value);
}

function buildSlackExternalId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function buildSlackCaptureDedupeKey(input: {
  channelId: string;
  threadTs: string;
  triggerType: "reaction" | "shortcut";
  triggerValue?: string;
}): string {
  const triggerPart = input.triggerValue ? `${input.triggerType}:${input.triggerValue}` : input.triggerType;
  return [
    "slack",
    "slack_thread",
    buildSlackExternalId(input.channelId, input.threadTs),
    triggerPart,
  ].join(":");
}

function buildSlackThreadUrl(workspaceUrl: string | null, channelId: string, threadTs: string): string {
  const sanitized = workspaceUrl?.replace(/\/+$/, "") ?? "https://app.slack.com/client";
  const messageId = threadTs.replace(".", "");

  if (sanitized.startsWith("https://app.slack.com/client")) {
    return `${sanitized}/${channelId}/thread/${channelId}-${messageId}`;
  }

  return `${sanitized}/archives/${channelId}/p${messageId}`;
}


async function markConnectionError(userId: string, message: string): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: IntegrationProvider.SLACK,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

async function getSlackConnection(userId: string): Promise<IntegrationConnection> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.SLACK,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new SlackIntegrationAuthError("Slack is not connected");
  }

  return connection;
}

async function getSlackAuthContext(userId: string): Promise<{ token: string; workspaceUrl: string | null }> {
  const connection = await getSlackConnection(userId);
  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new SlackIntegrationAuthError("Slack access token is missing");
  }

  const metadata = asRecord(connection.metadata);
  const workspaceUrl = typeof metadata.url === "string" ? metadata.url : null;

  return { token, workspaceUrl };
}

async function slackApiCall<T>(token: string, method: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new SlackIntegrationAuthError("Slack access token is invalid");
  }

  const payload = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !payload || payload.ok === false) {
    const errorMessage = payload?.error ?? `Slack API error (${response.status})`;
    throw new Error(errorMessage);
  }

  return payload;
}

async function fetchSlackThreadSummary(input: {
  token: string;
  channelId: string;
  threadTs: string;
}): Promise<{ rootText: string; rootUser: string | null; firstReplyText: string | null }> {
  const params = new URLSearchParams({
    channel: input.channelId,
    ts: input.threadTs,
    limit: "3",
    inclusive: "true",
  });

  const payload = await slackApiCall<{ messages?: SlackMessage[] }>(
    input.token,
    "conversations.replies",
    params
  );

  const root = payload.messages?.[0];
  const reply = payload.messages?.[1];

  return {
    rootText: root?.text?.trim() || "(No thread preview text available)",
    rootUser: root?.user ?? null,
    firstReplyText: reply?.text?.trim() || null,
  };
}

function shouldCaptureFromTrigger(
  config: SlackThreadCaptureConfig,
  triggerType: "reaction" | "shortcut",
  reaction?: string
): boolean {
  if (triggerType === "shortcut") {
    return config.allowShortcutTrigger;
  }

  const normalizedReaction = reaction?.trim().replace(/^:+|:+$/g, "");
  if (!normalizedReaction) return false;
  return config.triggerReactions.includes(normalizedReaction);
}

function buildTaskTitle(input: {
  threadTitle: string | null;
  triggerType: "reaction" | "shortcut";
}): string {
  const prefix = input.triggerType === "reaction" ? "Slack follow-up" : "Slack action";
  return input.threadTitle && input.threadTitle.trim().length > 0
    ? `[Slack] ${prefix}: ${input.threadTitle.trim()}`
    : `[Slack] ${prefix}`;
}

function buildTaskNotes(input: {
  sourceUrl: string;
  rootText: string;
  firstReplyText: string | null;
  triggerType: "reaction" | "shortcut";
  triggerValue?: string;
  channelId: string;
  threadTs: string;
}): string {
  const lines = [
    "Created from Slack thread capture",
    `Trigger: ${input.triggerType}${input.triggerValue ? ` (${input.triggerValue})` : ""}`,
    `Channel: ${input.channelId}`,
    `Thread TS: ${input.threadTs}`,
    `Source: ${input.sourceUrl}`,
    "",
    "Thread root:",
    input.rootText,
    input.firstReplyText ? "" : null,
    input.firstReplyText ? "First reply:" : null,
    input.firstReplyText ?? null,
  ].filter(Boolean);

  return lines.join("\n");
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  externalId: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.slack.thread_capture.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        externalId: input.externalId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:slack-thread:${input.ruleId}:${input.externalId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateSlackThreadCaptureRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.SLACK,
        key: SLACK_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.SLACK,
      key: SLACK_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultSlackThreadCaptureConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeSlackRuleState(rule: IntegrationRule): SlackCaptureRuleState {
  return {
    id: rule.id,
    key: rule.key,
    enabled: rule.enabled,
    statusOverride: toOptionalSupportedStatus(rule.statusOverride),
    config: normalizeConfig(rule.config),
    checkpoint: normalizeCheckpoint(rule.checkpoint),
    lastObservedAt: rule.lastObservedAt?.toISOString() ?? null,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastError: rule.lastError,
  };
}

export async function patchSlackRule(
  userId: string,
  patch: SlackRulePatch
): Promise<SlackCaptureRuleState> {
  const existing = await getOrCreateSlackThreadCaptureRule(userId);
  const baseConfig = normalizeConfig(existing.config);
  const nextConfig = patch.config
    ? normalizeConfig({ ...baseConfig, ...patch.config })
    : baseConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing.enabled,
      statusOverride:
        typeof patch.statusOverride === "undefined"
          ? existing.statusOverride
          : patch.statusOverride,
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeSlackRuleState(updated);
}

export async function captureSlackThreadToTask(input: {
  userId: string;
  payload: SlackCaptureInput;
}): Promise<SlackCaptureResult> {
  const rule = await getOrCreateSlackThreadCaptureRule(input.userId);
  const config = normalizeConfig(rule.config);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      captured: false,
      deduped: false,
      taskId: null,
      sourceUrl: "",
      externalId: buildSlackExternalId(input.payload.channelId, input.payload.threadTs),
    };
  }

  if (
    !shouldCaptureFromTrigger(config, input.payload.triggerType, input.payload.reaction)
  ) {
    return {
      ruleId: rule.id,
      captured: false,
      deduped: false,
      taskId: null,
      sourceUrl: "",
      externalId: buildSlackExternalId(input.payload.channelId, input.payload.threadTs),
    };
  }

  let token: string;
  let workspaceUrl: string | null;

  try {
    const authData = await getSlackAuthContext(input.userId);
    token = authData.token;
    workspaceUrl = authData.workspaceUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markConnectionError(input.userId, message);
    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        lastError: message,
      },
    });
    throw error;
  }

  const externalId = buildSlackExternalId(input.payload.channelId, input.payload.threadTs);
  const triggerValue =
    input.payload.triggerType === "reaction"
      ? input.payload.reaction?.trim().replace(/^:+|:+$/g, "")
      : "shortcut";

  const dedupeKey = buildSlackCaptureDedupeKey({
    channelId: input.payload.channelId,
    threadTs: input.payload.threadTs,
    triggerType: input.payload.triggerType,
    triggerValue,
  });

  const sourceUrl = buildSlackThreadUrl(
    workspaceUrl,
    input.payload.channelId,
    input.payload.threadTs
  );

  const status = toSupportedStatus(rule.statusOverride);

  try {
    const threadSummary = await withRetries(() =>
      fetchSlackThreadSummary({
        token,
        channelId: input.payload.channelId,
        threadTs: input.payload.threadTs,
      })
    );

    const taskTitle = buildTaskTitle({
      threadTitle: input.payload.title ?? threadSummary.rootText,
      triggerType: input.payload.triggerType,
    });

    const taskNotes = buildTaskNotes({
      sourceUrl,
      rootText: threadSummary.rootText,
      firstReplyText: threadSummary.firstReplyText,
      triggerType: input.payload.triggerType,
      triggerValue,
      channelId: input.payload.channelId,
      threadTs: input.payload.threadTs,
    });

    const createdTask = await withRetries(async () => {
      try {
        return await prisma.$transaction(async (transaction) => {
          const receipt = await transaction.integrationReceipt.create({
            data: {
              ruleId: rule.id,
              dedupeKey,
              externalObjectType: "slack_thread",
              externalObjectId: externalId,
              sourceUrl,
              lastObservedAt: new Date(),
              metadata: {
                triggerType: input.payload.triggerType,
                triggerValue,
                channelId: input.payload.channelId,
                threadTs: input.payload.threadTs,
                messageTs: input.payload.messageTs ?? null,
              },
            },
          });

          const nextColumnOrder = await getNextColumnOrder(
            transaction as unknown as typeof prisma,
            status
          );

          const task = await transaction.task.create({
            data: {
              title: taskTitle,
              notes: taskNotes,
              status,
              assignedOn: new Date(),
              columnOrder: nextColumnOrder,
              metadata: {
                integration: {
                  provider: "slack",
                  externalId,
                  externalObjectType: "slack_thread",
                  ruleId: rule.id,
                  sourceUrl,
                  lastObservedAt: new Date().toISOString(),
                  dedupeKey,
                },
              },
              slackThread: input.payload.threadTs,
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
            },
            select: {
              id: true,
            },
          });

          await transaction.integrationReceipt.update({
            where: { id: receipt.id },
            data: { taskId: task.id },
          });

          await publishDomainEvent(
            {
              eventType: "integration.slack.thread_task_created",
              aggregateType: "integration_rule",
              aggregateId: rule.id,
              payload: {
                ruleId: rule.id,
                taskId: task.id,
                externalId,
                sourceUrl,
              },
              idempotencyKey: buildOutboxIdempotencyKey({
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                eventType: `slack_thread_created_${externalId}`,
              }),
            },
            transaction
          );

          console.info("integration.slack.thread_capture.created", {
            provider: "slack",
            ruleId: rule.id,
            externalId,
            taskId: task.id,
          });

          return task;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return null;
        }
        throw error;
      }
    });

    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        checkpoint: {
          lastCapturedAt: new Date().toISOString(),
          lastExternalId: externalId,
        } as unknown as Prisma.InputJsonValue,
        lastObservedAt: new Date(),
        lastRunAt: new Date(),
        lastError: null,
      },
    });

    await prisma.integrationConnection.updateMany({
      where: {
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
      },
      data: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
        lastSyncedAt: new Date(),
      },
    });

    if (!createdTask) {
      console.info("integration.slack.thread_capture.deduped", {
        provider: "slack",
        ruleId: rule.id,
        externalId,
        dedupeKey,
      });

      return {
        ruleId: rule.id,
        captured: true,
        deduped: true,
        taskId: null,
        sourceUrl,
        externalId,
      };
    }

    return {
      ruleId: rule.id,
      captured: true,
      deduped: false,
      taskId: createdTask.id,
      sourceUrl,
      externalId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await recordDeadLetterFailure({
      ruleId: rule.id,
      externalId,
      error: message,
    });

    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        lastError: message,
      },
    });

    await prisma.integrationConnection.updateMany({
      where: {
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
      },
      data: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: message,
        lastSyncedAt: new Date(),
      },
    });

    console.error("integration.slack.thread_capture.failed", {
      provider: "slack",
      ruleId: rule.id,
      externalId,
      error: message,
    });

    throw error;
  }
}
