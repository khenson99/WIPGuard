import Link from "next/link";
import { ArrowUpRight, BarChart3, CheckCircle2, ShieldAlert } from "lucide-react";
import type { CeoMetricSnapshotPayload } from "@/lib/ceo/service";
import { AdvancedDeveloperLinks } from "./advanced-developer-links";

interface MetricRow {
  key: string;
  label: string;
  status: string;
  department: string;
  unit: string;
  warnings: readonly string[];
}

const DASHBOARDS = [
  { title: "Company Tracker", href: "/metrics/company", description: "Founder cockpit for revenue, burn, runway, funnel, activation, and operating risk." },
  { title: "Customer Health", href: "/metrics/customer-health", description: "Portfolio health, account coverage, renewal risk, and customer-success source quality." },
  { title: "Expenses", href: "/metrics/expenses", description: "Finance dashboard for spend, vendors, categories, runway, variance, and planning inputs." },
  { title: "Goals", href: "/goals", description: "Company goals and progress tied to Linear projects and operating priorities." },
];

function emptySnapshot(): CeoMetricSnapshotPayload {
  const now = new Date().toISOString();
  return { generatedAt: now, periodStart: now, periodEnd: now, definitions: [], metrics: [], reportPacks: [], trustSummary: { fresh: 0, stale: 0, partial: 0, missing: 0, error: 0, conflicted: 0 }, readiness: { status: "not_board_final", ready: false, summary: "CEO metric readiness requires organization context.", failingGates: [] } };
}

export function MetricsWorkspace({ metrics = [], ceoSnapshot = emptySnapshot() }: { metrics?: readonly MetricRow[]; ceoSnapshot?: CeoMetricSnapshotPayload }) {
  const ready = metrics.filter((metric) => metric.status === "ready").length;
  const missing = metrics.filter((metric) => metric.status === "missing").length;
  const warnings = metrics.flatMap((metric) => metric.warnings.map((warning) => ({ metric, warning }))).slice(0, 6);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Metrics</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Metrics Command Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Open the real dashboards first; use the canonical APIs only when debugging metric payloads and lineage.</p>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Dashboard readiness</p><p className="mt-2 text-2xl font-semibold">{ready}/{metrics.length}</p><p className="mt-2 text-xs text-muted-foreground">Canonical metrics currently ready.</p></article>
          <article className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">CEO trust</p><p className="mt-2 text-2xl font-semibold">{ceoSnapshot.trustSummary.fresh ?? 0} fresh</p><p className="mt-2 text-xs text-muted-foreground">{ceoSnapshot.readiness.summary}</p></article>
          <article className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Readiness</p><p className="mt-2 text-2xl font-semibold">{ceoSnapshot.readiness.ready ? "Ready" : "Blocked"}</p><p className="mt-2 text-xs text-muted-foreground">{ceoSnapshot.readiness.failingGates.length} failing gates.</p></article>
        </section>
        <section className="grid gap-3 md:grid-cols-2">
          <p className="rounded-lg border border-border bg-card p-3 text-sm font-medium text-foreground">{ready} ready</p>
          <p className="rounded-lg border border-border bg-card p-3 text-sm font-medium text-foreground">{missing} missing</p>
        </section>
        <section className="grid gap-3 lg:grid-cols-4">
          {DASHBOARDS.map((dashboard) => (
            <Link key={dashboard.href} href={dashboard.href} aria-label={dashboard.title} className="rounded-lg border border-border bg-card p-4 hover:bg-secondary">
              <div className="flex items-center justify-between gap-3"><BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /></div>
              <h2 className="mt-3 text-sm font-semibold text-foreground">{dashboard.title}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{dashboard.description}</p>
            </Link>
          ))}
        </section>
        <section className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Metric Readiness</h2>
            <div className="mt-3 space-y-2">{metrics.slice(0, 8).map((metric) => <p key={metric.key} className="flex items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2 text-xs"><span>{metric.label}</span><span className="capitalize text-muted-foreground">{metric.status}</span></p>)}</div>
          </article>
          <article className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Trust Warnings</h2>
            {warnings.length === 0 ? <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />No metric warnings reported.</p> : <div className="mt-3 space-y-2">{warnings.map(({ metric, warning }) => <p key={`${metric.key}-${warning}`} className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"><ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span><span className="font-medium">{metric.label}:</span> {warning}</span></p>)}</div>}
          </article>
        </section>
        <AdvancedDeveloperLinks links={[
          { href: "/api/imladris/metrics", label: "Canonical metric API", description: "Raw canonical metric payload and lineage." },
          { href: "/api/ceo/metrics", label: "CEO metric API", description: "CEO snapshot, trust summary, and report readiness." },
          { href: "/api/analytics", label: "Analytics payload", description: "Legacy analytics source payloads." },
        ]} />
      </div>
    </div>
  );
}
