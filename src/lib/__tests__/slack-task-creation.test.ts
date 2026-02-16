import { describe, expect, it } from "vitest";
import {
  buildSlackExternalId,
  buildSlackTaskDedupeKey,
  buildSlackThreadUrl,
} from "@/lib/integrations/slack-task-creation";

describe("slack-task-creation helpers", () => {
  // -----------------------------------------------------------------------
  // buildSlackExternalId
  // -----------------------------------------------------------------------

  describe("buildSlackExternalId", () => {
    it("concatenates channelId and threadTs", () => {
      expect(buildSlackExternalId("C123", "1739470000.123456")).toBe(
        "C123:1739470000.123456"
      );
    });

    it("handles different channel formats", () => {
      expect(buildSlackExternalId("D_DM_CHAN", "1234567890.000000")).toBe(
        "D_DM_CHAN:1234567890.000000"
      );
    });
  });

  // -----------------------------------------------------------------------
  // buildSlackTaskDedupeKey
  // -----------------------------------------------------------------------

  describe("buildSlackTaskDedupeKey", () => {
    it("builds key with trigger value (reaction)", () => {
      const key = buildSlackTaskDedupeKey({
        channelId: "C123",
        threadTs: "1739470000.123456",
        triggerType: "reaction",
        triggerValue: "pushpin",
      });

      expect(key).toBe(
        "slack:slack_task_create:C123:1739470000.123456:reaction:pushpin"
      );
    });

    it("builds key without trigger value (shortcut)", () => {
      const key = buildSlackTaskDedupeKey({
        channelId: "C456",
        threadTs: "1739470000.000000",
        triggerType: "shortcut",
      });

      expect(key).toBe(
        "slack:slack_task_create:C456:1739470000.000000:shortcut"
      );
    });

    it("builds key for slash_command trigger", () => {
      const key = buildSlackTaskDedupeKey({
        channelId: "C789",
        threadTs: "1234567890.000001",
        triggerType: "slash_command",
      });

      expect(key).toBe(
        "slack:slack_task_create:C789:1234567890.000001:slash_command"
      );
    });

    it("produces different keys for different reactions on same thread", () => {
      const base = {
        channelId: "C123",
        threadTs: "1739470000.123456",
        triggerType: "reaction" as const,
      };

      const key1 = buildSlackTaskDedupeKey({ ...base, triggerValue: "pushpin" });
      const key2 = buildSlackTaskDedupeKey({ ...base, triggerValue: "white_check_mark" });
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different channels on same timestamp", () => {
      const key1 = buildSlackTaskDedupeKey({
        channelId: "C111",
        threadTs: "1739470000.123456",
        triggerType: "reaction",
        triggerValue: "pushpin",
      });
      const key2 = buildSlackTaskDedupeKey({
        channelId: "C222",
        threadTs: "1739470000.123456",
        triggerType: "reaction",
        triggerValue: "pushpin",
      });
      expect(key1).not.toBe(key2);
    });
  });

  // -----------------------------------------------------------------------
  // buildSlackThreadUrl
  // -----------------------------------------------------------------------

  describe("buildSlackThreadUrl", () => {
    it("builds URL with custom workspace URL", () => {
      const url = buildSlackThreadUrl(
        "https://mycompany.slack.com",
        "C123",
        "1739470000.123456"
      );

      expect(url).toBe("https://mycompany.slack.com/archives/C123/p1739470000123456");
    });

    it("strips trailing slashes from workspace URL", () => {
      const url = buildSlackThreadUrl(
        "https://mycompany.slack.com///",
        "C123",
        "1739470000.123456"
      );

      expect(url).toBe("https://mycompany.slack.com/archives/C123/p1739470000123456");
    });

    it("falls back to app.slack.com when no workspace URL", () => {
      const url = buildSlackThreadUrl(null, "C123", "1739470000.123456");

      expect(url).toContain("app.slack.com");
      expect(url).toContain("C123");
    });

    it("uses thread format for app.slack.com URLs", () => {
      const url = buildSlackThreadUrl(
        "https://app.slack.com/client/T123",
        "C456",
        "1739470000.123456"
      );

      expect(url).toContain("/thread/");
      expect(url).toContain("C456");
    });

    it("removes dots from thread TS in URL", () => {
      const url = buildSlackThreadUrl(
        "https://mycompany.slack.com",
        "C123",
        "1739470000.123456"
      );

      // The dot should be removed from the URL path
      expect(url).not.toContain("1739470000.123456");
      expect(url).toContain("1739470000123456");
    });
  });
});
