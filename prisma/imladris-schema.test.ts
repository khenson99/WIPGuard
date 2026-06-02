import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("Imladris canonical data schema", () => {
  it("defines raw source records, sync runs, canonical metrics, and lineage", () => {
    expect(schema).toContain("model ImladrisSourceSyncRun");
    expect(schema).toContain("model ImladrisRawSourceRecord");
    expect(schema).toContain("model ImladrisCanonicalMetricValue");
    expect(schema).toContain("model ImladrisMetricLineage");
  });

  it("keys raw source records by tenant scope as well as provider identity", () => {
    const rawRecordSection = schema.slice(
      schema.indexOf("model ImladrisRawSourceRecord"),
      schema.indexOf("model ImladrisCanonicalMetricValue"),
    );

    expect(rawRecordSection).toContain("scopeKey");
    expect(rawRecordSection).toContain("@@unique([provider, objectType, externalId, scopeKey])");
    expect(rawRecordSection).not.toContain("@@unique([provider, objectType, externalId])");
  });

  it("does not tie canonical Imladris models to task/WIP tables", () => {
    const imladrisSection = schema.slice(schema.indexOf("model ImladrisSourceSyncRun"));
    expect(imladrisSection).not.toMatch(/\bTask\b/);
    expect(imladrisSection).not.toMatch(/\bProject\b/);
    expect(imladrisSection).not.toMatch(/\bSprint\b/);
    expect(imladrisSection).not.toMatch(/\bBoardSettings\b/);
    expect(imladrisSection).not.toMatch(/\bWipPolicy\b/);
  });

  it("does not keep retired task, WIP, sprint, board, or saved-view schema", () => {
    for (const retiredModel of [
      "Task",
      "Project",
      "Sprint",
      "SprintCommitment",
      "PlanningSession",
      "StatusHistory",
      "LogbookEntry",
      "BoardSettings",
      "WipPolicy",
      "PolicyOverride",
      "UserSavedView",
    ]) {
      expect(schema).not.toMatch(new RegExp(`\\bmodel ${retiredModel}\\b`));
    }

    for (const retiredEnum of [
      "TaskStatus",
      "Priority",
      "ProjectStatus",
      "ProjectType",
      "SavedViewScope",
      "EnforcementMode",
      "UnplannedReason",
    ]) {
      expect(schema).not.toMatch(new RegExp(`\\benum ${retiredEnum}\\b`));
    }

    expect(schema).not.toMatch(/\bWIPGUARD\b/);
  });
});
