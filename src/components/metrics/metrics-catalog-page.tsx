"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { CeoMetricValue, CeoReadiness, CeoReportPack } from "@/lib/ceo/metric-trust";

interface MetricsPayload {
  generatedAt: string;
  metrics: CeoMetricValue[];
  reportPacks: CeoReportPack[];
  trustSummary: Record<string, number>;
  readiness: CeoReadiness;
}

const TRUST_CLASS: Record<string, string> = {
  fresh: "text-emerald-600",
  stale: "text-amber-600",
  partial: "text-amber-600",
  missing: "text-muted-foreground",
  error: "text-destructive",
  conflicted: "text-destructive",
};

function formatValue(metric: CeoMetricValue): string {
  const value = metric.value;
  if (value === null || value === undefined || value === "") return "Missing";
  if (typeof value === "string") return value;
  if (metric.definition.unit === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (metric.definition.unit === "percent") {
    return `${Math.round(value * 100)}%`;
  }
  return new Intl.NumberFormat().format(value);
}

function reportUsage(metricKey: string, packs: CeoReportPack[]): string {
  const names = packs
    .filter((pack) => pack.metricKeys.includes(metricKey))
    .map((pack) => pack.name);
  return names.length > 0 ? names.join(", ") : "Not used in current report packs";
}

export function MetricsCatalogPage() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const response = await fetch("/api/ceo/metrics", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Metric catalog request failed (${response.status})`);
      }
      setData((await response.json()) as MetricsPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load metric catalog.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const domains = useMemo(() => {
    return Array.from(new Set((data?.metrics ?? []).map((metric) => metric.definition.domain))).sort();
  }, [data]);

  if (loading && !data) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading metric catalog...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Metrics</h1>
          <p className="text-xs text-muted-foreground">
            Canonical metric definitions, computed values, trust state, source lineage, and report usage from the current computed layer.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last generated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "Unknown"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/analytics/ceo"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            CEO Command Center
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Metrics</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{data.metrics.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Domains</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{domains.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Fresh</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600">{data.trustSummary.fresh ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Readiness</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{data.readiness.summary}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {data.metrics.map((metric) => (
              <article key={metric.definition.key} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{metric.definition.label}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{metric.definition.key}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase ${TRUST_CLASS[metric.trust.status] ?? "text-muted-foreground"}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {metric.trust.status}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold text-foreground">{formatValue(metric)}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.definition.description}</p>
                <div className="mt-4 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <p>Domain: <span className="text-foreground">{metric.definition.domain}</span></p>
                  <p>Version: <span className="text-foreground">{metric.definition.calculationVersion}</span></p>
                  <p>Sources: <span className="text-foreground">{metric.definition.sourceDependencies.join(", ")}</span></p>
                  <p>Reports: <span className="text-foreground">{reportUsage(metric.definition.key, data.reportPacks)}</span></p>
                </div>
                {metric.trust.warnings.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {metric.trust.warnings.join(" ")}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
