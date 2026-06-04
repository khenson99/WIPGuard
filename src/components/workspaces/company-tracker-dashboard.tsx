import {
  AlertTriangle,
  BadgeCheck,
  CircleDollarSign,
  Gauge,
  LineChart,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import type {
  CompanyTrackerDashboardData,
  CompanyGoalProgress,
  CompanyGoalRecommendation,
  CompanyHealthBand,
  CompanySourceCoverage,
  CompanyTrackerMetric,
} from "@/lib/imladris/company-tracker";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";

function formatCurrency(value: unknown, currency: string | null): string {
  const amount = numberValue(value);
  if (amount === null) return "Missing";
  const code = currency ?? "USD";
  const prefix = code === "USD" ? "$" : `${code} `;
  const absolute = Math.abs(amount);
  if (absolute >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(2)}m`;
  if (absolute >= 1_000) return `${prefix}${(amount / 1_000).toFixed(1)}k`;
  return `${prefix}${amount.toFixed(0)}`;
}

function formatNumber(value: unknown, unit?: string): string {
  const parsed = numberValue(value);
  if (parsed === null) return "Missing";
  if (unit === "months") return `${parsed.toFixed(1)} mo`;
  if (unit === "percent") return `${parsed.toFixed(1)}%`;
  if (unit === "ratio") return `${parsed.toFixed(2)}x`;
  return parsed.toLocaleString();
}

function scalarValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {};
  const attributes =
    data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)
      ? (data.attributes as Record<string, unknown>)
      : {};
  const candidates = [
    record.value,
    record.metricValue,
    record.metric_value,
    record.amount,
    record.number,
    record.count,
    record.total,
    record.balance,
    record.rate,
    record.score,
    record.months,
    attributes.value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
    if (normalized instanceof Date) return normalized;
  }

  return value;
}

function numberValue(value: unknown): number | null {
  const normalizedValue = scalarValue(value);
  if (typeof normalizedValue === "string" && normalizedValue.trim()) {
    const trimmed = normalizedValue.trim();
    const withoutPercent = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;
    return parseImladrisNumber(withoutPercent);
  }
  return parseImladrisNumber(normalizedValue);
}

function formatMetricValue(metric: CompanyTrackerMetric, currency: string): string {
  if (metric.status === "missing" || metric.status === "error") return "Missing";

  const payload =
    metric.value && typeof metric.value === "object" && !Array.isArray(metric.value)
      ? (metric.value as Record<string, unknown>)
      : {};
  const amount = numberValue(payload.amount);
  const score = numberValue(payload.score);
  const rate = numberValue(payload.rate);
  const ratio = numberValue(payload.ratio);
  const riskScore = numberValue(payload.riskScore);

  if (metric.key === "revenue.mrr") return formatCurrency(amount, currency);
  if (metric.key === "finance.net_burn") return formatCurrency(amount, currency);
  if (metric.key === "sales.qualified_pipeline") return formatCurrency(amount, currency);
  if (metric.key === "finance.cash_runway_months") {
    return formatNumber(numberValue(payload.months), "months");
  }
  if (ratio !== null) return formatNumber(ratio, "ratio");
  if (score !== null) return formatNumber(score);
  if (rate !== null) return formatNumber(rate, "percent");
  if (riskScore !== null) return formatNumber(riskScore);
  return metric.value === null ? "Missing" : "Available";
}

function confidencePercent(value: unknown): number {
  const parsed = numberValue(value);
  if (parsed === null) return 0;
  const ratio = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
  return Math.min(Math.max(ratio * 100, 0), 100);
}

function lineageLabel(value: unknown): string {
  const parsed = numberValue(value);
  return parsed === null ? "Missing" : parsed.toLocaleString();
}

function statusClasses(status: string): string {
  switch (status) {
    case "ready":
    case "strong":
    case "achieved":
    case "available":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "watch":
    case "stale":
    case "active":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
    case "critical":
    case "risk":
    case "error":
    case "missed":
    case "blocked":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${statusClasses(
        status,
      )}`}
    >
      {status}
    </span>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CircleDollarSign;
}) {
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

function GoalRow({ goal }: { goal: CompanyGoalProgress }) {
  const progressPct = numberValue(goal.progressPct) ?? 0;
  const currentValue = numberValue(goal.currentValue);
  const targetValue = numberValue(goal.targetValue);

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{goal.metric}</h3>
            <StatusBadge status={goal.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {goal.direction === "lower" ? "Lower is better" : "Higher is better"} · source{" "}
            {goal.sourceMetricKey ?? "missing"}
          </p>
        </div>
        <p className="text-sm font-semibold text-foreground">{progressPct.toFixed(1)}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Current {formatNumber(currentValue)}</span>
        <span>Target {formatNumber(targetValue)}</span>
        <span>Due {goal.deadline?.slice(0, 10) ?? "Missing"}</span>
      </div>
    </article>
  );
}

function GoalRecommendationRow({ goal, currency }: { goal: CompanyGoalRecommendation; currency: string }) {
  const current =
    goal.metric === "ARR" || goal.metric === "BURN_RATE"
      ? formatCurrency(goal.currentValue, currency)
      : formatNumber(goal.currentValue, goal.metric === "RUNWAY" ? "months" : undefined);
  const target =
    goal.metric === "ARR" || goal.metric === "BURN_RATE"
      ? formatCurrency(goal.targetValue, currency)
      : formatNumber(goal.targetValue, goal.metric === "RUNWAY" ? "months" : undefined);

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{goal.metric}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{goal.rationale}</p>
        </div>
        <StatusBadge status="watch" />
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt>Current</dt>
          <dd className="font-medium text-foreground">{current}</dd>
        </div>
        <div>
          <dt>Draft Target</dt>
          <dd className="font-medium text-foreground">{target}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd className="font-medium text-foreground">{goal.deadline.slice(0, 10)}</dd>
        </div>
      </dl>
      <p className="mt-3 break-words font-mono text-[11px] leading-5 text-muted-foreground">
        {goal.formula}
      </p>
    </article>
  );
}

function HealthBandCard({ band }: { band: CompanyHealthBand }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{band.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{band.detail}</p>
        </div>
        <StatusBadge status={band.status} />
      </div>
      <p className="mt-3 text-xl font-semibold text-foreground">
        {formatNumber(band.value, band.unit)}
      </p>
      <p className="mt-2 break-words font-mono text-[11px] leading-5 text-muted-foreground">
        {band.formula}
      </p>
    </article>
  );
}

function SourceCoverageRow({ source }: { source: CompanySourceCoverage }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{source.label}</h3>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{source.key}</p>
        </div>
        <StatusBadge status={source.status} />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{source.detail}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Last captured {source.lastCapturedAt?.slice(0, 10) ?? "Missing"}
      </p>
    </article>
  );
}

function GrowthMetricCard({ metric, currency }: { metric: CompanyTrackerMetric; currency: string }) {
  const confidence = confidencePercent(metric.confidence);
  const lineage = lineageLabel(metric.sourceLineageCount);

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{metric.label}</h3>
          <p className="mt-2 text-xl font-semibold text-foreground">
            {formatMetricValue(metric, currency)}
          </p>
        </div>
        <StatusBadge status={metric.status} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Confidence {confidence.toFixed(0)}% · lineage {lineage}
      </p>
    </article>
  );
}

function TrustRow({ metric }: { metric: CompanyTrackerMetric }) {
  const confidence = confidencePercent(metric.confidence);
  const lineage = lineageLabel(metric.sourceLineageCount);

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{metric.label}</h3>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{metric.key}</p>
        </div>
        <StatusBadge status={metric.status} />
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt>Confidence</dt>
          <dd className="font-medium text-foreground">{confidence.toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Lineage</dt>
          <dd className="font-medium text-foreground">{lineage}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd className="break-words font-medium text-foreground">
            {metric.calculationVersion ?? "Missing"}
          </dd>
        </div>
      </dl>
      {metric.warnings.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
          {metric.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {metric.caveats && metric.caveats.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
          {metric.caveats.map((caveat) => (
            <p key={caveat}>{caveat}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CompanyTrackerDashboard({ data }: { data: CompanyTrackerDashboardData }) {
  const growthMetrics = data.metrics.filter((metric) =>
    [
      "sales.qualified_pipeline",
      "marketing.pipeline_efficiency",
      "product.activation_rate",
      "customer_success.retention_risk",
    ].includes(metric.key),
  );
  const readyCount = numberValue(data.trust.summary.ready) ?? 0;
  const watchCount =
    (numberValue(data.trust.summary.missing) ?? 0) +
    (numberValue(data.trust.summary.stale) ?? 0) +
    (numberValue(data.trust.summary.error) ?? 0);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            Founder Cockpit
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold text-foreground">
                Company Tracker
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                ARR, revenue quality, cash, goals, and data trust from canonical Imladris metrics.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {readyCount.toLocaleString()} ready
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                {watchCount.toLocaleString()} watch
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Board Readiness</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Score {data.boardReadiness.score}/100 · {data.boardReadiness.requiredActionCount} actions
                </p>
              </div>
              <StatusBadge status={data.boardReadiness.status} />
            </div>
            {data.boardReadiness.blockers.length > 0 ? (
              <div className="mt-4 space-y-1 text-xs leading-5 text-muted-foreground">
                {data.boardReadiness.blockers.map((blocker) => (
                  <p key={blocker}>{blocker}</p>
                ))}
              </div>
            ) : null}
            {data.boardReadiness.requiredActions.length > 0 ? (
              <div className="mt-4 space-y-1 text-xs leading-5 text-muted-foreground">
                {data.boardReadiness.requiredActions.map((action) => (
                  <p key={action}>{action}</p>
                ))}
              </div>
            ) : null}
            {data.boardReadiness.caveats.length > 0 ? (
              <div className="mt-4 space-y-1 text-xs leading-5 text-muted-foreground">
                {data.boardReadiness.caveats.map((caveat) => (
                  <p key={caveat}>{caveat}</p>
                ))}
              </div>
            ) : null}
          </article>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Draft Board Targets</h2>
            {data.goalRecommendations.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {data.goalRecommendations.map((goal) => (
                  <GoalRecommendationRow
                    key={goal.metric}
                    goal={goal}
                    currency={data.summary.currency}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Configured FinancialGoal records cover the board target set.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="ARR"
            value={formatCurrency(data.summary.arr, data.summary.currency)}
            detail="revenue.mrr.value.arr, or MRR x 12 when ARR is absent."
            icon={TrendingUp}
          />
          <KpiCard
            label="MRR"
            value={formatCurrency(data.summary.mrr, data.summary.currency)}
            detail="Normalized monthly recurring revenue."
            icon={CircleDollarSign}
          />
          <KpiCard
            label="Runway"
            value={formatNumber(data.summary.runwayMonths, "months")}
            detail={`Cash ${formatCurrency(data.summary.cashBalance, data.summary.currency)}`}
            icon={Gauge}
          />
          <KpiCard
            label="Net Burn"
            value={formatCurrency(data.summary.netBurn, data.summary.currency)}
            detail="finance.net_burn.value.amount"
            icon={LineChart}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Goal Progress</h2>
            </div>
            {data.goalProgress.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {data.goalProgress.map((goal) => (
                  <GoalRow key={goal.id} goal={goal} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                No active company goals are configured.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Health Bands</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.healthBands.map((band) => (
                <HealthBandCard key={band.id} band={band} />
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Growth Engine</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {growthMetrics.map((metric) => (
              <GrowthMetricCard key={metric.key} metric={metric} currency={data.summary.currency} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Source Coverage</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.sourceCoverage.map((source) => (
              <SourceCoverageRow key={source.key} source={source} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Data Trust</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusBadge status="ready" />
              <StatusBadge status="stale" />
              <StatusBadge status="missing" />
              <StatusBadge status="error" />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.metrics.map((metric) => (
              <TrustRow key={metric.key} metric={metric} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
