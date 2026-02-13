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
  });

  it("blocks observer task transitions and policy mutations", () => {
    expect(can("observer", "task.transition")).toBe(false);
    expect(can("observer", "task.write")).toBe(false);
    expect(can("observer", "policy.write")).toBe(false);
  });

  it("allows members to mutate delivery flow but not privileged controls", () => {
    expect(can("member", "task.transition")).toBe(true);
    expect(can("member", "project.write")).toBe(true);
    expect(can("member", "policy.write")).toBe(false);
    expect(can("member", "team.role.write")).toBe(false);
    expect(can("member", "team.invite")).toBe(false);
  });
});
