import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Target,
} from "lucide-react";
import type {
  CompanyGoalRow,
  CompanyGoalsDashboardData,
} from "@/lib/imladris/company-goals";

function statusClasses(status: string): string {
  switch (status) {
    case "on_track":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "completed":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300";
    case "at_risk":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function dateLabel(value: string | null): string {
  if (!value) return "Missing";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Missing";
  return parsed.toISOString().slice(0, 10);
}

function syncLabel(value: string | null): string {
  if (!value) return "Never synced";
  return `Synced ${dateLabel(value)}`;
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Target;
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${statusClasses(
        status,
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function GoalCard({ goal }: { goal: CompanyGoalRow }) {
  const teamLabel = goal.teamLabels.length > 0 ? goal.teamLabels.join(", ") : "No team";

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{goal.name}</h2>
            <StatusBadge status={goal.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {teamLabel} · {goal.leadName ?? "No lead"} · {goal.state}
          </p>
        </div>
        {goal.url ? (
          <a
            href={goal.url}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Open Linear
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xl font-semibold text-foreground">{goal.progressPct.toFixed(1)}%</p>
        <p className="text-sm font-medium text-muted-foreground">
          {goal.completedIssueCount} / {goal.totalIssueCount} issues
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(Math.max(goal.progressPct, 0), 100)}%` }}
        />
      </div>

      <dl className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <div>
            <dt>Target</dt>
            <dd className="font-medium text-foreground">{dateLabel(goal.targetDate)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <div>
            <dt>Updated</dt>
            <dd className="font-medium text-foreground">{dateLabel(goal.updatedAt)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <div>
            <dt>Blocked</dt>
            <dd className="font-medium text-foreground">{goal.blockedIssueCount}</dd>
          </div>
        </div>
      </dl>

      {goal.warnings.length > 0 ? (
        <div className="mt-4 space-y-1 text-xs leading-5 text-muted-foreground">
          {goal.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CompanyGoalsDashboard({ data }: { data: CompanyGoalsDashboardData }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Goals
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold text-foreground">Company Goals</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Linear project goals, delivery progress, target dates, and attention signals.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {syncLabel(data.summary.latestSyncAt)}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Active goals"
            value={`${data.summary.totalActiveGoals} active`}
            detail="Linear projects currently planned, started, or paused."
            icon={Target}
          />
          <SummaryCard
            label="On track"
            value={`${data.summary.onTrackGoals} on track`}
            detail="Active projects without overdue, stale, or blocked signals."
            icon={CheckCircle2}
          />
          <SummaryCard
            label="At risk"
            value={`${data.summary.atRiskGoals} at risk`}
            detail="Active projects with overdue, stale, or blocked issue signals."
            icon={AlertTriangle}
          />
          <SummaryCard
            label="Completed"
            value={`${data.summary.completedRecently} recent`}
            detail="Projects completed during the recent Linear sync window."
            icon={Clock3}
          />
        </section>

        {data.emptyState ? (
          <section className="rounded-lg border border-dashed border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground">{data.emptyState.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {data.emptyState.description}
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Open integrations
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <section className="grid gap-3 lg:grid-cols-2">
            {data.goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
