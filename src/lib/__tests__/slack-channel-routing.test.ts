import { describe, expect, it, beforeEach } from "vitest";
import {
  policyMatches,
  resolveChannelForNotification,
  normalizeChannelRoutingConfig,
  defaultChannelRoutingConfig,
  clearChannelRoutingCache,
  type ChannelRoutingPolicy,
  type ChannelRoutingConfig,
  type ChannelRoutingContext,
} from "@/lib/integrations/slack-channel-routing";

describe("slack-channel-routing helpers", () => {
  beforeEach(() => {
    clearChannelRoutingCache();
  });

  // -----------------------------------------------------------------------
  // defaultChannelRoutingConfig
  // -----------------------------------------------------------------------

  describe("defaultChannelRoutingConfig", () => {
    it("returns expected defaults", () => {
      expect(defaultChannelRoutingConfig()).toEqual({
        policies: [],
        defaultChannelId: null,
        fallbackToDm: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // normalizeChannelRoutingConfig
  // -----------------------------------------------------------------------

  describe("normalizeChannelRoutingConfig", () => {
    it("returns defaults for null input", () => {
      expect(normalizeChannelRoutingConfig(null)).toEqual(
        defaultChannelRoutingConfig()
      );
    });

    it("returns defaults for empty object", () => {
      expect(normalizeChannelRoutingConfig({})).toEqual(
        defaultChannelRoutingConfig()
      );
    });

    it("normalizes valid config", () => {
      const raw = {
        policies: [
          {
            label: "P0 urgent",
            match: { priority: "P0" },
            channelId: "C_URGENT",
            enabled: true,
          },
        ],
        defaultChannelId: "C_DEFAULT",
        fallbackToDm: false,
      };

      const config = normalizeChannelRoutingConfig(raw);
      expect(config.policies).toHaveLength(1);
      expect(config.policies[0].label).toBe("P0 urgent");
      expect(config.policies[0].channelId).toBe("C_URGENT");
      expect(config.defaultChannelId).toBe("C_DEFAULT");
      expect(config.fallbackToDm).toBe(false);
    });

    it("strips policies without channelId", () => {
      const raw = {
        policies: [
          { label: "No channel", match: { priority: "P0" } },
          { label: "Has channel", match: { priority: "P1" }, channelId: "C_P1" },
        ],
      };

      const config = normalizeChannelRoutingConfig(raw);
      expect(config.policies).toHaveLength(1);
      expect(config.policies[0].label).toBe("Has channel");
    });

    it("strips policies without match criteria", () => {
      const raw = {
        policies: [
          { label: "No match", channelId: "C_ORPHAN", match: {} },
          { label: "Has match", channelId: "C_OK", match: { projectId: "proj-1" } },
        ],
      };

      const config = normalizeChannelRoutingConfig(raw);
      expect(config.policies).toHaveLength(1);
      expect(config.policies[0].label).toBe("Has match");
    });

    it("defaults label to 'Unnamed policy' when missing", () => {
      const raw = {
        policies: [
          { match: { priority: "P0" }, channelId: "C_P0" },
        ],
      };

      const config = normalizeChannelRoutingConfig(raw);
      expect(config.policies[0].label).toBe("Unnamed policy");
    });

    it("defaults enabled to true when missing", () => {
      const raw = {
        policies: [
          { label: "Test", match: { priority: "P0" }, channelId: "C_P0" },
        ],
      };

      const config = normalizeChannelRoutingConfig(raw);
      expect(config.policies[0].enabled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // policyMatches
  // -----------------------------------------------------------------------

  describe("policyMatches", () => {
    it("matches when all specified criteria match", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Test",
        match: { projectId: "proj-1", priority: "P0" },
        channelId: "C123",
        enabled: true,
      };
      const context: ChannelRoutingContext = {
        projectId: "proj-1",
        priority: "P0",
      };

      expect(policyMatches(policy, context)).toBe(true);
    });

    it("does not match when disabled", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Disabled",
        match: { priority: "P0" },
        channelId: "C123",
        enabled: false,
      };

      expect(policyMatches(policy, { priority: "P0" })).toBe(false);
    });

    it("does not match when projectId differs", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Project match",
        match: { projectId: "proj-1" },
        channelId: "C123",
        enabled: true,
      };

      expect(policyMatches(policy, { projectId: "proj-2" })).toBe(false);
    });

    it("does not match when priority differs", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Priority match",
        match: { priority: "P0" },
        channelId: "C123",
        enabled: true,
      };

      expect(policyMatches(policy, { priority: "P1" })).toBe(false);
    });

    it("does not match when notificationType differs", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Type match",
        match: { notificationType: "blocked" },
        channelId: "C123",
        enabled: true,
      };

      expect(policyMatches(policy, { notificationType: "status_change" })).toBe(false);
    });

    it("matches when policy has one criterion and context has extras", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Priority only",
        match: { priority: "P0" },
        channelId: "C123",
        enabled: true,
      };

      // Context has more info than the policy requires -- that's fine
      expect(
        policyMatches(policy, {
          priority: "P0",
          projectId: "proj-1",
          notificationType: "blocked",
        })
      ).toBe(true);
    });

    it("uses AND logic for multiple criteria", () => {
      const policy: ChannelRoutingPolicy = {
        label: "Project + Priority",
        match: { projectId: "proj-1", priority: "P0" },
        channelId: "C123",
        enabled: true,
      };

      // Only one criterion matches -- should fail
      expect(policyMatches(policy, { projectId: "proj-1", priority: "P1" })).toBe(false);
      expect(policyMatches(policy, { projectId: "proj-2", priority: "P0" })).toBe(false);

      // Both match -- should pass
      expect(policyMatches(policy, { projectId: "proj-1", priority: "P0" })).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // resolveChannelForNotification
  // -----------------------------------------------------------------------

  describe("resolveChannelForNotification", () => {
    it("returns null when no config provided", () => {
      expect(resolveChannelForNotification({}, null)).toBeNull();
    });

    it("returns default channel when no policies match", () => {
      const config: ChannelRoutingConfig = {
        policies: [
          {
            label: "P0 only",
            match: { priority: "P0" },
            channelId: "C_URGENT",
            enabled: true,
          },
        ],
        defaultChannelId: "C_DEFAULT",
        fallbackToDm: true,
      };

      const result = resolveChannelForNotification({ priority: "P3" }, config);
      expect(result).toEqual({
        channelId: "C_DEFAULT",
        matchedPolicy: "default",
      });
    });

    it("returns null when no policies match and no default", () => {
      const config: ChannelRoutingConfig = {
        policies: [],
        defaultChannelId: null,
        fallbackToDm: true,
      };

      expect(resolveChannelForNotification({ priority: "P0" }, config)).toBeNull();
    });

    it("returns first matching policy", () => {
      const config: ChannelRoutingConfig = {
        policies: [
          {
            label: "P0 urgent",
            match: { priority: "P0" },
            channelId: "C_URGENT",
            enabled: true,
          },
          {
            label: "P1 important",
            match: { priority: "P1" },
            channelId: "C_IMPORTANT",
            enabled: true,
          },
        ],
        defaultChannelId: "C_DEFAULT",
        fallbackToDm: true,
      };

      const result = resolveChannelForNotification({ priority: "P1" }, config);
      expect(result?.channelId).toBe("C_IMPORTANT");
      expect(result?.matchedPolicy).toBe("P1 important");
    });

    it("prefers more specific policies (higher specificity)", () => {
      const config: ChannelRoutingConfig = {
        policies: [
          {
            label: "Just priority",
            match: { priority: "P0" },
            channelId: "C_PRIORITY_ONLY",
            enabled: true,
          },
          {
            label: "Project + priority",
            match: { projectId: "proj-1", priority: "P0" },
            channelId: "C_SPECIFIC",
            enabled: true,
          },
        ],
        defaultChannelId: null,
        fallbackToDm: true,
      };

      const result = resolveChannelForNotification(
        { projectId: "proj-1", priority: "P0" },
        config
      );
      // The more specific policy (2 criteria) should win even though
      // the less specific one (1 criterion) also matches
      expect(result?.channelId).toBe("C_SPECIFIC");
      expect(result?.matchedPolicy).toBe("Project + priority");
    });

    it("skips disabled policies", () => {
      const config: ChannelRoutingConfig = {
        policies: [
          {
            label: "Disabled P0",
            match: { priority: "P0" },
            channelId: "C_DISABLED",
            enabled: false,
          },
        ],
        defaultChannelId: "C_FALLBACK",
        fallbackToDm: true,
      };

      const result = resolveChannelForNotification({ priority: "P0" }, config);
      expect(result?.channelId).toBe("C_FALLBACK");
      expect(result?.matchedPolicy).toBe("default");
    });

    it("includes threadTs from matching policy", () => {
      const config: ChannelRoutingConfig = {
        policies: [
          {
            label: "Threaded",
            match: { priority: "P0" },
            channelId: "C_URGENT",
            threadTs: "1739470000.000000",
            enabled: true,
          },
        ],
        defaultChannelId: null,
        fallbackToDm: true,
      };

      const result = resolveChannelForNotification({ priority: "P0" }, config);
      expect(result?.threadTs).toBe("1739470000.000000");
    });
  });
});
