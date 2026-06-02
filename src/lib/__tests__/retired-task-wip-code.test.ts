import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RETIRED_TASK_WIP_MODULES = [
  "src/lib/integrations/slack-task-creation.ts",
  "src/lib/integrations/slack-thread-capture.ts",
  "src/lib/integrations/pylon-issue-task-sync.ts",
  "src/lib/integrations/coda-decision-actions.ts",
  "src/lib/integrations/coda-dependency-gates.ts",
  "src/lib/integrations/coda-row-sync.ts",
  "src/lib/integrations/google-calendar-followup.ts",
  "src/lib/integrations/google-drive-comment-escalation.ts",
  "src/lib/integrations/google-drive-transcript-capture.ts",
  "src/lib/integrations/google-gmail-capture.ts",
  "src/lib/integrations/hubspot-bidirectional-sync.ts",
  "src/lib/integrations/hubspot-customer-signals.ts",
  "src/lib/integrations/hubspot-risk-intervention.ts",
  "src/lib/integrations/hubspot-stage-checklist.ts",
  "src/lib/integrations/hubspot-sync.ts",
  "src/lib/integrations/slack-raci-bridge.ts",
  "src/lib/integrations/slack-status-sync.ts",
  "src/lib/integrations/slack-unanswered-requests.ts",
  "src/lib/retired-task-wip.ts",
  "src/lib/flow/analytics.ts",
  "src/lib/flow/risk-intelligence.ts",
  "src/lib/policy-engine.ts",
  "src/lib/policy-check.ts",
  "src/lib/analytics/flow-intelligence-bridge.ts",
  "src/lib/analytics/decision-dashboard.ts",
  "src/components/whip/types.ts",
  "src/components/whip/use-whip-data.ts",
  "src/components/whip/wip-pressure-heatmap.tsx",
  "src/components/whip/retro-export.tsx",
  "src/components/board/kanban-board.tsx",
  "src/components/board/kanban-column.tsx",
  "src/components/board/task-card.tsx",
  "src/components/board/board-filters.tsx",
  "src/components/projects/project-card.tsx",
  "src/components/projects/project-dashboard.tsx",
  "src/components/projects/project-detail.tsx",
  "src/components/standup/standup-view.tsx",
  "src/components/standup/standup-member-card.tsx",
  "src/components/tasks/task-modal.tsx",
  "src/components/tasks/task-table-view.tsx",
  "src/components/logbook/LogbookExportDropdown.tsx",
  "src/components/settings/sprints-tab.tsx",
  "src/components/settings/projects-tab.tsx",
  "src/components/automations/ralph-board-view.tsx",
  "src/types/board.ts",
  "src/store/board-store.ts",
  "src/stores/board-store.ts",
  "src/lib/automations/ralph-board.ts",
  "src/lib/sprints.ts",
  "src/lib/sprint-ledger.ts",
  "src/lib/standup-engine.ts",
  "src/lib/export/logbook-export.ts",
  "src/lib/task-order.ts",
  "src/lib/class-of-service.ts",
  "src/lib/hierarchy-engine.ts",
  "src/lib/raci-inheritance.ts",
  "src/lib/migration/coda-import.ts",
  "src/lib/migration/dedup-detection.ts",
  "src/lib/migration/reconciliation.ts",
  "src/context/socket-provider.tsx",
  "src/hooks/use-socket.ts",
  "src/lib/socket-emit.ts",
];

describe("retired task/WIP implementation modules", () => {
  it("does not keep local task-creation or compatibility helper modules", () => {
    for (const modulePath of RETIRED_TASK_WIP_MODULES) {
      expect(existsSync(join(process.cwd(), modulePath))).toBe(false);
    }
  });

  it("does not expose legacy task/WIP analytics or automation action surfaces", () => {
    const productionFiles = [
      "src/lib/analytics/section-registry.ts",
      "src/components/analytics/analytics-section-page.tsx",
      "src/app/api/analytics/route.ts",
      "src/lib/analytics/refresh-runner.ts",
      "src/lib/analytics/types.ts",
      "src/lib/analytics/fetchers-integrations.ts",
      "src/lib/analytics/metric-history.ts",
      "src/lib/analytics/funnel.ts",
      "src/lib/analytics/customer-journey.ts",
      "src/components/analytics/customer-success-operational-view-model.ts",
      "src/components/analytics/generic-workspace-tab.tsx",
      "src/components/analytics/integration-child-dashboards.tsx",
      "src/components/analytics/cs-product-tab.tsx",
      "src/components/analytics/cs-coda-tab.tsx",
      "src/components/analytics/ops-insights.tsx",
      "src/lib/automations/actions.ts",
      "src/lib/automations/execution-policy.ts",
      "src/lib/automations/runtime.ts",
    ];
    const forbiddenPatterns = [
      "ads-coda-kanban",
      "create_task",
      "update_task",
      "create_checklist_tasks",
      "create_hubspot_task",
      "createdTasksInRange",
      "completedTasksInRange",
      "overdueOpenTasks",
      "tasksCreatedInRange",
      "createdTasks",
      "Legacy Open Execution Items",
    ];

    for (const modulePath of productionFiles) {
      const contents = readFileSync(join(process.cwd(), modulePath), "utf8");
      for (const forbidden of forbiddenPatterns) {
        expect(contents.includes(forbidden), `${modulePath} contains ${forbidden}`).toBe(false);
      }
    }
  });
});
