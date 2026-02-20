import type { OutboxEvent } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendSlackDirectMessage } from "@/lib/integrations/slack-notifications";

interface SlackNotifyPayload {
  message?: string;
  nodeKey?: string;
}

async function dispatchAutomationSlackNotify(event: OutboxEvent): Promise<void> {
  const payload = event.payload as SlackNotifyPayload | null;
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!message) {
    throw new Error("automation.slack.notify missing message");
  }

  const run = await prisma.workflowRun.findUnique({
    where: { id: event.aggregateId },
    select: {
      requestedById: true,
      workflow: { select: { ownerId: true } },
    },
  });

  if (!run) {
    throw new Error("workflow run not found");
  }

  const userId = run.requestedById ?? run.workflow.ownerId;

  await sendSlackDirectMessage({
    userId,
    message,
  });
}

export async function dispatchOutboxEvent(event: OutboxEvent): Promise<void> {
  switch (event.eventType) {
    case "automation.slack.notify":
      await dispatchAutomationSlackNotify(event);
      return;
    default:
      // No-op for events that are recorded for telemetry only.
      return;
  }
}
