import { describe, it, expect } from "vitest";

// ─── Contract types for Slack adapter ────────────────────────────────

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

interface SlackThreadCaptureConfig {
  triggerReactions: string[];
  allowShortcutTrigger: boolean;
}

interface SlackCaptureCheckpoint {
  lastCapturedAt?: string;
  lastExternalId?: string;
}

interface SlackCaptureRuleState {
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

interface SlackCaptureInput {
  triggerType: "reaction" | "shortcut";
  channelId: string;
  threadTs: string;
  messageTs?: string;
  reaction?: string;
  text?: string;
  title?: string;
}

interface SlackCaptureResult {
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

// ─── Factory helpers ─────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<SlackThreadCaptureConfig> = {},
): SlackThreadCaptureConfig {
  return {
    triggerReactions: ["white_check_mark", "ticket"],
    allowShortcutTrigger: true,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<SlackCaptureInput> = {},
): SlackCaptureInput {
  return {
    triggerType: "reaction",
    channelId: "C0123456789",
    threadTs: "1707000000.000100",
    messageTs: "1707000000.000200",
    reaction: "white_check_mark",
    text: "We need to fix the login flow",
    title: "Fix login flow",
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<SlackCaptureResult> = {},
): SlackCaptureResult {
  return {
    ruleId: "rule-slack-001",
    captured: true,
    deduped: false,
    taskId: "task-abc-123",
    sourceUrl: "https://myworkspace.slack.com/archives/C0123456789/p1707000000000100",
    externalId: "C0123456789:1707000000.000100",
    ...overrides,
  };
}

function makeRuleState(
  overrides: Partial<SlackCaptureRuleState> = {},
): SlackCaptureRuleState {
  return {
    id: "rule-slack-001",
    key: "slack_thread_capture",
    enabled: true,
    statusOverride: null,
    config: makeConfig(),
    checkpoint: {},
    lastObservedAt: null,
    lastRunAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<SlackMessage> = {},
): SlackMessage {
  return {
    user: "U0123456789",
    text: "We need to fix the login flow",
    ts: "1707000000.000100",
    ...overrides,
  };
}

// ─── Contract Tests ──────────────────────────────────────────────────

describe("Slack Adapter Contract Tests", () => {
  describe("capture input shape — reaction trigger", () => {
    it("validates a reaction-triggered input has required fields", () => {
      const input = makeInput({ triggerType: "reaction" });

      expect(input.triggerType).toBe("reaction");
      expect(input.channelId).toEqual(expect.any(String));
      expect(input.threadTs).toEqual(expect.any(String));
      expect(input.reaction).toEqual(expect.any(String));
    });

    it("validates channelId matches Slack channel ID format", () => {
      const input = makeInput();
      expect(input.channelId).toMatch(/^C[A-Z0-9]+$/);
    });

    it("validates threadTs matches Slack timestamp format", () => {
      const input = makeInput();
      expect(input.threadTs).toMatch(/^\d+\.\d+$/);
    });

    it("allows optional title for custom task naming", () => {
      const input = makeInput({ title: "Custom task title" });
      expect(input.title).toBe("Custom task title");
    });
  });

  describe("capture input shape — shortcut trigger", () => {
    it("validates a shortcut-triggered input omits reaction", () => {
      const input = makeInput({
        triggerType: "shortcut",
        reaction: undefined,
      });

      expect(input.triggerType).toBe("shortcut");
      expect(input.reaction).toBeUndefined();
    });

    it("validates shortcut trigger still requires channelId and threadTs", () => {
      const input = makeInput({ triggerType: "shortcut" });

      expect(input.channelId).toBeTruthy();
      expect(input.threadTs).toBeTruthy();
    });
  });

  describe("capture result shape", () => {
    it("validates a successful capture result", () => {
      const result = makeResult();

      expect(result.ruleId).toEqual(expect.any(String));
      expect(result.captured).toBe(true);
      expect(result.deduped).toBe(false);
      expect(result.taskId).toEqual(expect.any(String));
      expect(result.sourceUrl).toEqual(expect.any(String));
      expect(result.externalId).toEqual(expect.any(String));
    });

    it("validates a deduped result has taskId null and captured false", () => {
      const result = makeResult({
        captured: false,
        deduped: true,
        taskId: null,
      });

      expect(result.captured).toBe(false);
      expect(result.deduped).toBe(true);
      expect(result.taskId).toBeNull();
    });

    it("validates sourceUrl points to Slack message", () => {
      const result = makeResult();
      expect(result.sourceUrl).toMatch(/^https:\/\/.*\.slack\.com\/archives\//);
    });
  });

  describe("thread linking — dedupe key and external ID", () => {
    it("builds externalId from channelId:threadTs", () => {
      const input = makeInput({
        channelId: "C0123456789",
        threadTs: "1707000000.000100",
      });
      const externalId = `${input.channelId}:${input.threadTs}`;
      expect(externalId).toBe("C0123456789:1707000000.000100");
    });

    it("builds dedupe key in canonical format", () => {
      const key = `slack:slack_thread_capture:C0123456789:1707000000.000100`;
      expect(key).toMatch(/^slack:slack_thread_capture:[^:]+:[^:]+$/);
    });

    it("builds source URL from workspace, channel, and thread", () => {
      const workspace = "myworkspace";
      const channelId = "C0123456789";
      const threadTs = "1707000000.000100";
      const tsForUrl = threadTs.replace(".", "");
      const sourceUrl = `https://${workspace}.slack.com/archives/${channelId}/p${tsForUrl}`;
      expect(sourceUrl).toContain(channelId);
      expect(sourceUrl).toMatch(/\/p\d+$/);
    });
  });

  describe("message format", () => {
    it("validates a well-formed Slack message", () => {
      const msg = makeMessage();

      expect(msg.user).toEqual(expect.any(String));
      expect(msg.text).toEqual(expect.any(String));
      expect(msg.ts).toEqual(expect.any(String));
    });

    it("handles messages with missing optional fields", () => {
      const msg: SlackMessage = {};
      expect(msg.user).toBeUndefined();
      expect(msg.text).toBeUndefined();
      expect(msg.ts).toBeUndefined();
    });

    it("validates user ID matches Slack user ID format", () => {
      const msg = makeMessage();
      expect(msg.user).toMatch(/^U[A-Z0-9]+$/);
    });
  });

  describe("rule state shape", () => {
    it("validates a well-formed rule state", () => {
      const state = makeRuleState();

      expect(state.id).toEqual(expect.any(String));
      expect(state.key).toBe("slack_thread_capture");
      expect(state.enabled).toBe(true);
      expect(state.config.triggerReactions).toEqual(expect.any(Array));
      expect(state.config.allowShortcutTrigger).toEqual(expect.any(Boolean));
    });

    it("validates statusOverride is null or a supported auto status", () => {
      const validOverrides: Array<SupportedAutoTaskStatus | null> = [
        null,
        "QUEUED",
        "ACTIVE",
        "NOT_DONE",
      ];

      for (const override of validOverrides) {
        const state = makeRuleState({ statusOverride: override });
        if (override === null) {
          expect(state.statusOverride).toBeNull();
        } else {
          expect(["QUEUED", "ACTIVE", "NOT_DONE"]).toContain(state.statusOverride);
        }
      }
    });

    it("validates checkpoint is initially empty", () => {
      const state = makeRuleState();
      expect(state.checkpoint).toEqual({});
    });

    it("validates checkpoint tracks last captured data", () => {
      const state = makeRuleState({
        checkpoint: {
          lastCapturedAt: "2026-02-16T10:00:00.000Z",
          lastExternalId: "C0123456789:1707000000.000100",
        },
      });
      expect(state.checkpoint.lastCapturedAt).toEqual(expect.any(String));
      expect(state.checkpoint.lastExternalId).toEqual(expect.any(String));
    });
  });
});
