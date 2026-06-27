import Link from "next/link";
import { ArrowUpRight, DatabaseZap, ShieldAlert, ShieldCheck } from "lucide-react";
import { AdvancedDeveloperLinks } from "./advanced-developer-links";

interface SourceSyncRun {
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  recordCount: number | null | undefined;
  acceptedCount: number | null | undefined;
  errorCount: number | null | undefined;
  lastError: string | null;
}

interface SourceRow {
  key: string;
  label: string;
  status: string;
  connected: boolean;
  ready?: boolean;
  credentialConnected?: boolean;
  connectionStatus?: string;
  lastSyncedAt: string | null;
  lastSnapshotAt: string | null;
  lastError: string | null;
  freshness: { slaHours: number; staleAfter: string | null; ageHours: number | null };
  historicalCoverage: {
    latestWindowStart: string | null;
    latestWindowEnd: string | null;
    hasRequiredLookback: boolean | null;
    hasFreshWindowEnd: boolean | null;
  };
  latestSyncRun: SourceSyncRun | null;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid date" : date.toISOString().slice(0, 16).replace("T", " ");
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "connected" ? "text-emerald-700 border-emerald-200 bg-emerald-50" : status === "error" ? "text-red-700 border-red-200 bg-red-50" : "text-amber-700 border-amber-200 bg-amber-50";
  return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${tone}`}>{status}</span>;
}

function SummaryCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof ShieldCheck }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function SourceHealthRow({ source }: { source: SourceRow }) {
  const run = source.latestSyncRun;
  const error = source.lastError ?? run?.lastError ?? null;
  const coverage = source.historicalCoverage.hasRequiredLookback && source.historicalCoverage.hasFreshWindowEnd ? "Full lookback" : run ? "Partial window" : "No sync window";

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{source.label}</h2>
            <StatusBadge status={source.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Last sync {dateLabel(source.lastSyncedAt)} · SLA {source.freshness.slaHours}h</p>
        </div>
        <p className="text-xs font-medium text-muted-foreground">{coverage}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-4">
        <div><dt>Records</dt><dd className="font-medium text-foreground">{(run?.recordCount ?? 0).toLocaleString()} records</dd></div>
        <div><dt>Accepted</dt><dd className="font-medium text-foreground">{(run?.acceptedCount ?? 0).toLocaleString()} accepted</dd></div>
        <div><dt>Errors</dt><dd className="font-medium text-foreground">{(run?.errorCount ?? 0).toLocaleString()} errors</dd></div>
        <div><dt>Snapshot</dt><dd className="font-medium text-foreground">{dateLabel(source.lastSnapshotAt)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Window {dateLabel(source.historicalCoverage.latestWindowStart)} to {dateLabel(source.historicalCoverage.latestWindowEnd)} · Stale after {dateLabel(source.freshness.staleAfter)}</p>
      {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    </article>
  );
}

export function SourcesWorkspace({ sources = [] }: { sources?: readonly SourceRow[] }) {
  const ready = sources.filter((source) => source.ready ?? source.status === "connected").length;
  const needsAttention = sources.filter((source) => ["missing", "partial", "stale", "error"].includes(source.status)).length;
  const errorCount = sources.reduce((sum, source) => sum + (source.latestSyncRun?.errorCount ?? 0), 0);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Sources</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold text-foreground">Source Control Room</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Monitor provider connection state, freshness, sync coverage, and raw-record intake before metrics become trusted.</p>
            </div>
            <Link href="#connections" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Manage connections
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Ready sources" value={`${ready}/${sources.length}`} detail="Providers with fresh enough evidence for metric materialization." icon={ShieldCheck} />
          <SummaryCard label="Needs attention" value={String(needsAttention)} detail="Missing, stale, partial, or errored provider evidence." icon={ShieldAlert} />
          <SummaryCard label="Record errors" value={String(errorCount)} detail="Errored records reported by latest sync runs." icon={DatabaseZap} />
        </section>
        <section id="connections" className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Provider Connections</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Manage provider OAuth and token connections from Settings while this room shows current source health.</p>
          <Link href="/settings" className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground">
            Open settings
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
        {sources.length === 0 ? <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No source definitions are available.</section> : <section className="grid gap-3 lg:grid-cols-2">{sources.map((source) => <SourceHealthRow key={source.key} source={source} />)}</section>}
        <AdvancedDeveloperLinks links={[
          { href: "/api/integrations", label: "Integrations API", description: "Connection metadata, credentials state, and provider sync health." },
          { href: "/api/imladris/sources", label: "Imladris sources API", description: "Raw source readiness payload used by this control room." },
          { href: "/api/integrations/sync", label: "Integration sync API", description: "Manual sync entrypoint for provider rules." },
        ]} />
      </div>
    </div>
  );
}
