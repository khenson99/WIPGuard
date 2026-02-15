import { describe, expect, it } from "vitest";
import {
  buildSlackCaptureDedupeKey,
  defaultSlackThreadCaptureConfig,
} from "@/lib/integrations/slack-thread-capture";

describe("slack-thread-capture helpers", () => {
  it("returns default config", () => {
    expect(defaultSlackThreadCaptureConfig()).toEqual({
      triggerReactions: ["white_check_mark", "pushpin", "bookmark"],
      allowShortcutTrigger: true,
    });
  });

  it("builds canonical dedupe keys", () => {
    const key = buildSlackCaptureDedupeKey({
      channelId: "C123",
      threadTs: "1739470000.123456",
      triggerType: "reaction",
      triggerValue: "white_check_mark",
    });

    expect(key).toBe(
      "slack:slack_thread:C123:1739470000.123456:reaction:white_check_mark"
    );
  });
});
