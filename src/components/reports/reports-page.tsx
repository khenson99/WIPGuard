"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileDown, PlayCircle } from "lucide-react";
import type { CeoReportPack, CeoReportRun } from "@/lib/ceo/metric-trust";

interface ReportsPayload {
  reportPacks: CeoReportPack[];
}

export function ReportsPage() {
  const [packs, setPacks] = useState<CeoReportPack[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [run, setRun] = useState<CeoReportRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/ceo/reports", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Report pack request failed (${response.status})`);
      }
      const payload = (await response.json()) as ReportsPayload;
      setPacks(payload.reportPacks);
      setSelectedSlug((current) => current ?? payload.reportPacks[0]?.slug ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load report packs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async (packSlug: string) => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/ceo/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packSlug }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Report generation failed (${response.status})`);
      }
      setRun((await response.json()) as CeoReportRun);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Could not generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const selectedPack = packs.find((pack) => pack.slug === selectedSlug) ?? packs[0] ?? null;

  if (loading) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading report packs...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground">
            Generated CEO, investor, weekly, and custom report packs backed by the same trusted metric values.
          </p>
        </div>
        {selectedPack ? (
          <button
            type="button"
            onClick={() => void generate(selectedPack.slug)}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {generating ? "Generating..." : "Generate selected pack"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Available Packs</h2>
          {packs.map((pack) => (
            <button
              key={pack.slug}
              type="button"
              onClick={() => setSelectedSlug(pack.slug)}
              className={`w-full rounded-xl border bg-card p-4 text-left transition-colors ${
                selectedPack?.slug === pack.slug ? "border-primary/50" : "border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{pack.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{pack.description}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {pack.cadence}
                </span>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {pack.metricKeys.length} metrics · {pack.audience}
              </p>
            </button>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Generated Output</h2>
          {run ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{run.packName}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Generated {new Date(run.generatedAt).toLocaleString()} · {run.slideJson.readiness.summary}
                    </p>
                  </div>
                  <FileDown className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                {run.deterministicNotes.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {run.deterministicNotes.join(" ")}
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Markdown</p>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-foreground">{run.markdown}</pre>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">CSV</p>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-foreground">{run.csv}</pre>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Slide JSON</p>
                <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                  {JSON.stringify(run.slideJson, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Select a report pack and generate it to preview markdown, CSV, slide JSON, readiness, and trust warnings.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
