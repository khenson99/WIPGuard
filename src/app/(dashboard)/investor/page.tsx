import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadInvestorBoardPack } from "@/lib/investor/board-pack";
import type { InvestorBoardMetric, InvestorHealthyArrGrowthDriver } from "@/lib/investor/board-pack";
import { can, normalizeRole } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toISOString().slice(0, 10);
}

function formatMetricValue(value: number | string | null, unit: string | null): string {
  if (value === null || value === undefined || value === "") return "Missing";
  if (typeof value === "string") return value;
  if (unit === "currency") {
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`;
    if (absolute >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "months") return `${value.toFixed(1)} mo`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString();
}

function statusClass(status: string | null): string {
  if (status === "fresh" || status === "strong") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (status === "missing" || status === "error") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
}

function sourceLineageLabel(value: string[] | undefined): string | null {
  if (!Array.isArray(value)) return null;
  const sources = value.map((source) => source.trim()).filter((source) => source.length > 0);
  return sources.length > 0 ? sources.join(" · ") : null;
}

function sourceLineageEvidenceLabel(metric: Pick<InvestorBoardMetric, "sourceLineageCount" | "latestSourceCapturedAt">): string | null {
  const parts: string[] = [];
  const count = metric.sourceLineageCount;
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    const roundedCount = Math.trunc(count);
    parts.push(`${roundedCount} source ${roundedCount === 1 ? "record" : "records"}`);
  }

  if (metric.latestSourceCapturedAt) {
    const latest = dateLabel(metric.latestSourceCapturedAt);
    if (latest !== "Unknown") {
      parts.push(`latest ${latest}`);
    }
  }

  return parts.length > 0 ? `Evidence ${parts.join(" · ")}` : null;
}

function TrustBadge({ status }: { status: string | null }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusClass(status)}`}>
      {status ?? "unknown"}
    </span>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}

function DriverCard({ driver }: { driver: InvestorHealthyArrGrowthDriver }) {
  const sources = sourceLineageLabel(driver.sourceLineageKeys);
  const evidence = sourceLineageEvidenceLabel(driver);
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{driver.label}</h3>
        <TrustBadge status={driver.status} />
      </div>
      <p className="mt-3 text-xl font-semibold text-foreground">
        {formatMetricValue(driver.value, driver.unit)}
      </p>
      {sources ? <p className="mt-2 text-xs text-muted-foreground">Sources {sources}</p> : null}
      {evidence ? <p className="mt-2 text-xs text-muted-foreground">{evidence}</p> : null}
      <WarningList warnings={driver.warnings ?? []} />
    </article>
  );
}

function MetricCard({ metric }: { metric: InvestorBoardMetric }) {
  const delta = metric.delta === null ? null : metric.delta > 0 ? `+${metric.delta}` : `${metric.delta}`;
  const sources = sourceLineageLabel(metric.sourceLineageKeys);
  const evidence = sourceLineageEvidenceLabel(metric);
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{metric.label}</h3>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{metric.key}</p>
        </div>
        <TrustBadge status={metric.trust} />
      </div>
      <p className="mt-3 text-xl font-semibold text-foreground">
        {formatMetricValue(metric.value, metric.unit)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {delta ? `Delta ${delta}` : "Delta unavailable"} · as of {metric.asOf ? dateLabel(metric.asOf) : "Unknown"}
      </p>
      {sources ? <p className="mt-2 text-xs text-muted-foreground">Sources {sources}</p> : null}
      {evidence ? <p className="mt-2 text-xs text-muted-foreground">{evidence}</p> : null}
      <WarningList warnings={metric.warnings} />
    </article>
  );
}

export default async function InvestorPage() {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) {
    redirect("/login");
  }

  if (!can(normalizeRole(user.role), "investor.read")) {
    redirect("/metrics");
  }

  const data = await loadInvestorBoardPack({
    userId: user.id,
    organizationId: user.organizationId ?? null,
  });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Board-final monthly reporting
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">Investor</h1>
          </div>
          {data.pack ? (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              Approved {dateLabel(data.pack.boardFinal.approvedAt)}
            </div>
          ) : null}
        </header>

        {data.status === "empty" || !data.pack ? (
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground">
              {data.emptyState?.title ?? "No approved investor pack is available yet."}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {data.emptyState?.description ??
                "An Arda admin must approve a board-final monthly pack before investors can view it."}
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{data.pack.packName}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Generated {dateLabel(data.pack.generatedAt)}
                  </p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Board-final
                </div>
              </div>

              {data.pack.boardFinal.overrideReason ? (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  Override: {data.pack.boardFinal.overrideReason}
                </p>
              ) : null}

              {data.pack.deterministicNotes.length > 0 ? (
                <ul className="mt-5 space-y-2 text-sm leading-6 text-muted-foreground">
                  {data.pack.deterministicNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {data.pack.healthyArrGrowth.label}
                    </h2>
                    <TrustBadge status={data.pack.healthyArrGrowth.status} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {data.pack.healthyArrGrowth.summary}
                  </p>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">ARR</dt>
                    <dd className="font-semibold text-foreground">
                      ARR {formatMetricValue(data.pack.healthyArrGrowth.currentArr, "currency")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">MRR</dt>
                    <dd className="font-semibold text-foreground">
                      MRR {formatMetricValue(data.pack.healthyArrGrowth.currentMrr, "currency")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Delta</dt>
                    <dd className="font-semibold text-foreground">
                      Net new ARR {formatMetricValue(data.pack.healthyArrGrowth.netNewArr, "currency")}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {data.pack.healthyArrGrowth.drivers.map((driver) => (
                  <DriverCard key={driver.id} driver={driver} />
                ))}
              </div>
            </section>

            {data.pack.metrics.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Board-Final Metrics</h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.pack.metrics.map((metric) => (
                    <MetricCard key={metric.key} metric={metric} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Markdown</h2>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-xs leading-5 text-muted-foreground">
                  {data.pack.markdown}
                </pre>
              </article>
              <article className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">CSV</h2>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-xs leading-5 text-muted-foreground">
                  {data.pack.csv}
                </pre>
              </article>
              <article className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Slide JSON</h2>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-xs leading-5 text-muted-foreground">
                  {JSON.stringify(data.pack.slideJson, null, 2)}
                </pre>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
