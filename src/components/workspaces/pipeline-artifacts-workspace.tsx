import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AutomationOperatorDashboard } from "@/lib/automations/operator-dashboard";
import { AdvancedDeveloperLinks } from "./advanced-developer-links";
import { RecommendationActions } from "./automation-action-buttons";

const EMPTY: AutomationOperatorDashboard = { workflows: [], approvals: [], recommendations: [], artifacts: [], recipes: [] };

export function PipelineArtifactsWorkspace({ data = EMPTY }: { data?: AutomationOperatorDashboard }) {
  const approvals = data.approvals ?? [];
  const recommendations = data.recommendations ?? [];
  const artifacts = data.artifacts ?? [];
  return (
    <div className="h-full overflow-y-auto p-4"><div className="mx-auto max-w-7xl space-y-5">
      <section className="border-b border-border pb-5"><p className="text-[11px] font-semibold uppercase text-muted-foreground">Automation Pipelines</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Artifact Inbox</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Inspect generated artifacts, recommendations, execution evidence, and review actions.</p></div><Link href="/pipelines" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Pipeline operations<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div></section>
      <section className="grid gap-3 md:grid-cols-3">{[["Artifacts", artifacts.length], ["Recommendations", recommendations.length], ["Approvals", approvals.length]].map(([label, value]) => <article key={label} className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}</section>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold">Artifacts</h2><div className="mt-3 space-y-3">{artifacts.length === 0 ? <p className="text-xs text-muted-foreground">No artifacts available.</p> : artifacts.map((artifact) => <details key={artifact.id} className="rounded-md bg-secondary px-3 py-2 text-xs"><summary className="cursor-pointer font-medium">{artifact.title}</summary>{artifact.summary ? <p className="mt-2 text-muted-foreground">{artifact.summary}</p> : null}<p className="mt-2 text-muted-foreground">{artifact.artifactType} · {artifact.status}</p>{artifact.content ? <pre className="mt-2 max-h-56 overflow-auto rounded bg-card p-2">{artifact.content}</pre> : null}</details>)}</div></article>
        <article className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold">Recommendations</h2><div className="mt-3 space-y-3">{recommendations.length === 0 ? <p className="text-xs text-muted-foreground">No recommendations available.</p> : recommendations.map((rec) => <div key={rec.id} className="rounded-md bg-secondary px-3 py-2 text-xs"><p className="font-medium">{rec.title}</p><p className="mb-2 text-muted-foreground">{rec.summary}</p><RecommendationActions recommendationId={rec.id} title={rec.title} /></div>)}</div></article>
      </section>
      <AdvancedDeveloperLinks links={[{ href: "/api/automations/artifacts", label: "Artifacts API" }, { href: "/api/automations/recommendations", label: "Recommendations API" }, { href: "/api/automations/approvals", label: "Approvals API" }]} />
    </div></div>
  );
}
