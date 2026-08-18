import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  resolveAirtableWriteEnabled,
  AIRTABLE_WRITES_DISABLED_MESSAGE,
} from "@/lib/integrations/airtable";

describe("Airtable write toggle", () => {
  const original = process.env.AIRTABLE_WRITES_ENABLED;
  beforeEach(() => {
    delete process.env.AIRTABLE_WRITES_ENABLED;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.AIRTABLE_WRITES_ENABLED;
    else process.env.AIRTABLE_WRITES_ENABLED = original;
  });

  it("defaults to OFF when metadata is absent or empty", () => {
    expect(resolveAirtableWriteEnabled(null)).toBe(false);
    expect(resolveAirtableWriteEnabled(undefined)).toBe(false);
    expect(resolveAirtableWriteEnabled({})).toBe(false);
  });

  it("defaults to OFF for a connected-but-unconfigured connection", () => {
    expect(
      resolveAirtableWriteEnabled({ baseId: "app123", tableName: "Tasks" })
    ).toBe(false);
  });

  it("enables only on an explicit true", () => {
    expect(resolveAirtableWriteEnabled({ writeEnabled: true })).toBe(true);
    expect(resolveAirtableWriteEnabled({ writeEnabled: "true" })).toBe(true);
    expect(resolveAirtableWriteEnabled({ writeEnabled: "1" })).toBe(true);
  });

  it("fails closed on unrecognised or truthy-looking junk", () => {
    for (const value of ["yes", "on", "TRUE!", "", 1, {}, [], null]) {
      expect(resolveAirtableWriteEnabled({ writeEnabled: value })).toBe(false);
    }
  });

  it("honours an explicit false even when the env var is on", () => {
    process.env.AIRTABLE_WRITES_ENABLED = "true";
    expect(resolveAirtableWriteEnabled({ writeEnabled: false })).toBe(false);
    expect(resolveAirtableWriteEnabled({ writeEnabled: "false" })).toBe(false);
  });

  it("falls back to the env var only when metadata says nothing", () => {
    process.env.AIRTABLE_WRITES_ENABLED = "true";
    expect(resolveAirtableWriteEnabled({})).toBe(true);
    process.env.AIRTABLE_WRITES_ENABLED = "false";
    expect(resolveAirtableWriteEnabled({})).toBe(false);
    process.env.AIRTABLE_WRITES_ENABLED = "maybe";
    expect(resolveAirtableWriteEnabled({})).toBe(false);
  });

  it("exposes an actionable disabled message", () => {
    expect(AIRTABLE_WRITES_DISABLED_MESSAGE).toMatch(/disabled/i);
    expect(AIRTABLE_WRITES_DISABLED_MESSAGE).toMatch(/Allow writes to Airtable/);
  });
});
