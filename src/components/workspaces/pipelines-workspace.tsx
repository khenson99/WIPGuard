import { WorkspaceHome } from "./workspace-home";
import type { WorkspacePageModel } from "./workspace-model";

const MODEL: WorkspacePageModel = {
  eyebrow: "Automation Pipelines",
  title: "Pipeline Operations",
  summary:
    "Operate ingestion, metric refresh, report generation, AI analysis, recommendations, approvals, artifacts, failures, and replay from one pipeline surface.",
  primaryAction: { href: "/api/automations", label: "Automation API" },
  secondaryAction: { href: "/pipelines/artifacts", label: "Artifact inbox" },
  stats: [
    { label: "Runtime", value: "Workflow graph", detail: "Definitions, nodes, edges, runs, steps, approvals, and trigger cursors remain intact." },
    { label: "AI jobs", value: "Auditable", detail: "Source documents, jobs, artifacts, and recommendations are persisted." },
    { label: "Controls", value: "Approval gated", detail: "Risky recommendations stay behind explicit approvals." },
  ],
  records: [
    {
      title: "Workflow definitions and runs",
      description: "System-managed and private workflows, run history, step status, errors, and provider triggers.",
      href: "/api/automations",
      label: "Open endpoint",
    },
    {
      title: "Artifacts and recommendations",
      description: "AI-generated outputs, recommendation states, approval requirements, execution results, and errors.",
      href: "/api/automations/artifacts",
      label: "Open artifacts",
    },
    {
      title: "Approval inbox",
      description: "Human approval remains the boundary for outbound, spend-changing, or customer-facing actions.",
      href: "/api/automations/approvals",
      label: "Open approvals",
    },
  ],
  preservedSystems: [
    "Workflow runtime and store",
    "OpenAI background job integration",
    "Recommendation approval and execution APIs",
    "Automation source documents and artifacts",
    "Dispatch and ingestion endpoints",
  ],
};

export function PipelinesWorkspace() {
  return <WorkspaceHome model={MODEL} />;
}
