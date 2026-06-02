import { describe, expect, it } from "vitest";
import { can, normalizeRole } from "@/lib/permissions";

describe("permissions", () => {
  it("normalizes unknown roles to member", () => {
    expect(normalizeRole("ADMIN")).toBe("admin");
    expect(normalizeRole("observer")).toBe("observer");
    expect(normalizeRole("something-else")).toBe("member");
    expect(normalizeRole(undefined)).toBe("member");
  });

  it("allows admin privileged actions", () => {
    expect(can("admin", "policy.write")).toBe(true);
    expect(can("admin", "team.role.write")).toBe(true);
    expect(can("admin", "team.invite")).toBe(true);
    expect(can("admin", "analytics.read")).toBe(true);
    expect(can("admin", "analytics.write")).toBe(true);
  });

  it("blocks observer operating metric mutations and policy changes", () => {
    expect(can("observer", "department.write")).toBe(false);
    expect(can("observer", "deals.read")).toBe(false);
    expect(can("observer", "analytics.read")).toBe(false);
    expect(can("observer", "analytics.write")).toBe(false);
    expect(can("observer", "policy.write")).toBe(false);
  });

  it("allows members to manage operating data but not privileged controls", () => {
    expect(can("member", "department.write")).toBe(true);
    expect(can("member", "deals.read")).toBe(true);
    expect(can("member", "analytics.read")).toBe(true);
    expect(can("member", "analytics.write")).toBe(true);
    expect(can("member", "policy.write")).toBe(false);
    expect(can("member", "team.role.write")).toBe(false);
    expect(can("member", "team.invite")).toBe(false);
  });
});
