import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RETIRED_ROUTE_FILES = [
  "tasks/route.ts",
  "tasks/[id]/route.ts",
  "tasks/[id]/advance/route.ts",
  "tasks/[id]/retreat/route.ts",
  "tasks/reorder/route.ts",
  "projects/route.ts",
  "projects/[id]/route.ts",
  "sprints/route.ts",
  "sprints/[id]/route.ts",
  "sprints/[id]/commit/route.ts",
  "sprints/[id]/commitment-log/route.ts",
  "sprints/[id]/planned-vs-unplanned/route.ts",
  "sprints/[id]/planning-session/route.ts",
  "sprints/[id]/report/route.ts",
  "sprints/unplanned-reasons/route.ts",
  "standup/route.ts",
  "board-settings/route.ts",
  "v1/tasks/route.ts",
  "v1/projects/route.ts",
  "integrations/slack/task-create/route.ts",
  "integrations/slack/thread-capture/route.ts",
  "integrations/pylon/issue-task-sync/route.ts",
  "customer-success/accounts/[accountId]/tasks/route.ts",
  "flow/metrics/route.ts",
  "flow/risk/route.ts",
  "policy/route.ts",
  "policy/audit/route.ts",
  "policy/override/route.ts",
  "logbook/route.ts",
  "views/route.ts",
  "views/[id]/route.ts",
  "hierarchy/route.ts",
  "migration/coda/route.ts",
  "analytics/decision-dashboard/route.ts",
  "integrations/coda/row-sync/route.ts",
  "integrations/coda/dependency-gates/route.ts",
  "integrations/coda/decision-actions/route.ts",
  "integrations/google-workspace/calendar-followup/route.ts",
  "integrations/google-workspace/drive-comment-escalation/route.ts",
  "integrations/google-workspace/drive-transcript-capture/route.ts",
  "integrations/google-workspace/gmail-capture/route.ts",
  "integrations/hubspot/bidirectional-sync/route.ts",
  "integrations/hubspot/customer-signals/route.ts",
  "integrations/hubspot/risk-intervention/route.ts",
  "integrations/hubspot/stage-checklist/route.ts",
  "integrations/hubspot/sync/route.ts",
  "integrations/hubspot/webhook/route.ts",
  "v1/integrations/hubspot/webhook/route.ts",
  "integrations/slack/status-sync/route.ts",
  "integrations/slack/unanswered-requests/route.ts",
];

describe("retired task/WIP API routes", () => {
  it("does not ship task, project, sprint, standup, board, or task-creation API route files", () => {
    for (const routeFile of RETIRED_ROUTE_FILES) {
      expect(existsSync(join(process.cwd(), "src/app/api", routeFile))).toBe(false);
    }
  });
});
