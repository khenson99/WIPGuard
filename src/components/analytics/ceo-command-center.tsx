"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

type TrustStatus = "fresh" | "stale" | "partial" | "missing" | "error" | "conflicted";

interface CeoMetric {
  definition: {
    key: string;
    label: string;
    domain: string;
    unit: string;
    sourceDependencies: string[];
  };
  value: number | string | null;
  priorValue?: number | string | null;
  delta: number | null;
  details?: Array<{
    key: string;
    label: string;
    value: number | string | null;
    unit?: string;
  }>;
  asOf: string;
  trust: {
    status: TrustStatus;
    confidence: number;
    warnings: string[];
  };
}

interface CeoReportPack {
  slug: string;
  name: string;
  description: string;
  cadence: string;
  audience: string;
  metricKeys: string[];
}

interface CeoReadiness {
  status: "board_ready" | "not_board_final";
  ready: boolean;
  summary: string;
  failingGates: Array<{
    metricKey: string;
    label: string;
    reason: string;
  }>;
}

interface CeoMetricsPayload {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  trustSummary: Record<TrustStatus, number>;
  metrics: CeoMetric[];
  reportPacks: CeoReportPack[];
  readiness: CeoReadiness;
}

interface ReportRunPayload {
  id: string | null;
  packSlug: string;
  packName: string;
  markdown: string;
  csv: string;
  slideJson: unknown;
}

const TRUST_CLASS: Record<TrustStatus, string> = {
  fresh: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  stale: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  partial: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  missing: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  conflicted: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

const DOMAIN_LABELS: Record<string, string> = {
  ceo: "CEO",
  finance: "Finance",
  "sales-pipeline": "Sales",
  retention: "Retention",
  "customer-success": "Customer Success",
  "website-traffic": "Website",
  "social-media": "Social",
  "customer-journey": "Customer Journey",
  "demo-analytics": "Demo",
  "process-analytics": "Process",
};

function formatMetricValue(metric: CeoMetric): string {
  if (metric.value === null || metric.value === undefined || metric.value === "") return "Unavailable";
  if (typeof metric.value === "string") return metric.value;
  if (metric.definition.unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(metric.value);
  }
  if (metric.definition.unit === "percent") {
    return `${(metric.value * 100).toFixed(1)}%`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(metric.value);
}

function formatDetailValue(detail: NonNullable<CeoMetric["details"]>[number]): string {
  if (detail.value === null || detail.value === undefined || detail.value === "") return "Unavailable";
  if (typeof detail.value === "string") return detail.value;
  if (detail.unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(detail.value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(detail.value);
}

function formatDelta(delta: number | null): string | null {
  if (delta === null || delta === 0) return null;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

function TrustBadge({ status }: { status: TrustStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TRUST_CLASS[status]}`}>
      {status}
    </span>
  );
}

function MetricTile({ metric }: { metric: CeoMetric }) {
  const delta = formatDelta(metric.delta);
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{metric.definition.label}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {DOMAIN_LABELS[metric.definition.domain] ?? metric.definition.domain} · as of{" "}
            {new Date(metric.asOf).toLocaleString()}
          </p>
        </div>
        <TrustBadge status={metric.trust.status} />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-2xl font-semibold text-foreground">{formatMetricValue(metric)}</p>
        {delta ? <p className="pb-1 text-xs text-muted-foreground">{delta}</p> : null}
      </div>
      {metric.details && metric.details.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
          {metric.details.map((detail) => (
            <div key={detail.key} className="min-w-0">
              <dt className="truncate text-muted-foreground">{detail.label}</dt>
              <dd className="mt-0.5 truncate font-medium tabular-nums text-foreground">
                {formatDetailValue(detail)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {metric.trust.warnings.length > 0 ? (
        <div className="mt-3 space-y-1">
          {metric.trust.warnings.slice(0, 2).map((warning) => (
            <p key={warning} className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CeoCommandCenter() {
  const [reportRun, setReportRun] = useState<ReportRunPayload | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [creatingPack, setCreatingPack] = useState<string | null>(null);

  const resource = useDashboardResource<CeoMetricsPayload>({
    cacheKey: "ceo:metric-snapshot:v1",
    deps: [],
    load: async ({ signal }) => {
      const response = await fetch("/api/ceo/metrics", { signal, cache: "no-store" });
      if (!response.ok) {
        throw new Error(`CEO metrics request failed (${response.status})`);
      }
      return (await response.json()) as CeoMetricsPayload;
    },
    getLastUpdatedAt: (payload) => payload.generatedAt,
    mapError: (error) => {
      if (error instanceof Error && error.message) return error.message;
      return "Could not load CEO metrics.";
    },
  });

  const metricsByDomain = useMemo(() => {
    const groups = new Map<string, CeoMetric[]>();
    for (const metric of resource.data?.metrics ?? []) {
      if (!metric.definition.key.startsWith("ceo.") && !["finance", "sales-pipeline", "retention", "customer-success", "website-traffic", "social-media"].includes(metric.definition.domain)) {
        continue;
      }
      const domain = metric.definition.domain;
      groups.set(domain, [...(groups.get(domain) ?? []), metric]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [resource.data]);

  async function createReport(packSlug: string) {
    setCreatingPack(packSlug);
    setReportError(null);
    try {
      const response = await fetch("/api/ceo/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packSlug }),
      });
      const payload = (await response.json().catch(() => null)) as ReportRunPayload | { error?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? `Report run failed (${response.status})`);
      }
      setReportRun(payload as ReportRunPayload);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not create report run.");
    } finally {
      setCreatingPack(null);
    }
  }

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading CEO command center..." />;
  }

  if (!resource.data) {
    return (
      <div className="p-4">
        <DashboardErrorBanner message={resource.error ?? "CEO metrics are unavailable."} onRetry={resource.refresh} />
      </div>
    );
  }

  const trustSummary = resource.data.trustSummary;
  const readiness = resource.data.readiness;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">CEO Command Center</h1>
          <p className="text-xs text-muted-foreground">
            Trusted operating metrics with source freshness, confidence, and report-pack exports.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last computed: {new Date(resource.data.generatedAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {resource.refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {(resource.error || resource.stale) && (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          label="Showing cached CEO metrics while the latest snapshot refreshes."
        />
      )}

      <section
        className={`rounded-lg border p-4 ${
          readiness.ready
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-amber-500/30 bg-amber-500/10"
        }`}
        aria-label="Board readiness"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Production readiness
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              {readiness.ready ? "Board-ready" : "Not board-final"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{readiness.summary}</p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
              readiness.ready
                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 text-amber-700 dark:text-amber-300"
            }`}
          >
            {readiness.status.replaceAll("_", " ")}
          </span>
        </div>
        {readiness.failingGates.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {readiness.failingGates.slice(0, 6).map((gate) => (
              <p key={`${gate.metricKey}:${gate.reason}`} className="flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">{gate.label}:</span> {gate.reason}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Trust summary">
        {Object.entries(trustSummary).map(([status, count]) => (
          <div key={status} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{status}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{count}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-4" aria-label="Report packs">
        {resource.data.reportPacks.map((pack) => (
          <article key={pack.slug} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">{pack.name}</h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{pack.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void createReport(pack.slug)}
              disabled={creatingPack !== null}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {creatingPack === pack.slug ? "Generating" : "Generate"}
            </button>
          </article>
        ))}
      </section>

      {reportError ? <DashboardErrorBanner message={reportError} onRetry={() => setReportError(null)} retryLabel="Dismiss" /> : null}

      {reportRun ? (
        <section className="rounded-lg border border-border bg-card p-4" aria-label="Latest report run">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{reportRun.packName}</h2>
              <p className="text-xs text-muted-foreground">Generated report run {reportRun.id ?? "not persisted"}</p>
            </div>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            {reportRun.markdown}
          </pre>
        </section>
      ) : null}

      <div className="space-y-4">
        {metricsByDomain.map(([domain, metrics]) => (
          <section key={domain} className="space-y-3" aria-label={`${DOMAIN_LABELS[domain] ?? domain} metrics`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{DOMAIN_LABELS[domain] ?? domain}</h2>
              <p className="text-xs text-muted-foreground">{metrics.length} metrics</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {metrics.map((metric) => (
                <MetricTile key={metric.definition.key} metric={metric} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
