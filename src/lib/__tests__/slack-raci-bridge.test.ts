import { describe, expect, it } from "vitest";
import {
  getNotificationTypesForRole,
  getRolesToNotify,
} from "@/lib/integrations/slack-raci-bridge";

describe("slack-raci-bridge helpers", () => {
  // -----------------------------------------------------------------------
  // getNotificationTypesForRole
  // -----------------------------------------------------------------------

  describe("getNotificationTypesForRole", () => {
    // --- Responsible ---
    it("responsible gets assignment on raci_change", () => {
      expect(getNotificationTypesForRole("responsible", "raci_change")).toEqual([
        "assignment",
      ]);
    });

    it("responsible gets status_change on status_change", () => {
      expect(getNotificationTypesForRole("responsible", "status_change")).toEqual([
        "status_change",
      ]);
    });

    it("responsible gets blocked on blocked", () => {
      expect(getNotificationTypesForRole("responsible", "blocked")).toEqual([
        "blocked",
      ]);
    });

    it("responsible gets unblocked on unblocked", () => {
      expect(getNotificationTypesForRole("responsible", "unblocked")).toEqual([
        "unblocked",
      ]);
    });

    it("responsible gets assignment on assignment", () => {
      expect(getNotificationTypesForRole("responsible", "assignment")).toEqual([
        "assignment",
      ]);
    });

    // --- Accountable ---
    it("accountable gets mention on raci_change", () => {
      expect(getNotificationTypesForRole("accountable", "raci_change")).toEqual([
        "mention",
      ]);
    });

    it("accountable gets status_change on status_change", () => {
      expect(getNotificationTypesForRole("accountable", "status_change")).toEqual([
        "status_change",
      ]);
    });

    it("accountable gets blocked on blocked", () => {
      expect(getNotificationTypesForRole("accountable", "blocked")).toEqual([
        "blocked",
      ]);
    });

    it("accountable gets nothing on assignment", () => {
      expect(getNotificationTypesForRole("accountable", "assignment")).toEqual(
        []
      );
    });

    // --- Consulted ---
    it("consulted gets mention on raci_change only", () => {
      expect(getNotificationTypesForRole("consulted", "raci_change")).toEqual([
        "mention",
      ]);
      expect(getNotificationTypesForRole("consulted", "status_change")).toEqual(
        []
      );
      expect(getNotificationTypesForRole("consulted", "blocked")).toEqual([]);
      expect(getNotificationTypesForRole("consulted", "assignment")).toEqual([]);
    });

    // --- Informed ---
    it("informed gets mention on raci_change", () => {
      expect(getNotificationTypesForRole("informed", "raci_change")).toEqual([
        "mention",
      ]);
    });

    it("informed gets status_change on status_change", () => {
      expect(getNotificationTypesForRole("informed", "status_change")).toEqual([
        "status_change",
      ]);
    });

    it("informed gets nothing on blocked/unblocked/assignment", () => {
      expect(getNotificationTypesForRole("informed", "blocked")).toEqual([]);
      expect(getNotificationTypesForRole("informed", "unblocked")).toEqual([]);
      expect(getNotificationTypesForRole("informed", "assignment")).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getRolesToNotify
  // -----------------------------------------------------------------------

  describe("getRolesToNotify", () => {
    it("raci_change returns empty (added users handled separately)", () => {
      expect(getRolesToNotify("raci_change")).toEqual([]);
    });

    it("status_change notifies responsible, accountable, informed", () => {
      const roles = getRolesToNotify("status_change");
      expect(roles).toContain("responsible");
      expect(roles).toContain("accountable");
      expect(roles).toContain("informed");
      expect(roles).not.toContain("consulted");
    });

    it("blocked notifies responsible and accountable", () => {
      const roles = getRolesToNotify("blocked");
      expect(roles).toEqual(["responsible", "accountable"]);
    });

    it("unblocked notifies responsible and accountable", () => {
      const roles = getRolesToNotify("unblocked");
      expect(roles).toEqual(["responsible", "accountable"]);
    });

    it("assignment notifies responsible only", () => {
      expect(getRolesToNotify("assignment")).toEqual(["responsible"]);
    });
  });
});
