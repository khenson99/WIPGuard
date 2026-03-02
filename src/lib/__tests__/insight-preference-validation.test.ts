import { describe, it, expect } from "vitest";
import { validateUpsertInput } from "@/lib/validators/insight-preference";

describe("validateUpsertInput", () => {
  it("accepts valid pinned input", () => {
    const res = validateUpsertInput({ insightId: "wip-bottleneck-col3", status: "pinned" });
    expect(res.valid).toBe(true);
    expect(res.data).toEqual({ insightId: "wip-bottleneck-col3", status: "pinned" });
  });

  it("accepts valid dismissed input", () => {
    const res = validateUpsertInput({ insightId: "cycle-time-spike", status: "dismissed" });
    expect(res.valid).toBe(true);
    expect(res.data).toEqual({ insightId: "cycle-time-spike", status: "dismissed" });
  });

  it("accepts default (reset) status", () => {
    const res = validateUpsertInput({ insightId: "some-insight", status: "default" });
    expect(res.valid).toBe(true);
    expect(res.data).toEqual({ insightId: "some-insight", status: "default" });
  });

  it("rejects missing insightId", () => {
    const res = validateUpsertInput({ status: "pinned" });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("insightId");
  });

  it("rejects empty insightId", () => {
    const res = validateUpsertInput({ insightId: "", status: "pinned" });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("insightId");
  });

  it("rejects insightId exceeding 256 chars", () => {
    const res = validateUpsertInput({ insightId: "x".repeat(257), status: "pinned" });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("insightId");
  });

  it("accepts insightId of exactly 256 chars", () => {
    const res = validateUpsertInput({ insightId: "x".repeat(256), status: "pinned" });
    expect(res.valid).toBe(true);
  });

  it("rejects invalid status", () => {
    const res = validateUpsertInput({ insightId: "abc", status: "archived" });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("status");
  });

  it("rejects null body", () => {
    const res = validateUpsertInput(null);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("JSON object");
  });

  it("rejects non-object body", () => {
    const res = validateUpsertInput("string");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("JSON object");
  });

  it("rejects numeric body", () => {
    const res = validateUpsertInput(42);
    expect(res.valid).toBe(false);
  });
});
