"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  HeartPulse,
  LineChart,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CompanyTrackerDashboardData } from "@/lib/imladris/company-tracker";
import type { ExpenseDashboardData } from "@/lib/imladris/expense-dashboard";
import type { CustomerHealthDashboardData } from "@/lib/retention/customer-health-dashboard";

type DashboardLens = "founder" | "investor" | "board";
type SignalTone = "good" | "watch" | "risk" | "neutral";

interface ExecutiveMetricsDashboardProps {
  company: CompanyTrackerDashboardData;
  customerHealth: CustomerHealthDashboardData;
  expenses: ExpenseDashboardData;
}

interface ExecutiveMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: SignalTone;
  href: string;
  icon: LucideIcon;
}

interface DecisionSignal {
  label: string;
  value: string;
  detail: string;
  tone: SignalTone;
}

interface DashboardConfig {
  id: DashboardLens;
  label: string;
  title: string;
  eyebrow: string;
  summary: string;
  metricIds: string[];
  primaryAction: {
    href: string;
    label: string;
    icon: LucideIcon;
  };
}

const DASHBOARDS: DashboardConfig[] = [
  {
    id: "founder",
    label: "Founder",
    title: "Operating Cockpit",
    eyebrow: "Startup Operating Metrics",
    summary:
      "The company view founders need every week: growth, runway, customer risk, spend concentration, and data readiness.",
    metricIds: ["arr", "runway", "netBurn", "customerRisk"],
    primaryAction: {
      href: "/metrics/company",
      label: "Open company tracker",
      icon: Gauge,
    },
  },
  {
    id: "investor",
    label: "Investor",
    title: "Investor Update",
    eyebrow: "Investor Narrative",
    summary:
      "A clean read on scale, capital efficiency, customer proof, and whether the source data is strong enough to stand behind.",
    metricIds: ["arr", "pipeline", "healthyCustomers", "burnMultiple"],
    primaryAction: {
      href: "/reports",
      label: "Open reports",
      icon: ClipboardCheck,
    },
  },
  {
    id: "board",
    label: "Board",
    title: "Board Packet Readiness",
    eyebrow: "Board Review",
    summary:
      "Readiness, blockers, caveats, source coverage, and the operating questions that should be answered before the next board review.",
    metricIds: ["boardScore", "dataTrust", "goalCoverage", "sourceCoverage"],
    primaryAction: {
      href: "/sources",
      label: "Review sources",
      icon: ShieldCheck,
    },
  },
];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function formatCurrency(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Missing";
  const prefix = currency === "USD" ? "$" : `${currency} `;
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}${prefix}${(absolute / 1_000_000).toFixed(2)}m`;
  if (absolute >= 1_000) return `${sign}${prefix}${(absolute / 1_000).toFixed(1)}k`;
  return `${sign}${prefix}${absolute.toFixed(0)}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Missing";
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Missing";
  return `${value.toFixed(1)}%`;
}

function formatMonths(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Missing";
  return `${value.toFixed(1)} mo`;
}

function toneForRunway(runway: number | null): SignalTone {
  if (runway === null) return "risk";
  if (runway < 6) return "risk";
  if (runway < 12) return "watch";
  return "good";
}

function toneForPercent(value: number | null, goodAt: number, watchAt: number): SignalTone {
  if (value === null) return "neutral";
  if (value >= goodAt) return "good";
  if (value >= watchAt) return "watch";
  return "risk";
}

function toneForCount(value: number): SignalTone {
  if (value === 0) return "good";
  if (value <= 2) return "watch";
  return "risk";
}

function toneClasses(tone: SignalTone, selected = false): string {
  const base = selected ? "ring-2 ring-primary" : "";
  switch (tone) {
    case "good":
      return `${base} border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20`;
    case "watch":
      return `${base} border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20`;
    case "risk":
      return `${base} border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20`;
    default:
      return `${base} border-border bg-card`;
  }
}

function toneText(tone: SignalTone): string {
  switch (tone) {
    case "good":
      return "Strong";
    case "watch":
      return "Watch";
    case "risk":
      return "Risk";
    default:
      return "Review";
  }
}

function MetricButton({
  metric,
  selected,
  onSelect,
}: {
  metric: ExecutiveMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = metric.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-36 rounded-lg border p-4 text-left transition hover:border-primary/50 ${toneClasses(
        metric.tone,
        selected,
      )}`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
        </div>
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-3 inline-flex rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {toneText(metric.tone)}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
    </button>
  );
}

function ActionLink({
  href,
  label,
  icon: Icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          : "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function SignalRow({ signal }: { signal: DecisionSignal }) {
  return (
    <article className={`rounded-lg border p-4 ${toneClasses(signal.tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{signal.label}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{signal.detail}</p>
        </div>
        <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {signal.value}
        </span>
      </div>
    </article>
  );
}

function MiniBurnChart({
  months,
  values,
}: {
  months: string[];
  values: number[];
}) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));

  return (
    <div className="flex h-32 items-end gap-2 rounded-md bg-secondary p-4">
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">No burn history</p>
      ) : (
        values.map((value, index) => {
          const height = Math.max(8, Math.round((Math.abs(value) / max) * 88));
          const month = months[index] ?? "";
          return (
            <div key={`${month}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="w-full max-w-8 rounded-t-md bg-primary/80"
                style={{ height }}
                title={`${month}: ${formatCurrency(value)}`}
              />
              <span className="max-w-12 truncate text-[10px] text-muted-foreground">
                {month.slice(5)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function HealthDistribution({
  healthy,
  watch,
  risk,
}: {
  healthy: number;
  watch: number;
  risk: number;
}) {
  const total = Math.max(healthy + watch + risk, 1);

  return (
    <div className="rounded-md bg-secondary p-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        <div className="bg-emerald-500" style={{ width: `${(healthy / total) * 100}%` }} />
        <div className="bg-amber-500" style={{ width: `${(watch / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(risk / total) * 100}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
        <div>
          <dt>Healthy</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">{healthy}</dd>
        </div>
        <div>
          <dt>Watch</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">{watch}</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">{risk}</dd>
        </div>
      </dl>
    </div>
  );
}

function SourceCoverageGrid({
  sources,
}: {
  sources: CompanyTrackerDashboardData["sourceCoverage"];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {sources.slice(0, 6).map((source) => (
        <div key={source.key} className="rounded-md bg-secondary p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">{source.label}</p>
            <span className="rounded-md bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
              {source.status}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            {source.lastCapturedAt?.slice(0, 10) ?? "Missing capture"}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ExecutiveMetricsDashboard({
  company,
  customerHealth,
  expenses,
}: ExecutiveMetricsDashboardProps) {
  const [lens, setLens] = useState<DashboardLens>("founder");
  const dashboard = DASHBOARDS.find((item) => item.id === lens) ?? DASHBOARDS[0]!;
  const currency = company.summary.currency || "USD";
  const customerRisk =
    customerHealth.totals.atRiskAccounts +
    customerHealth.totals.onboardingRiskAccounts +
    customerHealth.totals.billingRiskAccounts;
  const customerWatch = customerHealth.totals.watchAccounts;
  const customerHealthyPct =
    customerHealth.totals.totalAccounts > 0
      ? (customerHealth.totals.healthyAccounts / customerHealth.totals.totalAccounts) * 100
      : null;
  const lirPct =
    customerHealth.totals.totalAccounts > 0
      ? (customerHealth.totals.lirPassingAccounts / customerHealth.totals.totalAccounts) * 100
      : null;
  const recentNetBurn = expenses.chartSeries.netBurn.slice(-3).filter(Number.isFinite);
  const avgNetBurn = recentNetBurn.length > 0 ? average(recentNetBurn) : num(company.summary.netBurn);
  const recentOutflows = expenses.chartSeries.operatingOutflows.slice(-3).filter(Number.isFinite);
  const recentGrossBurn = recentOutflows.length > 0 ? average(recentOutflows) : null;
  const cash = num(expenses.chartSeries.runwayCash) ?? num(company.summary.cashBalance);
  const runway = num(company.summary.runwayMonths) ?? (cash && avgNetBurn && avgNetBurn > 0 ? cash / avgNetBurn : null);
  const boardScore = company.boardReadiness.score;
  const dataReady = company.trust.summary.ready;
  const dataTotal =
    company.trust.summary.ready +
    (company.trust.summary.partial ?? 0) +
    company.trust.summary.stale +
    company.trust.summary.missing +
    company.trust.summary.error;
  const dataTrustPct = dataTotal > 0 ? (dataReady / dataTotal) * 100 : null;
  const sourceAvailable = company.sourceCoverage.filter((source) => source.status === "available").length;
  const sourceCoveragePct =
    company.sourceCoverage.length > 0 ? (sourceAvailable / company.sourceCoverage.length) * 100 : null;
  const goalCount = company.goalProgress.length;
  const achievedGoals = company.goalProgress.filter((goal) => goal.status === "achieved").length;
  const activeGoals = company.goalProgress.filter((goal) => goal.status === "active").length;
  const topCategory = useMemo(() => {
    return Object.entries(expenses.categoryTotals).sort((left, right) => right[1] - left[1])[0] ?? null;
  }, [expenses.categoryTotals]);
  const burnMonths = expenses.months.slice(-6);
  const burnValues = expenses.chartSeries.netBurn.slice(-6);

  const metrics = useMemo<ExecutiveMetric[]>(
    () => [
      {
        id: "arr",
        label: "ARR",
        value: formatCurrency(company.summary.arr, currency),
        detail: `${formatCurrency(company.summary.mrr, currency)} MRR from ${formatNumber(company.summary.activeSubscriptions)} active subscriptions.`,
        tone: company.summary.arr ? "good" : "risk",
        href: "/metrics/company",
        icon: TrendingUp,
      },
      {
        id: "runway",
        label: "Runway",
        value: formatMonths(runway),
        detail: `${formatCurrency(cash, currency)} cash against ${formatCurrency(avgNetBurn, currency)} average net burn.`,
        tone: toneForRunway(runway),
        href: "/metrics/expenses",
        icon: Wallet,
      },
      {
        id: "netBurn",
        label: "Net Burn",
        value: `${formatCurrency(avgNetBurn, currency)}/mo`,
        detail: `Gross burn is ${formatCurrency(recentGrossBurn, currency)}/mo over the latest three months.`,
        tone: avgNetBurn && avgNetBurn > 0 ? "watch" : "good",
        href: "/metrics/expenses",
        icon: CircleDollarSign,
      },
      {
        id: "customerRisk",
        label: "Customer Risk",
        value: formatNumber(customerRisk),
        detail: `${customerHealth.totals.totalAccounts} accounts tracked, ${customerHealth.totals.healthyAccounts} healthy.`,
        tone: toneForCount(customerRisk),
        href: "/metrics/customer-health",
        icon: AlertTriangle,
      },
      {
        id: "pipeline",
        label: "Qualified Pipeline",
        value: formatCurrency(company.summary.qualifiedPipeline, currency),
        detail: "Sales pipeline from governed company tracker inputs.",
        tone: company.summary.qualifiedPipeline ? "good" : "watch",
        href: "/metrics/company",
        icon: BriefcaseBusiness,
      },
      {
        id: "healthyCustomers",
        label: "Healthy Customers",
        value: formatPercent(customerHealthyPct),
        detail: `${formatPercent(lirPct)} LIR attainment across the customer portfolio.`,
        tone: toneForPercent(customerHealthyPct, 75, 50),
        href: "/metrics/customer-health",
        icon: HeartPulse,
      },
      {
        id: "burnMultiple",
        label: "Burn Multiple",
        value:
          company.summary.arr && avgNetBurn && avgNetBurn > 0
            ? `${(avgNetBurn / Math.max(company.summary.arr / 12, 1)).toFixed(2)}x`
            : "Missing",
        detail: "Monthly net burn compared with current ARR run-rate divided by 12.",
        tone:
          company.summary.arr && avgNetBurn && avgNetBurn > 0
            ? avgNetBurn / Math.max(company.summary.arr / 12, 1) <= 1
              ? "good"
              : "watch"
            : "neutral",
        href: "/metrics/expenses",
        icon: Gauge,
      },
      {
        id: "boardScore",
        label: "Board Readiness",
        value: `${boardScore}/100`,
        detail: `${company.boardReadiness.blockers.length} blockers and ${company.boardReadiness.requiredActionCount} required actions.`,
        tone: boardScore >= 90 ? "good" : boardScore >= 70 ? "watch" : "risk",
        href: "/metrics/company",
        icon: ClipboardCheck,
      },
      {
        id: "dataTrust",
        label: "Data Trust",
        value: formatPercent(dataTrustPct),
        detail: `${company.trust.summary.ready} ready, ${company.trust.summary.missing} missing, ${company.trust.summary.error} error.`,
        tone: toneForPercent(dataTrustPct, 80, 60),
        href: "/metrics/company",
        icon: ShieldCheck,
      },
      {
        id: "goalCoverage",
        label: "Goal Coverage",
        value: `${activeGoals + achievedGoals}/${Math.max(goalCount, 1)}`,
        detail: `${achievedGoals} achieved and ${activeGoals} active company goals.`,
        tone: goalCount === 0 ? "watch" : "good",
        href: "/goals",
        icon: BadgeCheck,
      },
      {
        id: "sourceCoverage",
        label: "Source Coverage",
        value: formatPercent(sourceCoveragePct),
        detail: `${sourceAvailable}/${company.sourceCoverage.length} required metric sources available.`,
        tone: toneForPercent(sourceCoveragePct, 80, 60),
        href: "/sources",
        icon: BarChart3,
      },
    ],
    [
      activeGoals,
      achievedGoals,
      avgNetBurn,
      boardScore,
      cash,
      company.boardReadiness.blockers.length,
      company.boardReadiness.requiredActionCount,
      company.sourceCoverage.length,
      company.summary.activeSubscriptions,
      company.summary.arr,
      company.summary.mrr,
      company.summary.qualifiedPipeline,
      company.trust.summary.error,
      company.trust.summary.missing,
      company.trust.summary.ready,
      currency,
      customerHealthyPct,
      customerHealth.totals.healthyAccounts,
      customerHealth.totals.totalAccounts,
      customerRisk,
      dataTrustPct,
      goalCount,
      lirPct,
      recentGrossBurn,
      runway,
      sourceAvailable,
      sourceCoveragePct,
    ],
  );

  const metricMap = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics]);
  const visibleMetrics = useMemo(
    () =>
      dashboard.metricIds
        .map((id) => metricMap.get(id))
        .filter((metric): metric is ExecutiveMetric => Boolean(metric)),
    [dashboard.metricIds, metricMap],
  );
  const [selectedMetricId, setSelectedMetricId] = useState<string>(visibleMetrics[0]?.id ?? "arr");
  const selectedMetric = metricMap.get(selectedMetricId) ?? visibleMetrics[0] ?? metrics[0]!;

  useEffect(() => {
    if (!visibleMetrics.some((metric) => metric.id === selectedMetricId) && visibleMetrics[0]) {
      setSelectedMetricId(visibleMetrics[0].id);
    }
  }, [selectedMetricId, visibleMetrics]);

  const decisionSignals: DecisionSignal[] = [
    {
      label: "Runway posture",
      value: toneText(toneForRunway(runway)),
      detail:
        runway === null
          ? "Runway cannot be trusted until cash and burn inputs are present."
          : runway < 12
            ? "Capital planning should stay visible in founder and investor conversations."
            : "Current runway gives the company room to operate against the plan.",
      tone: toneForRunway(runway),
    },
    {
      label: "Customer proof",
      value: `${customerRisk} risk`,
      detail:
        customerRisk > 0
          ? "The investor story needs a crisp account-by-account retention answer."
          : "Customer health is not showing urgent account risk in the materialized dataset.",
      tone: toneForCount(customerRisk),
    },
    {
      label: "Spend concentration",
      value: topCategory ? topCategory[0] : "Missing",
      detail: topCategory
        ? `${topCategory[0]} is the largest category at ${formatCurrency(topCategory[1], currency)} over the selected expense range.`
        : "Expense records have not produced category totals yet.",
      tone: topCategory && topCategory[1] > 0 ? "watch" : "neutral",
    },
    {
      label: "Metric defensibility",
      value: formatPercent(dataTrustPct),
      detail:
        dataTrustPct !== null && dataTrustPct >= 80
          ? "Most company metrics are ready for reporting."
          : "Metric trust should be cleaned up before sending an investor or board pack.",
      tone: toneForPercent(dataTrustPct, 80, 60),
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {dashboard.eyebrow}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {dashboard.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{dashboard.summary}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionLink
                href={dashboard.primaryAction.href}
                label={dashboard.primaryAction.label}
                icon={dashboard.primaryAction.icon}
                primary
              />
              <ActionLink href="/metrics/customer-health" label="Customer health" icon={HeartPulse} />
              <ActionLink href="/metrics/expenses" label="Expenses" icon={CircleDollarSign} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {DASHBOARDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setLens(item.id);
                const nextMetric = item.metricIds.map((id) => metricMap.get(id)).find(Boolean);
                if (nextMetric) setSelectedMetricId(nextMetric.id);
              }}
              className={
                lens === item.id
                  ? "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  : "rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              }
              aria-pressed={lens === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visibleMetrics.map((metric) => (
            <MetricButton
              key={metric.id}
              metric={metric}
              selected={selectedMetric.id === metric.id}
              onSelect={() => setSelectedMetricId(metric.id)}
            />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Selected Signal</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedMetric.detail}</p>
              </div>
              <Link
                href={selectedMetric.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Drill in
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Burn trend</p>
                <div className="mt-2">
                  <MiniBurnChart months={burnMonths} values={burnValues} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Customer distribution</p>
                <div className="mt-2">
                  <HealthDistribution
                    healthy={customerHealth.totals.healthyAccounts}
                    watch={customerWatch}
                    risk={customerRisk}
                  />
                </div>
              </div>
            </div>
          </article>

          <aside className="space-y-3">
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Decision Signals</h2>
            </div>
            {decisionSignals.map((signal) => (
              <SignalRow key={signal.label} signal={signal} />
            ))}
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Board Readiness</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {company.boardReadiness.status} with {company.boardReadiness.score}/100 readiness.
                </p>
              </div>
              <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                {company.boardReadiness.requiredActionCount} actions
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(Math.max(company.boardReadiness.score, 0), 100)}%` }}
              />
            </div>
            <div className="mt-4 space-y-2">
              {[...company.boardReadiness.blockers, ...company.boardReadiness.requiredActions, ...company.boardReadiness.caveats]
                .slice(0, 5)
                .map((item) => (
                  <p key={item} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {item}
                  </p>
                ))}
              {company.boardReadiness.blockers.length === 0 &&
              company.boardReadiness.requiredActions.length === 0 &&
              company.boardReadiness.caveats.length === 0 ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                  Board packet inputs are ready.
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Source Coverage</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {sourceAvailable}/{company.sourceCoverage.length} metric sources are available.
                </p>
              </div>
              <ActionLink href="/sources" label="Sources" icon={ShieldCheck} />
            </div>
            <div className="mt-4">
              <SourceCoverageGrid sources={company.sourceCoverage} />
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
