import type { OutboxEvent } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sendSlackDirectMessage,
  sendSlackNotification,
} from "@/lib/integrations/slack-notifications";

interface SlackNotifyPayload {
  message?: string;
  nodeKey?: string;
}

interface VisitorFunnelSlackAlertPayload {
  alertId?: string;
  bucketStart?: string;
  channelId?: string;
  kind?: string;
  message?: string;
  ownerUserId?: string;
  provider?: string;
  providerLabel?: string;
  severity?: string;
  title?: string;
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

async function dispatchVisitorFunnelSlackAlert(event: OutboxEvent): Promise<void> {
  const payload = event.payload as VisitorFunnelSlackAlertPayload | null;
  const ownerUserId = typeof payload?.ownerUserId === "string" ? payload.ownerUserId.trim() : "";
  const channelId = typeof payload?.channelId === "string" ? payload.channelId.trim() : "";
  const alertId = typeof payload?.alertId === "string" ? payload.alertId.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!ownerUserId || !channelId || !alertId || !title || !message) {
    throw new Error("visitor_funnel.enrichment.slack_alert missing ownerUserId, channelId, alertId, title, or message");
  }

  await sendSlackNotification({
    userId: ownerUserId,
    payload: {
      type: "ops_alert",
      alertId,
      title,
      channelId,
      context: {
        bucketStart: typeof payload?.bucketStart === "string" ? payload.bucketStart : "",
        kind: typeof payload?.kind === "string" ? payload.kind : "",
        provider: typeof payload?.providerLabel === "string" ? payload.providerLabel : "",
        reason: message,
        severity: typeof payload?.severity === "string" ? payload.severity : "",
      },
    },
  });
}

export async function dispatchOutboxEvent(event: OutboxEvent): Promise<void> {
  switch (event.eventType) {
    case "automation.slack.notify":
      await dispatchAutomationSlackNotify(event);
      return;
    case "visitor_funnel.enrichment.slack_alert":
      await dispatchVisitorFunnelSlackAlert(event);
      return;
    case "customer_success.outreach.send":
      // No delivery handler is implemented yet. The producer
      // (sendCustomerSuccessOutreach) creates the message with status QUEUED and
      // relies SOLELY on this event to deliver it, so a silent no-op here would
      // mark the event DISPATCHED while the customer is never actually contacted
      // — a lost write that looks successful. Fail loudly so it surfaces in the
      // dead-letter queue (/api/events/dead-letter) instead. Implement real
      // delivery (email/Slack per `channel`) before relying on this path.
      throw new Error(
        "no dispatcher implemented for customer_success.outreach.send: outreach is recorded QUEUED but never delivered"
      );
    default:
      // Domain events recorded for the event log / replay only — no active side
      // effect to dispatch. IMPORTANT: any event that requires delivery (a
      // notification, an outbound message, a webhook) MUST get an explicit
      // `case` above. Otherwise it silently no-ops here and is marked DISPATCHED
      // without ever running. For known-deliverable types prefer throwing (see
      // customer_success.outreach.send above) so the gap is visible.
      return;
  }
}
