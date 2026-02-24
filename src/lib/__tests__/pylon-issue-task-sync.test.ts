import { describe, expect, it } from "vitest";
import {
  buildPylonIssueTaskDedupeKey,
  resolvePylonIssueTaskStatus,
  shouldIncludePylonIssue,
  upsertPylonNotesBlock,
  type PylonIssueTaskSyncConfig,
} from "@/lib/integrations/pylon-issue-task-sync";

function baseConfig(
  patch?: Partial<PylonIssueTaskSyncConfig>
): PylonIssueTaskSyncConfig {
  return {
    rangePreset: "30d",
    contextKey: "default",
    onlyUrgent: false,
    includeTags: [],
    excludeTags: [],
    defaultTaskStatus: "QUEUED",
    pylonStatusToTaskStatus: undefined,
    ...patch,
  };
}

describe("pylon issue task sync helpers", () => {
  it("builds stable dedupe keys", () => {
    expect(buildPylonIssueTaskDedupeKey("123")).toBe("pylon:pylon_issue_task_sync:123");
  });

  it("upserts a bounded notes block without clobbering user notes", () => {
    const existing = [
      "User notes line 1",
      "",
      "<!-- wg:pylon:start -->",
      "old content",
      "<!-- wg:pylon:end -->",
      "",
      "User notes line 2",
    ].join("\n");

    const next = upsertPylonNotesBlock(existing, "Pylon\nIssue ID: 123\nStatus: open");

    expect(next).toContain("User notes line 1");
    expect(next).toContain("User notes line 2");
    expect(next).toContain("Issue ID: 123");
    expect(next).not.toContain("old content");
  });

  it("status mapping: resolved/closed → DONE by default", () => {
    const issue = { id: "1", status: "closed", priority: "low", tags: [] as string[] };
    const status = resolvePylonIssueTaskStatus({
      issue,
      config: baseConfig(),
      statusOverride: null,
    });
    expect(status).toBe("DONE");
  });

  it("status mapping: mapping can override resolved handling", () => {
    const issue = { id: "1", status: "closed", priority: "low" };
    const status = resolvePylonIssueTaskStatus({
      issue,
      config: baseConfig({
        pylonStatusToTaskStatus: { closed: "NOT_DONE" },
      }),
      statusOverride: null,
    });
    expect(status).toBe("NOT_DONE");
  });

  it("status mapping: urgent unmapped → ACTIVE, non-urgent unmapped → default", () => {
    const urgentIssue = { id: "1", status: "open", priority: "urgent" };
    const normalIssue = { id: "2", status: "open", priority: "low" };

    const urgentStatus = resolvePylonIssueTaskStatus({
      issue: urgentIssue,
      config: baseConfig({ defaultTaskStatus: "QUEUED" }),
      statusOverride: null,
    });

    const normalStatus = resolvePylonIssueTaskStatus({
      issue: normalIssue,
      config: baseConfig({ defaultTaskStatus: "NOT_DONE" }),
      statusOverride: null,
    });

    expect(urgentStatus).toBe("ACTIVE");
    expect(normalStatus).toBe("NOT_DONE");
  });

  it("tag filtering respects includeTags/excludeTags and onlyUrgent", () => {
    const issue = { id: "1", status: "open", priority: "low", tags: ["billing", "vip"] };

    expect(shouldIncludePylonIssue(issue, baseConfig())).toBe(true);
    expect(shouldIncludePylonIssue(issue, baseConfig({ includeTags: ["vip"] }))).toBe(true);
    expect(shouldIncludePylonIssue(issue, baseConfig({ includeTags: ["other"] }))).toBe(false);
    expect(shouldIncludePylonIssue(issue, baseConfig({ excludeTags: ["vip"] }))).toBe(false);
    expect(shouldIncludePylonIssue(issue, baseConfig({ onlyUrgent: true }))).toBe(false);
  });
});

