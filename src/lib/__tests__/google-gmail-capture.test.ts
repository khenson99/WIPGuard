import { describe, expect, it } from "vitest";
import {
  buildGoogleGmailDedupeKey,
  defaultGmailCaptureRuleConfig,
  extractDuePhrase,
} from "@/lib/integrations/google-gmail-capture";

describe("google-gmail-capture helpers", () => {
  it("returns sensible default rule config", () => {
    expect(defaultGmailCaptureRuleConfig()).toEqual({
      label: "wg-action",
      includeStarred: true,
      maxResults: 25,
    });
  });

  it("builds canonical dedupe keys", () => {
    const key = buildGoogleGmailDedupeKey({
      threadId: "18abc",
      ruleVariant: "label=wg-action|starred=1",
    });

    expect(key).toBe("google_workspace:gmail_thread:18abc:label=wg-action|starred=1");
  });

  it("extracts tomorrow as due phrase", () => {
    const parsed = extractDuePhrase("Please send this tomorrow afternoon");

    expect(parsed.phrase).toBe("tomorrow");
    expect(parsed.dueDate).not.toBeNull();
  });

  it("extracts explicit ISO date", () => {
    const parsed = extractDuePhrase("Need final response by 2026-03-01");

    expect(parsed.phrase).toBe("2026-03-01");
    expect(parsed.dueDate?.getFullYear()).toBe(2026);
    expect(parsed.dueDate?.getMonth()).toBe(2);
    expect(parsed.dueDate?.getDate()).toBe(1);
  });

  it("returns null due date for unknown phrases", () => {
    const parsed = extractDuePhrase("Just an FYI with no due date");

    expect(parsed.dueDate).toBeNull();
    expect(parsed.phrase).toBeNull();
  });
});
