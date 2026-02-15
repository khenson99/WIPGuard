import { describe, expect, it } from "vitest";
import {
  buildSlackUnansweredDedupeKey,
  defaultSlackUnansweredConfig,
} from "@/lib/integrations/slack-unanswered-requests";

describe("slack-unanswered-requests helpers", () => {
  it("returns default unanswered-request config", () => {
    const config = defaultSlackUnansweredConfig();

    expect(config.channelIds).toEqual([]);
    expect(config.slaMinutes).toBe(120);
    expect(config.maxMessagesPerChannel).toBe(100);
    expect(config.triageDueMinutes).toBe(60);
    expect(config.assigneeUserId).toBeNull();
  });

  it("builds canonical dedupe key", () => {
    const key = buildSlackUnansweredDedupeKey({
      channelId: "C123",
      threadTs: "1711111111.123456",
      slaMinutes: 120,
    });

    expect(key).toBe("slack:slack_unanswered_request:C123:1711111111.123456:sla-120");
  });
});
