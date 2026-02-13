import { describe, it, expect } from "vitest";
import {
  checkWipPolicy,
  type WipPolicyConfig,
  type PolicyCheckInput,
} from "../policy-engine";

const makePolicy = (
  overrides: Partial<WipPolicyConfig> = {}
): WipPolicyConfig => ({
  columnName: "ACTIVE",
  wipLimit: 3,
  enforcement: "WARN",
  overrideRoles: ["admin"],
  ...overrides,
});

const makeInput = (overrides: Partial<PolicyCheckInput> = {}): PolicyCheckInput => ({
  targetColumn: "ACTIVE",
  currentColumnTaskCount: 0,
  userRole: "member",
  policies: [makePolicy()],
  ...overrides,
});

describe("checkWipPolicy", () => {
  describe("exempt columns", () => {
    it("always allows BACKLOG regardless of count", () => {
      const result = checkWipPolicy(
        makeInput({
          targetColumn: "BACKLOG",
          currentColumnTaskCount: 999,
          policies: [makePolicy({ columnName: "BACKLOG", wipLimit: 1, enforcement: "BLOCK" })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(false);
      expect(result.enforcement).toBeNull();
    });

    it("always allows DONE regardless of count", () => {
      const result = checkWipPolicy(
        makeInput({
          targetColumn: "DONE",
          currentColumnTaskCount: 999,
          policies: [makePolicy({ columnName: "DONE", wipLimit: 1, enforcement: "BLOCK" })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(false);
    });

    it("always allows NOT_DONE regardless of count", () => {
      const result = checkWipPolicy(
        makeInput({
          targetColumn: "NOT_DONE",
          currentColumnTaskCount: 999,
        })
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("no policy configured", () => {
    it("allows when no policies exist", () => {
      const result = checkWipPolicy(
        makeInput({ policies: [] })
      );
      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBeNull();
    });

    it("allows when wipLimit is 0 (unconfigured)", () => {
      const result = checkWipPolicy(
        makeInput({
          policies: [makePolicy({ wipLimit: 0 })],
          currentColumnTaskCount: 100,
        })
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("under WIP limit", () => {
    it("allows when count is below limit", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 2,
          policies: [makePolicy({ wipLimit: 3 })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(false);
      expect(result.warning).toBeUndefined();
    });
  });

  describe("WARN enforcement", () => {
    it("allows with warning when count reaches limit", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 3,
          policies: [makePolicy({ wipLimit: 3, enforcement: "WARN" })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(false);
      expect(result.warning).toContain("WIP limit (3) reached");
      expect(result.enforcement).toBe("WARN");
    });

    it("allows with warning when count exceeds limit", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 5,
          policies: [makePolicy({ wipLimit: 3, enforcement: "WARN" })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeDefined();
    });

    it("warns regardless of user role", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 3,
          userRole: "observer",
          policies: [makePolicy({ wipLimit: 3, enforcement: "WARN" })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeDefined();
    });
  });

  describe("BLOCK enforcement", () => {
    it("blocks non-override-role when limit reached", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 3,
          userRole: "member",
          policies: [makePolicy({ wipLimit: 3, enforcement: "BLOCK", overrideRoles: ["admin"] })],
        })
      );
      expect(result.allowed).toBe(false);
      expect(result.requiresOverride).toBe(false);
      expect(result.warning).toContain('cannot override');
    });

    it("allows override for admin when limit reached", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 3,
          userRole: "admin",
          policies: [makePolicy({ wipLimit: 3, enforcement: "BLOCK", overrideRoles: ["admin"] })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(true);
      expect(result.warning).toContain("Override allowed");
    });

    it("allows under limit even for BLOCK mode", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 1,
          userRole: "member",
          policies: [makePolicy({ wipLimit: 3, enforcement: "BLOCK" })],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it("respects custom override roles", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 3,
          userRole: "lead",
          policies: [
            makePolicy({
              wipLimit: 3,
              enforcement: "BLOCK",
              overrideRoles: ["admin", "lead"],
            }),
          ],
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(true);
    });
  });

  describe("multiple policies", () => {
    it("picks the correct policy by column name", () => {
      const policies = [
        makePolicy({ columnName: "QUEUED", wipLimit: 5, enforcement: "WARN" }),
        makePolicy({ columnName: "ACTIVE", wipLimit: 2, enforcement: "BLOCK" }),
      ];

      const result = checkWipPolicy(
        makeInput({
          targetColumn: "QUEUED",
          currentColumnTaskCount: 6,
          policies,
        })
      );
      expect(result.enforcement).toBe("WARN");
      expect(result.wipLimit).toBe(5);
    });
  });

  describe("result shape", () => {
    it("includes wipLimit and currentCount in result", () => {
      const result = checkWipPolicy(
        makeInput({
          currentColumnTaskCount: 4,
          policies: [makePolicy({ wipLimit: 3, enforcement: "WARN" })],
        })
      );
      expect(result.wipLimit).toBe(3);
      expect(result.currentCount).toBe(4);
    });
  });
});
