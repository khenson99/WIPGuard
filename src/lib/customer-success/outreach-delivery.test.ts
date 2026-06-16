import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OutboxEvent } from "@/generated/prisma/client";

const { mockFindUnique, mockUpdateMany, mockSendGmail, mockSendSlack } = vi.hoisted(
  () => ({
    mockFindUnique: vi.fn(),
    mockUpdateMany: vi.fn(),
    mockSendGmail: vi.fn(),
    mockSendSlack: vi.fn(),
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerSuccessOutreachMessage: {
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}));
vi.mock("@/lib/integrations/gmail-send", () => ({ sendGmailMessage: mockSendGmail }));
vi.mock("@/lib/integrations/slack-notifications", () => ({
  sendSlackChannelMessage: mockSendSlack,
}));

import {
  dispatchCustomerSuccessOutreach,
  OutreachSendingDisabledError,
  isOutreachSendingEnabled,
} from "./outreach-delivery";

function makeEvent(): OutboxEvent {
  return {
    id: "evt-1",
    eventType: "customer_success.outreach.send",
    aggregateType: "customer_success_outreach_message",
    aggregateId: "msg-1",
    payload: {},
    status: "PENDING",
    retryCount: 0,
    nextAttemptAt: new Date(),
    dispatchedAt: null,
    lastAttemptAt: null,
    failedAt: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as OutboxEvent;
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    status: "QUEUED",
    channel: "EMAIL",
    recipientAddress: "customer@example.com",
    subject: "Quick check-in",
    body: "How are things going?",
    authorUserId: "user-1",
    ...overrides,
  };
}

describe("dispatchCustomerSuccessOutreach", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws (does not no-op) and touches nothing when sending is disabled", async () => {
    delete process.env.CS_OUTREACH_SENDING_ENABLED;
    await expect(dispatchCustomerSuccessOutreach(makeEvent())).rejects.toBeInstanceOf(
      OutreachSendingDisabledError
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockSendGmail).not.toHaveBeenCalled();
  });

  it("sends EMAIL as the author and marks the message SENT", async () => {
    process.env.CS_OUTREACH_SENDING_ENABLED = "true";
    mockFindUnique.mockResolvedValue(makeMessage({ channel: "EMAIL" }));
    mockSendGmail.mockResolvedValue({ id: "gmail-123" });

    await dispatchCustomerSuccessOutreach(makeEvent());

    expect(mockSendGmail).toHaveBeenCalledWith({
      userId: "user-1",
      to: ["customer@example.com"],
      subject: "Quick check-in",
      body: "How are things going?",
    });
    expect(mockSendSlack).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "msg-1" }),
        data: expect.objectContaining({ status: "SENT", providerMessageId: "gmail-123" }),
      })
    );
  });

  it("posts SLACK to the channel id in recipientAddress and marks SENT", async () => {
    process.env.CS_OUTREACH_SENDING_ENABLED = "1";
    mockFindUnique.mockResolvedValue(
      makeMessage({ channel: "SLACK", recipientAddress: "C0123", subject: "Heads up" })
    );
    mockSendSlack.mockResolvedValue({ channelId: "C0123", messageTs: "1700000000.1" });

    await dispatchCustomerSuccessOutreach(makeEvent());

    expect(mockSendSlack).toHaveBeenCalledWith({
      userId: "user-1",
      channelId: "C0123",
      text: "*Heads up*\n\nHow are things going?",
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", providerMessageId: "1700000000.1" }),
      })
    );
  });

  it("is idempotent: an already-SENT message is a no-op", async () => {
    process.env.CS_OUTREACH_SENDING_ENABLED = "true";
    mockFindUnique.mockResolvedValue(makeMessage({ status: "SENT" }));

    await dispatchCustomerSuccessOutreach(makeEvent());

    expect(mockSendGmail).not.toHaveBeenCalled();
    expect(mockSendSlack).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("marks the message FAILED and rethrows when the send fails", async () => {
    process.env.CS_OUTREACH_SENDING_ENABLED = "true";
    mockFindUnique.mockResolvedValue(makeMessage({ channel: "EMAIL" }));
    mockSendGmail.mockRejectedValue(new Error("gmail 403"));

    await expect(dispatchCustomerSuccessOutreach(makeEvent())).rejects.toThrow("gmail 403");

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", error: "gmail 403" }),
      })
    );
  });

  it("throws when the message has no author to send as", async () => {
    process.env.CS_OUTREACH_SENDING_ENABLED = "true";
    mockFindUnique.mockResolvedValue(makeMessage({ authorUserId: null }));

    await expect(dispatchCustomerSuccessOutreach(makeEvent())).rejects.toThrow(/no author/);
    expect(mockSendGmail).not.toHaveBeenCalled();
  });

  it("isOutreachSendingEnabled parses common truthy/falsy values", () => {
    for (const v of ["true", "1", "yes", "on", "TRUE"]) {
      process.env.CS_OUTREACH_SENDING_ENABLED = v;
      expect(isOutreachSendingEnabled()).toBe(true);
    }
    for (const v of ["false", "0", "no", "", "off"]) {
      process.env.CS_OUTREACH_SENDING_ENABLED = v;
      expect(isOutreachSendingEnabled()).toBe(false);
    }
    delete process.env.CS_OUTREACH_SENDING_ENABLED;
    expect(isOutreachSendingEnabled()).toBe(false);
  });
});
