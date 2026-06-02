import { WorkspaceHome } from "./workspace-home";
import type { WorkspacePageModel } from "./workspace-model";

const MODEL: WorkspacePageModel = {
  eyebrow: "Automation Pipelines",
  title: "Artifact Inbox",
  summary:
    "Review generated source documents, AI outputs, recommendations, and execution evidence without reopening the old workflow-builder surface.",
  primaryAction: { href: "/api/automations/artifacts", label: "Artifacts API" },
  secondaryAction: { href: "/pipelines", label: "Pipeline operations" },
  stats: [
    { label: "Artifacts", value: "Persisted", detail: "Generated content remains tied to workflow runs and source documents." },
    { label: "Recommendations", value: "Traceable", detail: "Each recommendation stores status, approvals, execution result, and errors." },
    { label: "Review model", value: "Human gated", detail: "Approval-required actions stay separated from safe internal artifacts." },
  ],
  records: [
    {
      title: "Automation artifacts",
      description: "Drafts, summaries, analyses, content JSON, source references, run IDs, and operator metadata.",
      href: "/api/automations/artifacts",
      label: "Open endpoint",
    },
    {
      title: "Recommendations",
      description: "Actionable outputs with approval flags, decision notes, execution payloads, and resolution state.",
      href: "/api/automations/recommendations",
      label: "Open endpoint",
    },
    {
      title: "Workflow approvals",
      description: "Approval records keep human decisions explicit for customer-facing or spend-changing actions.",
      href: "/api/automations/approvals",
      label: "Open endpoint",
    },
  ],
  preservedSystems: [
    "AutomationArtifact persistence",
    "AutomationRecommendation persistence",
    "WorkflowApproval persistence",
    "Recommendation approve/reject/execute APIs",
  ],
};

export function PipelineArtifactsWorkspace() {
  return <WorkspaceHome model={MODEL} />;
}
