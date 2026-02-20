import { describe, expect, it } from "vitest";
import { ANALYTICS_SUB_SECTIONS } from "@/lib/analytics/section-registry";
import { INTEGRATION_CHILD_DASHBOARD_REGISTRY } from "@/components/analytics/integration-child-dashboards";

const NON_INTEGRATION_DOMAINS = new Set([
  "decisionDashboard",
  "flowMetrics",
  "flowRisk",
  "observability",
  "customerJourney",
  "demoAnalytics",
  "processAnalytics",
]);

describe("integration child dashboard registry", () => {
  it("registers a detailed dashboard component for every non-ops child route", () => {
    const nonOpsChildren = ANALYTICS_SUB_SECTIONS.filter(
      (section) => !NON_INTEGRATION_DOMAINS.has(section.dataDomain)
    );

    for (const child of nonOpsChildren) {
      expect(INTEGRATION_CHILD_DASHBOARD_REGISTRY[child.id]).toBeDefined();
    }
  });
});
