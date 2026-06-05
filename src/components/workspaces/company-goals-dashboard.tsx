"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  CompanyGoalSetupOption,
  CompanyGoalsDashboardData,
} from "@/lib/imladris/company-goals";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";

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
    record.date,
    record.timestamp,
    record.time,
    record.iso,
    record.isoString,
    record.iso_string,
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

function dateLabel(value: unknown): string {
  const normalizedValue = scalarValue(value);
  if (!normalizedValue) return "Missing";
  const parsed = new Date(normalizedValue as string | number | Date);
  if (Number.isNaN(parsed.getTime())) return "Missing";
  return parsed.toISOString().slice(0, 10);
}

function numberValue(value: unknown): number | null {
  return parseImladrisNumber(scalarValue(value));
}

function countLabel(value: unknown): string {
  const parsed = numberValue(value);
  return parsed === null ? "Missing" : parsed.toLocaleString();
}

function syncLabel(value: unknown): string {
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
  const progressPct = numberValue(goal.progressPct) ?? 0;

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
        <p className="text-2xl font-semibold text-foreground">{progressPct.toFixed(1)}%</p>
        <p className="text-sm font-medium text-muted-foreground">
          {countLabel(goal.completedIssueCount)} / {countLabel(goal.totalIssueCount)} issues
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%` }}
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
            <dd className="font-medium text-foreground">{countLabel(goal.blockedIssueCount)}</dd>
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

function GoalSetupPanel({ options }: { options: CompanyGoalSetupOption[] }) {
  const initialSelection = useMemo(
    () => options.filter((option) => option.tracked).map((option) => option.id),
    [options],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSet = new Set(selectedIds);

  const toggleSelection = (projectId: string) => {
    setMessage(null);
    setSelectedIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  };

  const saveSelection = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/goals/tracking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linearProjectIds: selectedIds }),
      });
      if (!response.ok) {
        setMessage("Could not save tracked goals.");
        return;
      }
      setMessage("Tracked goals saved.");
    } catch {
      setMessage("Could not save tracked goals.");
    } finally {
      setSaving(false);
    }
  };

  if (options.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Goal Setup</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Choose which synced Linear projects should be tracked as company goals.
          </p>
        </div>
        <button
          type="button"
          onClick={saveSelection}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Target className="h-4 w-4" aria-hidden="true" />
          {saving ? "Saving..." : "Save tracked goals"}
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(option.id)}
              onChange={() => toggleSelection(option.id)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{option.name}</span>
              <span className="block text-xs text-muted-foreground">{option.state}</span>
            </span>
          </label>
        ))}
      </div>

      {message ? (
        <p className="mt-3 text-xs font-medium text-muted-foreground">{message}</p>
      ) : null}
    </section>
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

        <GoalSetupPanel options={data.trackingSetup.options} />

        {data.emptyState ? (
          <section className="rounded-lg border border-dashed border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground">{data.emptyState.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {data.emptyState.description}
            </p>
            <Link
              href="/settings?tab=integrations"
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Open Integrations
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
