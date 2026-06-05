"use client";

import { useState } from "react";
import { FileText, Loader2, PackageCheck, ShieldAlert } from "lucide-react";
import type { CeoMetricSnapshotPayload, CreateCeoReportRunResult } from "@/lib/ceo/service";
import { AdvancedDeveloperLinks } from "./advanced-developer-links";

function emptySnapshot(): CeoMetricSnapshotPayload {
  const now = new Date().toISOString();
  return { generatedAt: now, periodStart: now, periodEnd: now, definitions: [], metrics: [], reportPacks: [], trustSummary: { fresh: 0, stale: 0, partial: 0, missing: 0, error: 0, conflicted: 0 }, readiness: { status: "not_board_final", ready: false, summary: "Report generation requires organization context.", failingGates: [] } };
}

export function ReportsWorkspace({ snapshot = emptySnapshot() }: { snapshot?: CeoMetricSnapshotPayload }) {
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CreateCeoReportRunResult | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  async function generatePack(packSlug: string) {
    setLoadingSlug(packSlug);
    setError(null);
    try {
      const response = await fetch("/api/ceo/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packSlug }) });
      const payload = (await response.json().catch(() => null)) as CreateCeoReportRunResult | { error?: string } | null;
      if (!response.ok) throw new Error(payload && "error" in payload && payload.error ? payload.error : "Could not generate report pack.");
      setRun(payload as CreateCeoReportRunResult);
      setOverrideReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate report pack.");
    } finally {
      setLoadingSlug(null);
    }
  }

  async function approveGeneratedRun() {
    if (!run?.id) return;
    setApproving(true);
    setError(null);
    try {
      const response = await fetch(`/api/ceo/reports/${run.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideReason: overrideReason.trim() || undefined }),
      });
      const payload = (await response.json().catch(() => null)) as CreateCeoReportRunResult | { error?: string } | null;
      if (!response.ok) throw new Error(payload && "error" in payload && payload.error ? payload.error : "Could not approve report pack.");
      setRun(payload as CreateCeoReportRunResult);
      setOverrideReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve report pack.");
    } finally {
      setApproving(false);
    }
  }

  const generatedRunNeedsOverride = run ? run.slideJson.readiness.ready !== true && !run.boardFinal : false;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Reports</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Executive Report Packs</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Generate CEO, board, investor, and operating packs from the trusted metric snapshot used by dashboards.</p>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Available packs</p><p className="mt-2 text-2xl font-semibold">{snapshot.reportPacks.length}</p><p className="mt-2 text-xs text-muted-foreground">Reusable definitions by audience and cadence.</p></article>
          <article className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Readiness</p><p className="mt-2 text-2xl font-semibold">{snapshot.readiness.ready ? "Ready" : "Blocked"}</p><p className="mt-2 text-xs text-muted-foreground">{snapshot.readiness.summary}</p></article>
          <article className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Fresh CEO metrics</p><p className="mt-2 text-2xl font-semibold">{snapshot.trustSummary.fresh ?? 0}</p><p className="mt-2 text-xs text-muted-foreground">Fresh metrics available for generation.</p></article>
        </section>
        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-3 lg:grid-cols-2">
          {snapshot.reportPacks.length === 0 ? <article className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No report pack definitions are available.</article> : snapshot.reportPacks.map((pack) => {
            const failing = snapshot.readiness.failingGates.filter((gate) => pack.metricKeys.includes(gate.metricKey));
            const loading = loadingSlug === pack.slug;
            return (
              <article key={pack.slug} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-sm font-semibold">{pack.name}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{pack.description}</p></div>
                  <button type="button" onClick={() => void generatePack(pack.slug)} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}Generate {pack.name}</button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{pack.audience} · {pack.cadence.replaceAll("_", " ")} · {pack.metricKeys.length} metrics · {pack.sections.length} sections</p>
                {failing.length > 0 ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{failing.length} readiness warning{failing.length === 1 ? "" : "s"}<div className="mt-2 space-y-1">{failing.map((gate) => <p key={`${pack.slug}-${gate.metricKey}-${gate.reason}`}>{gate.reason}</p>)}</div></div> : <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><PackageCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Pack metrics pass current readiness gates.</div>}
              </article>
            );
          })}
        </section>
        {run ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Generated run {run.id ?? "not persisted"}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{run.packName} · {new Date(run.generatedAt).toISOString()}</p>
                <p className="mt-2 text-xs text-muted-foreground">{run.slideJson.readiness.summary}</p>
              </div>
              {run.boardFinal ? (
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">Board-final</span>
              ) : run.id ? (
                <button
                  type="button"
                  onClick={() => void approveGeneratedRun()}
                  disabled={approving || (generatedRunNeedsOverride && !overrideReason.trim())}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                  Approve board-final
                </button>
              ) : null}
            </div>
            {generatedRunNeedsOverride ? (
              <label className="mt-4 block text-xs font-medium text-muted-foreground">
                Override reason required
                <textarea
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  className="mt-2 min-h-20 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground"
                  placeholder="Record why this non-board-ready pack can be board-final."
                />
              </label>
            ) : null}
            {run.boardFinal?.overrideReason ? (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Override: {run.boardFinal.overrideReason}
              </p>
            ) : null}
            <pre className="mt-4 max-h-80 overflow-auto rounded-md bg-secondary p-3 text-xs">{run.markdown}</pre>
          </section>
        ) : null}
        <AdvancedDeveloperLinks links={[{ href: "/api/ceo/reports", label: "Report API", description: "List report packs and create CEO report runs." }, { href: "/api/ceo/metrics", label: "CEO metric API", description: "Metric snapshot and readiness payload." }]} />
      </div>
    </div>
  );
}
