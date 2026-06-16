/**
 * Delivery handler for `customer_success.outreach.send` outbox events.
 *
 * The producer (sendCustomerSuccessOutreach) records the message QUEUED and
 * emits the event; this handler performs the actual send and flips the message
 * to SENT. Gated behind CS_OUTREACH_SENDING_ENABLED (default OFF) so the
 * capability can ship before sends are turned on.
 */
import type { OutboxEvent } from "@/generated/prisma/client";
import {
  CustomerSuccessOutreachChannel,
  CustomerSuccessOutreachStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendGmailMessage } from "@/lib/integrations/gmail-send";
import { sendSlackChannelMessage } from "@/lib/integrations/slack-notifications";

export class OutreachSendingDisabledError extends Error {
  constructor() {
    super(
      "customer-success outreach sending is disabled (set CS_OUTREACH_SENDING_ENABLED=true to enable delivery)"
    );
    this.name = "OutreachSendingDisabledError";
  }
}

/** Whether real outreach delivery is enabled. Default OFF. */
export function isOutreachSendingEnabled(): boolean {
  const flag = process.env.CS_OUTREACH_SENDING_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

const ELIGIBLE_STATUSES = [
  CustomerSuccessOutreachStatus.QUEUED,
  CustomerSuccessOutreachStatus.FAILED,
];

function outreachSubject(subject: string | null): string {
  const trimmed = subject?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "A message from your account team";
}

export async function dispatchCustomerSuccessOutreach(
  event: OutboxEvent
): Promise<void> {
  // Default-OFF gate. Throw (not no-op) so the event stays recoverable: it
  // dead-letters visibly and can be replayed once the flag is enabled, instead
  // of being marked DISPATCHED while the message is silently never sent.
  if (!isOutreachSendingEnabled()) {
    throw new OutreachSendingDisabledError();
  }

  const messageId = event.aggregateId;
  const message = await prisma.customerSuccessOutreachMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      status: true,
      channel: true,
      recipientAddress: true,
      subject: true,
      body: true,
      authorUserId: true,
    },
  });

  if (!message) {
    throw new Error(`customer-success outreach message not found: ${messageId}`);
  }

  // Idempotency: SENT and CANCELED are terminal, so a redelivered event is a
  // no-op. QUEUED (first attempt) and FAILED (a prior attempt) are eligible.
  if (
    message.status === CustomerSuccessOutreachStatus.SENT ||
    message.status === CustomerSuccessOutreachStatus.CANCELED
  ) {
    return;
  }

  if (!message.authorUserId) {
    throw new Error(`outreach message ${message.id} has no author to send as`);
  }
  if (!message.recipientAddress) {
    throw new Error(`outreach message ${message.id} has no recipient address`);
  }

  try {
    let providerMessageId: string | null = null;

    if (message.channel === CustomerSuccessOutreachChannel.EMAIL) {
      const sent = await sendGmailMessage({
        userId: message.authorUserId,
        to: [message.recipientAddress],
        subject: outreachSubject(message.subject),
        body: message.body,
      });
      providerMessageId = sent.id;
    } else if (message.channel === CustomerSuccessOutreachChannel.SLACK) {
      // SLACK channel: recipientAddress holds the target Slack channel id.
      const subject = message.subject?.trim();
      const text = subject ? `*${subject}*\n\n${message.body}` : message.body;
      const sent = await sendSlackChannelMessage({
        userId: message.authorUserId,
        channelId: message.recipientAddress,
        text,
      });
      providerMessageId = sent.messageTs;
    } else {
      throw new Error(`unsupported outreach channel: ${message.channel}`);
    }

    // Mark SENT only while still eligible so a duplicate delivery can't
    // double-flip (dispatch is already serialized by the outbox advisory lock;
    // this is belt-and-suspenders). The send is at-least-once — a crash between
    // the send above and this update can re-deliver, which is acceptable here.
    await prisma.customerSuccessOutreachMessage.updateMany({
      where: { id: message.id, status: { in: ELIGIBLE_STATUSES } },
      data: {
        status: CustomerSuccessOutreachStatus.SENT,
        sentAt: new Date(),
        providerMessageId,
        error: null,
        failedAt: null,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Surface the failure on the message for the UI, then rethrow so the outbox
    // retries (FAILED stays eligible) and eventually dead-letters if it can't.
    await prisma.customerSuccessOutreachMessage.updateMany({
      where: { id: message.id, status: { in: ELIGIBLE_STATUSES } },
      data: {
        status: CustomerSuccessOutreachStatus.FAILED,
        failedAt: new Date(),
        error: reason.slice(0, 1000),
      },
    });
    throw error;
  }
}
