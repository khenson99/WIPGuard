import { describe, expect, it, beforeEach } from "vitest";
import {
  shouldThrottle,
  recordSend,
  resetThrottleState,
  getThrottleEntry,
  renderNotificationMessage,
  buildNotificationDedupeKey,
  defaultThrottleConfig,
  type SlackNotificationPayload,
  type ThrottleConfig,
} from "@/lib/integrations/slack-notifications";

describe("slack-notifications helpers", () => {
  beforeEach(() => {
    resetThrottleState();
  });

  // -----------------------------------------------------------------------
  // defaultThrottleConfig
  // -----------------------------------------------------------------------

  describe("defaultThrottleConfig", () => {
    it("returns expected defaults", () => {
      expect(defaultThrottleConfig()).toEqual({
        windowMs: 60_000,
        maxBurst: 5,
        bypassTypes: ["blocked", "ops_alert"],
        minIntervalMs: 2_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // shouldThrottle
  // -----------------------------------------------------------------------

  describe("shouldThrottle", () => {
    const config: ThrottleConfig = {
      windowMs: 60_000,
      maxBurst: 3,
      bypassTypes: ["blocked", "ops_alert"],
      minIntervalMs: 1_000,
    };

    it("returns false when no prior sends exist", () => {
      const result = shouldThrottle("C123", "status_change", config);
      expect(result.throttled).toBe(false);
    });

    it("bypasses throttle for blocked notifications", () => {
      // Fill up the burst limit first
      const now = 1_000_000;
      for (let i = 0; i < 5; i++) {
        recordSend("C123", now + i * 100, config.windowMs);
      }

      const result = shouldThrottle("C123", "blocked", config, now + 600);
      expect(result.throttled).toBe(false);
    });

    it("bypasses throttle for ops alerts", () => {
      const now = 1_000_000;
      for (let i = 0; i < 5; i++) {
        recordSend("C123", now + i * 100, config.windowMs);
      }

      const result = shouldThrottle("C123", "ops_alert", config, now + 600);
      expect(result.throttled).toBe(false);
    });

    it("throttles when min interval not met", () => {
      const now = 1_000_000;
      recordSend("C123", now, config.windowMs);

      // 500ms later -- below the 1000ms minIntervalMs
      const result = shouldThrottle("C123", "status_change", config, now + 500);
      expect(result.throttled).toBe(true);
      expect(result.reason).toContain("min_interval");
    });

    it("does not throttle after min interval has passed", () => {
      const now = 1_000_000;
      recordSend("C123", now, config.windowMs);

      // 1500ms later -- above the 1000ms minIntervalMs
      const result = shouldThrottle("C123", "status_change", config, now + 1500);
      expect(result.throttled).toBe(false);
    });

    it("throttles when burst limit is reached", () => {
      const now = 1_000_000;
      // Send 3 messages (hitting burst limit)
      for (let i = 0; i < 3; i++) {
        recordSend("C123", now + i * 2000, config.windowMs);
      }

      // 3 seconds after last send -- min interval satisfied but burst exceeded
      const checkTime = now + 2 * 2000 + 3000;
      const result = shouldThrottle("C123", "assignment", config, checkTime);
      expect(result.throttled).toBe(true);
      expect(result.reason).toContain("burst_limit");
    });

    it("clears burst after window expires", () => {
      const now = 1_000_000;
      for (let i = 0; i < 3; i++) {
        recordSend("C123", now + i * 2000, config.windowMs);
      }

      // 61 seconds after first message -- all messages are outside window
      const result = shouldThrottle(
        "C123",
        "assignment",
        config,
        now + 61_000
      );
      expect(result.throttled).toBe(false);
    });

    it("tracks channels independently", () => {
      const now = 1_000_000;
      for (let i = 0; i < 3; i++) {
        recordSend("C_FULL", now + i * 2000, config.windowMs);
      }

      // C_FULL is burst-limited, C_EMPTY should not be
      const fullResult = shouldThrottle("C_FULL", "status_change", config, now + 10_000);
      const emptyResult = shouldThrottle("C_EMPTY", "status_change", config, now + 10_000);

      expect(fullResult.throttled).toBe(true);
      expect(emptyResult.throttled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // recordSend
  // -----------------------------------------------------------------------

  describe("recordSend", () => {
    it("creates a new entry for a channel", () => {
      recordSend("C_NEW", 1000, 60_000);
      const entry = getThrottleEntry("C_NEW");
      expect(entry).toBeDefined();
      expect(entry!.timestamps).toEqual([1000]);
      expect(entry!.lastSentAt).toBe(1000);
    });

    it("prunes timestamps outside the window", () => {
      recordSend("C_PRUNE", 1000, 5000);
      recordSend("C_PRUNE", 3000, 5000);
      recordSend("C_PRUNE", 7000, 5000); // Prunes anything < 2000

      const entry = getThrottleEntry("C_PRUNE");
      expect(entry!.timestamps).toEqual([3000, 7000]);
      expect(entry!.lastSentAt).toBe(7000);
    });
  });

  // -----------------------------------------------------------------------
  // renderNotificationMessage
  // -----------------------------------------------------------------------

  describe("renderNotificationMessage", () => {
    const base: SlackNotificationPayload = {
      type: "assignment",
      taskId: "task-1",
      taskTitle: "Implement feature X",
      channelId: "C123",
    };

    it("renders assignment message", () => {
      const msg = renderNotificationMessage({ ...base, type: "assignment" });
      expect(msg).toContain("Implement feature X");
      expect(msg).toContain("was assigned");
      expect(msg).toContain(":bust_in_silhouette:");
    });

    it("renders assignment with actor", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "assignment",
        actorName: "Kyle",
      });
      expect(msg).toContain("by Kyle");
    });

    it("renders assignment with project", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "assignment",
        projectName: "Alpha",
      });
      expect(msg).toContain("(Alpha)");
    });

    it("renders status_change with transition", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "status_change",
        context: { oldStatus: "QUEUED", newStatus: "ACTIVE" },
      });
      expect(msg).toContain("QUEUED -> ACTIVE");
      expect(msg).toContain(":arrows_counterclockwise:");
    });

    it("renders status_change without old status", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "status_change",
        context: { newStatus: "ACTIVE" },
      });
      expect(msg).toContain("ACTIVE");
      expect(msg).not.toContain("->");
    });

    it("renders blocked with reason", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "blocked",
        context: { reason: "Waiting on API keys" },
      });
      expect(msg).toContain("BLOCKED");
      expect(msg).toContain("Waiting on API keys");
      expect(msg).toContain(":octagonal_sign:");
    });

    it("renders unblocked message", () => {
      const msg = renderNotificationMessage({ ...base, type: "unblocked" });
      expect(msg).toContain("no longer blocked");
      expect(msg).toContain(":white_check_mark:");
    });

    it("renders mention with role", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "mention",
        context: { role: "accountable" },
      });
      expect(msg).toContain("accountable");
      expect(msg).toContain(":speech_balloon:");
    });

    it("renders mention with default role", () => {
      const msg = renderNotificationMessage({ ...base, type: "mention" });
      expect(msg).toContain("mentioned");
    });

    it("renders ops alert with severity, kind, and reason", () => {
      const msg = renderNotificationMessage({
        ...base,
        type: "ops_alert",
        taskTitle: "UNIFY enrichment is stale",
        context: {
          severity: "critical",
          kind: "stale",
          provider: "UNIFY",
          reason: "No enrichment signal received in 14 days.",
          bucketStart: "2026-03-08T00:00:00.000Z",
        },
      });

      expect(msg).toContain(":rotating_light:");
      expect(msg).toContain("CRITICAL");
      expect(msg).toContain("visitor funnel alert");
      expect(msg).toContain("Provider: UNIFY");
      expect(msg).toContain("Type: stale");
      expect(msg).toContain("No enrichment signal received in 14 days.");
    });
  });

  // -----------------------------------------------------------------------
  // buildNotificationDedupeKey
  // -----------------------------------------------------------------------

  describe("buildNotificationDedupeKey", () => {
    it("builds canonical key with thread", () => {
      const key = buildNotificationDedupeKey({
        type: "status_change",
        taskId: "task-1",
        taskTitle: "Test",
        channelId: "C123",
        threadTs: "1739470000.123456",
      });

      expect(key).toBe("slack:notification:C123:task-1:status_change:1739470000.123456");
    });

    it("builds canonical key without thread", () => {
      const key = buildNotificationDedupeKey({
        type: "blocked",
        taskId: "task-2",
        taskTitle: "Test",
        channelId: "C456",
      });

      expect(key).toBe("slack:notification:C456:task-2:blocked:no-thread");
    });

    it("produces unique keys for different types on same task/channel", () => {
      const base = {
        taskId: "task-1",
        taskTitle: "Test",
        channelId: "C123",
        threadTs: "1739470000.000000",
      };

      const key1 = buildNotificationDedupeKey({ ...base, type: "status_change" });
      const key2 = buildNotificationDedupeKey({ ...base, type: "blocked" });
      expect(key1).not.toBe(key2);
    });
  });
});
