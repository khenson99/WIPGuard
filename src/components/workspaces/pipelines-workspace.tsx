import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AutomationOperatorDashboard } from "@/lib/automations/operator-dashboard";
import { AdvancedDeveloperLinks } from "./advanced-developer-links";
import { ApprovalActions, RecommendationActions } from "./automation-action-buttons";

const EMPTY: AutomationOperatorDashboard = { workflows: [], approvals: [], recommendations: [], artifacts: [], recipes: [], playbooks: [] };

export function PipelinesWorkspace({ data = EMPTY }: { data?: AutomationOperatorDashboard }) {
  const workflows = data.workflows ?? [];
  const approvals = data.approvals ?? [];
  const recommendations = data.recommendations ?? [];
  const recipes = data.systemManagedRecipes ?? data.recipes ?? [];
  const playbooks = data.playbooks ?? [];
  return (
    <div className="h-full overflow-y-auto p-4"><div className="mx-auto max-w-7xl space-y-5">
      <section className="border-b border-border pb-5"><p className="text-[11px] font-semibold uppercase text-muted-foreground">Automation Pipelines</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Pipeline Operations</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Operate workflows, latest runs, recommendations, approvals, and provider recipes without opening JSON endpoints.</p></div><Link href="/pipelines/artifacts" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Artifact inbox<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div></section>
      <section className="grid gap-3 md:grid-cols-5">{[["Workflows", workflows.length], ["Pending approvals", approvals.length], ["Recommendations", recommendations.length], ["Playbooks", playbooks.length], ["System recipes", recipes.length]].map(([label, value]) => <article key={label} className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}</section>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold">Workflow Runs</h2><div className="mt-3 space-y-2">{workflows.length === 0 ? <p className="text-xs text-muted-foreground">No workflows available.</p> : workflows.map((workflow) => { const runError = workflow.latestRun?.error ?? workflow.lastError ?? null; return <div key={workflow.id} className="rounded-md bg-secondary px-3 py-2 text-xs"><div className="flex justify-between gap-3"><span className="font-medium">{workflow.name}</span><span className="capitalize text-muted-foreground">{workflow.status}</span></div><p className="mt-1 text-muted-foreground">Latest run {workflow.latestRun?.status ?? workflow.runs?.[0]?.status ?? "none"}</p>{runError ? <p className="mt-1 text-muted-foreground">{runError}</p> : null}</div>; })}</div></article>
        <article className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold">Approval Queue</h2><div className="mt-3 space-y-3">{approvals.length === 0 ? <p className="text-xs text-muted-foreground">No pending approvals.</p> : approvals.map((approval) => <div key={approval.id} className="rounded-md bg-secondary px-3 py-2 text-xs"><p className="font-medium">{approval.nodeKey}</p><p className="mb-2 text-muted-foreground">{approval.status} · {approval.createdAt}</p><ApprovalActions approvalId={approval.id} nodeKey={approval.nodeKey} /></div>)}</div></article>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Operator Playbooks</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {playbooks.length === 0 ? <p className="text-xs text-muted-foreground">No operating playbooks are configured.</p> : playbooks.map((playbook) => (
            <div key={playbook.id} className="rounded-md bg-secondary px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{playbook.title}</p>
                <span className="rounded border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">{playbook.priority} · {playbook.status}</span>
              </div>
              <p className="mt-2 text-muted-foreground">{playbook.summary}</p>
              <p className="mt-2 text-muted-foreground">Trigger: {playbook.trigger}</p>
              <p className="mt-2 font-medium">{playbook.requiresApproval ? "Approval gated" : "Operator review"}</p>
              <p className="mt-1 text-muted-foreground">{playbook.nextAction}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold">Recommendation Queue</h2><div className="mt-3 space-y-3">{recommendations.length === 0 ? <p className="text-xs text-muted-foreground">No recommendations waiting.</p> : recommendations.map((rec) => <div key={rec.id} className="rounded-md bg-secondary px-3 py-2 text-xs"><p className="font-medium">{rec.title}</p><p className="mb-2 text-muted-foreground">{rec.summary}</p><RecommendationActions recommendationId={rec.id} title={rec.title} /></div>)}</div></article>
        <article className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold">System Recipes</h2><div className="mt-3 space-y-2">{recipes.length === 0 ? <p className="text-xs text-muted-foreground">No provider recipes configured.</p> : recipes.map((recipe) => <p key={recipe.id} className="rounded-md bg-secondary px-3 py-2 text-xs"><span className="font-medium">{recipe.provider}</span> · {recipe.key} · {recipe.enabled === false ? "Disabled" : "Enabled"}</p>)}</div></article>
      </section>
      <AdvancedDeveloperLinks links={[{ href: "/api/automations", label: "Automation API" }, { href: "/api/automations/approvals", label: "Approvals API" }, { href: "/api/automations/recommendations", label: "Recommendations API" }]} />
    </div></div>
  );
}
