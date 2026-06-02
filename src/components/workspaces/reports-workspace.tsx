import { WorkspaceHome } from "./workspace-home";
import type { WorkspacePageModel } from "./workspace-model";

const MODEL: WorkspacePageModel = {
  eyebrow: "Reports",
  title: "Executive Report Packs",
  summary:
    "Generate CEO, investor, board, weekly, and custom materials from the same trusted metric values used by the command layer.",
  primaryAction: { href: "/api/ceo/reports", label: "Report API" },
  secondaryAction: { href: "/metrics", label: "Review metrics" },
  stats: [
    { label: "Outputs", value: "Markdown, CSV, slide JSON", detail: "Report runs keep deterministic notes and readiness warnings." },
    { label: "Audience", value: "CEO + investors", detail: "Packs are explicit about cadence, audience, and metric keys." },
    { label: "Fact reuse", value: "Locked values", detail: "Reports cite the same values as the metric layer." },
  ],
  records: [
    {
      title: "Report packs",
      description: "Reusable report definitions with cadence, audience, sections, default status, and metric keys.",
      href: "/api/ceo/reports",
      label: "Open endpoint",
    },
    {
      title: "Report runs",
      description: "Generated markdown, CSV, slide JSON, deterministic warnings, and optional AI draft output.",
    },
    {
      title: "Readiness checks",
      description: "Report generation surfaces missing, stale, partial, or conflicted metrics before material is reused.",
    },
  ],
  preservedSystems: [
    "CEO report pack data model",
    "Report generation API",
    "Metric readiness and trust warnings",
    "Stored report run artifacts",
  ],
};

export function ReportsWorkspace() {
  return <WorkspaceHome model={MODEL} />;
}
