import { WorkspaceHome } from "./workspace-home";
import type { WorkspacePageModel } from "./workspace-model";

const MODEL: WorkspacePageModel = {
  eyebrow: "Metrics",
  title: "Canonical Metric Layer",
  summary:
    "Compute one governed value per business metric, with freshness, confidence, warnings, calculation version, and source lineage attached.",
  primaryAction: { href: "/api/ceo/metrics", label: "CEO metric API" },
  secondaryAction: { href: "/api/imladris/metrics", label: "Canonical metric API" },
  stats: [
    { label: "Trust model", value: "Freshness + confidence", detail: "Metric values carry status and warnings instead of silent drift." },
    { label: "Calculation layer", value: "Versioned", detail: "Reusable definitions keep dashboards and reports aligned." },
    { label: "Lineage", value: "Source cited", detail: "Metric values link back to raw records and source snapshots." },
  ],
  records: [
    {
      title: "Canonical metric values",
      description: "Imladris metric facts by department, period, unit, status, confidence, warning, and calculation version.",
      href: "/api/imladris/metrics",
      label: "Open endpoint",
    },
    {
      title: "CEO metric definitions",
      description: "Executive metric definitions, current values, trust summaries, readiness, and report-pack usage.",
      href: "/api/ceo/metrics",
      label: "Open endpoint",
    },
    {
      title: "Kanban engagement benchmark",
      description: "Google Analytics can attach googleAnalytics.kanbanBounceComparison to compare Free Kanban Generator engagement against site and peer pages.",
      href: "/api/analytics",
      label: "Open analytics payload",
    },
    {
      title: "Legacy analytics fetchers",
      description: "Provider fetchers remain in the service layer as inputs, but the product surface now promotes only governed metrics.",
    },
  ],
  preservedSystems: [
    "Imladris raw and canonical metric services",
    "CEO metric trust service",
    "Provider snapshot and refresh utilities",
    "Metric lineage tables",
    "Focused API tests for integration behavior",
  ],
};

export function MetricsWorkspace() {
  return <WorkspaceHome model={MODEL} />;
}
