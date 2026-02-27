"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import {
  CONFERENCE_DEADLINE_TYPE_LABELS,
  CONFERENCE_EXPENSE_CATEGORY_LABELS,
  CONFERENCE_LEAD_STATUS_LABELS,
  CONFERENCE_STATUS_LABELS,
  CONFERENCE_TYPE_LABELS,
  type ConferenceDeadlineType,
  type ConferenceDetailPayload,
  type ConferenceExpenseCategory,
  type ConferenceLeadStatus,
  type ConferenceStatus,
  type ConferenceType,
  type UserSummary,
} from "@/types";

type TabId = "overview" | "deadlines" | "budget" | "leads";

type TeamMember = UserSummary & { role?: string };
const TEAM_CACHE_KEY = "team:v1";

function resolveBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isoDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatMoney(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString();
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-lg px-3 py-2 text-sm font-medium",
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onSave,
  type = "text",
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  type?: string;
  onSave: (value: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = async () => {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if ((value ?? null) === next) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
        placeholder={placeholder}
        disabled={saving}
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onSave: (value: T) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => {
          const next = e.target.value as T;
          if (next === value) return;
          setSaving(true);
          void onSave(next).finally(() => setSaving(false));
        }}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
        disabled={saving}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ConferenceDetail({ conferenceId }: { conferenceId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const resource = useDashboardResource<ConferenceDetailPayload>({
    cacheKey: `dashboard:conference:${conferenceId}:v1`,
    deps: [conferenceId],
    load: async ({ signal, refresh }) => {
      const res = await fetch(`/api/conferences/${conferenceId}`, {
        signal,
        cache: refresh ? "no-store" : "default",
      });
      if (!res.ok) throw new Error(`Conference request failed (${res.status})`);
      return (await res.json()) as ConferenceDetailPayload;
    },
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? null,
    mapError: (error) => (error instanceof Error ? error.message : "Could not load conference."),
  });

  const conference = resource.data?.conference ?? null;
  const summary = resource.data?.summary ?? null;

  useEffect(() => {
    const cached = readSessionCache<TeamMember[]>(TEAM_CACHE_KEY);
    if (cached) setTeam(cached);

    fetch("/api/team")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Team request failed (${res.status})`))))
      .then((payload) => {
        const users = Array.isArray(payload) ? (payload as TeamMember[]) : [];
        setTeam(users);
        writeSessionCache(TEAM_CACHE_KEY, users);
      })
      .catch(() => {
        // Non-fatal; owner/assignee selects can remain empty.
      });
  }, []);

  const statusOptions = useMemo(() => {
    return Object.entries(CONFERENCE_STATUS_LABELS).map(([value, label]) => ({
      value: value as ConferenceStatus,
      label,
    }));
  }, []);

  const typeOptions = useMemo(() => {
    return Object.entries(CONFERENCE_TYPE_LABELS).map(([value, label]) => ({
      value: value as ConferenceType,
      label,
    }));
  }, []);

  const deadlineTypeOptions = useMemo(() => {
    return Object.entries(CONFERENCE_DEADLINE_TYPE_LABELS).map(([value, label]) => ({
      value: value as ConferenceDeadlineType,
      label,
    }));
  }, []);

  const expenseCategoryOptions = useMemo(() => {
    return Object.entries(CONFERENCE_EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({
      value: value as ConferenceExpenseCategory,
      label,
    }));
  }, []);

  const leadStatusOptions = useMemo(() => {
    return Object.entries(CONFERENCE_LEAD_STATUS_LABELS).map(([value, label]) => ({
      value: value as ConferenceLeadStatus,
      label,
    }));
  }, []);

  const updateConference = async (patch: Record<string, unknown>) => {
    setActionError(null);
    const res = await fetch(`/api/conferences/${conferenceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || `Update failed (${res.status}).`);
    }
    await resource.refresh();
  };

  const applyPlaybook = async () => {
    setActionError(null);
    setActionBusy(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/apply-playbook`, { method: "POST" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Playbook failed (${res.status}).`);
      }
      await resource.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to apply playbook.");
    } finally {
      setActionBusy(false);
    }
  };

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading conference..." className="h-[50vh]" />;
  }

  if (!resource.data) {
    return (
      <DashboardEmptyState
        title="Conference unavailable"
        message={resource.error ?? "No conference data available."}
        actionLabel="Back to Conferences"
        onAction={() => router.push("/conferences")}
      />
    );
  }

  if (!conference || !summary) {
    return (
      <DashboardEmptyState
        title="Conference unavailable"
        message={resource.error ?? "No conference data available."}
        actionLabel="Refresh now"
        onAction={resource.refresh}
      />
    );
  }

  const location = [conference.city, conference.region, conference.country].filter(Boolean).join(", ");
  const budgetCurrency = conference.budget?.currency ?? "USD";
  const budgetPlanned = summary.costs.plannedTotal;
  const budgetActual = summary.costs.actualTotal;

  const upcomingDeadlines = conference.deadlines
    .filter((d) => !d.completedAt)
    .slice()
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 5);

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...team.map((user) => ({ value: user.id, label: user.name || user.email })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push("/conferences")}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Conferences
          </button>

          <h1 className="truncate text-xl font-bold text-foreground">{conference.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(conference.startDate)} → {formatDate(conference.endDate)}
            {location ? ` • ${location}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {conference.primaryProject ? (
              <span>
                Primary project:{" "}
                <Link
                  href={`/projects/${conference.primaryProject.id}`}
                  className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {conference.primaryProject.name}
                </Link>
              </span>
            ) : (
              <span>Primary project: not seeded</span>
            )}
            {conference.websiteUrl ? (
              <a
                href={conference.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Website
              </a>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
            {resource.fromCache ? " (cache warm start)" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resource.refresh}
            disabled={resource.refreshing}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={clsx("h-4 w-4", resource.refreshing ? "animate-spin" : "")} />
              {resource.refreshing ? "Refreshing..." : "Refresh"}
            </span>
          </button>

          {!conference.primaryProjectId ? (
            <button
              type="button"
              onClick={() => setShowSeedConfirm(true)}
              disabled={actionBusy}
              className="btn-primary-theme inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              title="Seed projects, deadlines, and budget from playbook"
            >
              <CalendarPlus className="h-4 w-4" />
              {actionBusy ? "Seeding..." : "Seed Playbook"}
            </button>
          ) : null}
        </div>
      </div>

      {resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label="Showing cached conference while refresh retries."
        />
      ) : null}

      {resource.error ? <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} /> : null}
      {actionError ? (
        <DashboardErrorBanner message={actionError} onRetry={() => setActionError(null)} retryLabel="Dismiss" />
      ) : null}

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-secondary p-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              label="Name"
              value={conference.name}
              onSave={(value) => updateConference({ name: value ?? "" })}
              placeholder="Conference name"
            />
            <SelectField
              label="Status"
              value={conference.status}
              options={statusOptions}
              onSave={(value) => updateConference({ status: value })}
            />
            <SelectField
              label="Type"
              value={conference.type}
              options={typeOptions}
              onSave={(value) => updateConference({ type: value })}
            />
            <TextInput
              label="Timezone"
              value={conference.timezone || resolveBrowserTimezone()}
              onSave={(value) => updateConference({ timezone: value ?? "UTC" })}
              placeholder="America/Los_Angeles"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              label="Start Date"
              type="date"
              value={isoDate(conference.startDate)}
              onSave={(value) => updateConference({ startDate: value })}
            />
            <TextInput
              label="End Date"
              type="date"
              value={isoDate(conference.endDate)}
              onSave={(value) => updateConference({ endDate: value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label="Owner"
              value={(conference.ownerId ?? "") as string}
              options={ownerOptions}
              onSave={(value) => updateConference({ ownerId: value || null })}
            />
            <TextInput
              label="Website"
              value={conference.websiteUrl}
              placeholder="https://..."
              onSave={(value) => updateConference({ websiteUrl: value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <TextInput label="City" value={conference.city} onSave={(value) => updateConference({ city: value })} />
            <TextInput label="Region" value={conference.region} onSave={(value) => updateConference({ region: value })} />
            <TextInput label="Country" value={conference.country} onSave={(value) => updateConference({ country: value })} />
            <TextInput label="Venue" value={conference.venue} onSave={(value) => updateConference({ venue: value })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-secondary p-4 lg:grid-cols-2">
        <TextInput
          label="Slack Channel URL"
          value={conference.slackChannelUrl}
          placeholder="https://..."
          onSave={(value) => updateConference({ slackChannelUrl: value })}
        />
        <TextInput
          label="Slack Channel Name"
          value={conference.slackChannelName}
          placeholder="#events"
          onSave={(value) => updateConference({ slackChannelName: value })}
        />
        <TextInput
          label="Drive Folder URL"
          value={conference.driveFolderUrl}
          placeholder="https://..."
          onSave={(value) => updateConference({ driveFolderUrl: value })}
        />
        <TextInput
          label="Coda Doc URL"
          value={conference.codaDocUrl}
          placeholder="https://..."
          onSave={(value) => updateConference({ codaDocUrl: value })}
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-secondary p-2">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "deadlines"} onClick={() => setTab("deadlines")}>
          Deadlines
        </TabButton>
        <TabButton active={tab === "budget"} onClick={() => setTab("budget")}>
          Budget
        </TabButton>
        <TabButton active={tab === "leads"} onClick={() => setTab("leads")}>
          Leads
        </TabButton>
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Tasks"
              value={`${summary.tasks.done}/${summary.tasks.total}`}
              hint={`${summary.tasks.overdue} overdue`}
            />
            <SummaryCard
              label="Deadlines"
              value={`${summary.deadlines.completed}/${summary.deadlines.total}`}
              hint={`${summary.deadlines.overdue} overdue • next: ${summary.deadlines.nextDueAt ? formatDate(summary.deadlines.nextDueAt) : "—"}`}
            />
            <SummaryCard
              label="Budget"
              value={formatMoney(budgetPlanned, budgetCurrency)}
              hint={`Actual: ${formatMoney(budgetActual, budgetCurrency)} • Var: ${formatMoney(summary.costs.variance, budgetCurrency)}`}
            />
            <SummaryCard
              label="Leads"
              value={`${summary.leads.pushedCount}/${summary.leads.total}`}
              hint={`${summary.leads.followupOpenCount} follow-ups open`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-secondary p-4">
              <h2 className="text-sm font-semibold text-foreground">Upcoming Deadlines</h2>
              {upcomingDeadlines.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No upcoming deadlines.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {upcomingDeadlines.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {CONFERENCE_DEADLINE_TYPE_LABELS[d.type]} • due {formatDate(d.dueAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setTab("deadlines");
                        }}
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-secondary p-4">
              <h2 className="text-sm font-semibold text-foreground">Lead Status</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(summary.leads.byStatus).map(([status, count]) => (
                  <div key={status} className="rounded-lg border border-border/60 bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">
                      {CONFERENCE_LEAD_STATUS_LABELS[status as ConferenceLeadStatus] ?? status}
                    </p>
                    <p className="text-base font-semibold text-foreground">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "deadlines" ? (
        <DeadlinesTab
          conferenceId={conferenceId}
          deadlines={conference.deadlines}
          ownerOptions={ownerOptions}
          deadlineTypeOptions={deadlineTypeOptions}
          onRefresh={resource.refresh}
          setActionError={setActionError}
        />
      ) : null}

      {tab === "budget" ? (
        <BudgetTab
          conferenceId={conferenceId}
          currency={budgetCurrency}
          budget={conference.budget}
          expenses={conference.expenses}
          expenseCategoryOptions={expenseCategoryOptions}
          onRefresh={resource.refresh}
          setActionError={setActionError}
        />
      ) : null}

      {tab === "leads" ? (
        <LeadsTab
          conferenceId={conferenceId}
          leads={conference.leads}
          team={team}
          leadStatusOptions={leadStatusOptions}
          onRefresh={resource.refresh}
          setActionError={setActionError}
        />
      ) : null}

      {showSeedConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Seed Playbook</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will create projects, deadlines, and budget items from the playbook template.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSeedConfirm(false)}
                disabled={actionBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSeedConfirm(false);
                  void applyPlaybook();
                }}
                disabled={actionBusy}
                className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeadlinesTab({
  conferenceId,
  deadlines,
  ownerOptions,
  deadlineTypeOptions,
  onRefresh,
  setActionError,
}: {
  conferenceId: string;
  deadlines: ConferenceDetailPayload["conference"]["deadlines"];
  ownerOptions: Array<{ value: string; label: string }>;
  deadlineTypeOptions: Array<{ value: ConferenceDeadlineType; label: string }>;
  onRefresh: () => Promise<void>;
  setActionError: (value: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: "",
    type: "OTHER" as ConferenceDeadlineType,
    dueAt: isoDate(new Date().toISOString()),
    ownerId: "",
  }));

  const toggleCompleted = async (deadlineId: string, completed: boolean) => {
    setActionError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/deadlines/${deadlineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Update failed (${res.status}).`);
      }
      await onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update deadline.");
    } finally {
      setSaving(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!form.name.trim() || !form.dueAt) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/deadlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          dueAt: form.dueAt,
          ownerId: form.ownerId || undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Create failed (${res.status}).`);
      }
      setForm({ name: "", type: "OTHER", dueAt: form.dueAt, ownerId: "" });
      setCreating(false);
      await onRefresh();
    } catch (e2) {
      setActionError(e2 instanceof Error ? e2.message : "Failed to create deadline.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Deadlines</h2>
          <p className="mt-1 text-xs text-muted-foreground">Track key milestones and completion status.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {creating ? "Close" : "Add Deadline"}
        </button>
      </div>

      {creating ? (
        <form onSubmit={create} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-secondary p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              placeholder="e.g. Swag order placed"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as ConferenceDeadlineType }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {deadlineTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Due</label>
            <input
              type="date"
              value={form.dueAt}
              onChange={(e) => setForm((p) => ({ ...p, dueAt: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Owner</label>
            <select
              value={form.ownerId}
              onChange={(e) => setForm((p) => ({ ...p, ownerId: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {ownerOptions.map((opt) => (
                <option key={opt.value || "__none__"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-secondary">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Done</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {deadlines.length === 0 ? (
              <tr className="bg-card">
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No deadlines yet.
                </td>
              </tr>
            ) : (
              deadlines.map((deadline) => (
                <DeadlineRow
                  key={deadline.id}
                  conferenceId={conferenceId}
                  deadline={deadline}
                  saving={saving}
                  ownerOptions={ownerOptions}
                  deadlineTypeOptions={deadlineTypeOptions}
                  onToggleCompleted={toggleCompleted}
                  onRefresh={onRefresh}
                  setActionError={setActionError}
                  setSaving={setSaving}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeadlineRow({
  conferenceId,
  deadline,
  saving,
  ownerOptions,
  deadlineTypeOptions,
  onToggleCompleted,
  onRefresh,
  setActionError,
  setSaving,
}: {
  conferenceId: string;
  deadline: ConferenceDetailPayload["conference"]["deadlines"][number];
  saving: boolean;
  ownerOptions: Array<{ value: string; label: string }>;
  deadlineTypeOptions: Array<{ value: ConferenceDeadlineType; label: string }>;
  onToggleCompleted: (deadlineId: string, completed: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  setActionError: (value: string | null) => void;
  setSaving: (value: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    name: deadline.name,
    type: deadline.type,
    dueAt: isoDate(deadline.dueAt),
    ownerId: deadline.ownerId ?? "",
  }));

  useEffect(() => {
    setDraft({
      name: deadline.name,
      type: deadline.type,
      dueAt: isoDate(deadline.dueAt),
      ownerId: deadline.ownerId ?? "",
    });
  }, [deadline.dueAt, deadline.name, deadline.ownerId, deadline.type]);

  const save = async () => {
    setActionError(null);
    if (!draft.name.trim() || !draft.dueAt) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/deadlines/${deadline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          type: draft.type,
          dueAt: draft.dueAt,
          ownerId: draft.ownerId || null,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Update failed (${res.status}).`);
      }
      setEditing(false);
      await onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update deadline.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-card align-top hover:bg-secondary/40">
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          checked={Boolean(deadline.completedAt)}
          disabled={saving}
          onChange={(e) => void onToggleCompleted(deadline.id, e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <input
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
          />
        ) : (
          <div className="font-medium text-foreground">{deadline.name}</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {editing ? (
          <select
            value={draft.type}
            onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value as ConferenceDeadlineType }))}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
          >
            {deadlineTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          CONFERENCE_DEADLINE_TYPE_LABELS[deadline.type] ?? deadline.type
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {editing ? (
          <input
            type="date"
            value={draft.dueAt}
            onChange={(e) => setDraft((p) => ({ ...p, dueAt: e.target.value }))}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
          />
        ) : (
          formatDate(deadline.dueAt)
        )}
        {editing ? (
          <div className="mt-2">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Owner</label>
            <select
              value={draft.ownerId}
              onChange={(e) => setDraft((p) => ({ ...p, ownerId: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            >
              {ownerOptions.map((opt) => (
                <option key={opt.value || "__none__"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraft({
                  name: deadline.name,
                  type: deadline.type,
                  dueAt: isoDate(deadline.dueAt),
                  ownerId: deadline.ownerId ?? "",
                });
              }}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="btn-primary-theme rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

function BudgetTab({
  conferenceId,
  currency,
  budget,
  expenses,
  expenseCategoryOptions,
  onRefresh,
  setActionError,
}: {
  conferenceId: string;
  currency: string;
  budget: ConferenceDetailPayload["conference"]["budget"];
  expenses: ConferenceDetailPayload["conference"]["expenses"];
  expenseCategoryOptions: Array<{ value: ConferenceExpenseCategory; label: string }>;
  onRefresh: () => Promise<void>;
  setActionError: (value: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [visibleExpenses, setVisibleExpenses] = useState(10);
  const [expenseForm, setExpenseForm] = useState(() => ({
    category: "OTHER" as ConferenceExpenseCategory,
    amount: "",
    incurredAt: isoDate(new Date().toISOString()),
    vendor: "",
    budgetLineItemId: "",
  }));

  const updateLineItem = async (lineItemId: string, patch: Record<string, unknown>) => {
    setActionError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/budget/line-items/${lineItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Update failed (${res.status}).`);
      }
      await onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update line item.");
    } finally {
      setSaving(false);
    }
  };

  const createExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const amount = Number(expenseForm.amount);
    if (!Number.isFinite(amount) || !expenseForm.incurredAt) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: expenseForm.category,
          amount,
          incurredAt: expenseForm.incurredAt,
          vendor: expenseForm.vendor || undefined,
          budgetLineItemId: expenseForm.budgetLineItemId || undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Create failed (${res.status}).`);
      }
      setExpenseForm((p) => ({ ...p, amount: "", vendor: "" }));
      await onRefresh();
    } catch (e2) {
      setActionError(e2 instanceof Error ? e2.message : "Failed to create expense.");
    } finally {
      setSaving(false);
    }
  };

  const plannedTotal = budget?.lineItems?.reduce((sum, li) => sum + (Number.isFinite(li.plannedAmount) ? li.plannedAmount : 0), 0) ?? 0;
  const actualTotal = expenses.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Planned" value={formatMoney(plannedTotal, currency)} />
        <SummaryCard label="Actual" value={formatMoney(actualTotal, currency)} />
        <SummaryCard label="Variance" value={formatMoney(actualTotal - plannedTotal, currency)} />
      </div>

      <div className="rounded-xl border border-border bg-secondary p-4">
        <h2 className="text-sm font-semibold text-foreground">Budget Line Items</h2>
        {!budget ? (
          <p className="mt-2 text-sm text-muted-foreground">No budget seeded yet. Use “Seed Playbook” to scaffold it.</p>
        ) : budget.lineItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No budget line items yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {budget.lineItems.map((li) => (
              <div key={li.id} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border/60 bg-background p-3 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <p className="text-xs text-muted-foreground">{CONFERENCE_EXPENSE_CATEGORY_LABELS[li.category] ?? li.category}</p>
                  <input
                    defaultValue={li.label}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== li.label) void updateLineItem(li.id, { label: next });
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Planned</p>
                  <input
                    defaultValue={String(li.plannedAmount)}
                    inputMode="decimal"
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next) && next !== li.plannedAmount) void updateLineItem(li.id, { plannedAmount: next });
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                  />
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-foreground">{formatMoney(li.plannedAmount, currency)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-secondary p-4">
          <h2 className="text-sm font-semibold text-foreground">Add Expense</h2>
          <form onSubmit={createExpense} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm((p) => ({ ...p, category: e.target.value as ConferenceExpenseCategory }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                {expenseCategoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount</label>
              <input
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Incurred</label>
              <input
                type="date"
                value={expenseForm.incurredAt}
                onChange={(e) => setExpenseForm((p) => ({ ...p, incurredAt: e.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Vendor</label>
              <input
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm((p) => ({ ...p, vendor: e.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Budget Line Item (optional)</label>
              <select
                value={expenseForm.budgetLineItemId}
                onChange={(e) => setExpenseForm((p) => ({ ...p, budgetLineItemId: e.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                disabled={!budget || budget.lineItems.length === 0}
              >
                <option value="">No line item</option>
                {budget?.lineItems?.map((li) => (
                  <option key={li.id} value={li.id}>
                    {li.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Expense"}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-border bg-secondary p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Expenses {expenses.length > 0 && <span className="text-xs font-normal text-muted-foreground">({expenses.length})</span>}
          </h2>
          {expenses.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No expenses logged.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {expenses.slice(0, visibleExpenses).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {CONFERENCE_EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                      {e.vendor ? ` • ${e.vendor}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.incurredAt)}</p>
                  </div>
                  <div className="text-sm font-semibold text-foreground">{formatMoney(e.amount, currency)}</div>
                </div>
              ))}
            </div>
            {expenses.length > 10 && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Showing {Math.min(visibleExpenses, expenses.length)} of {expenses.length}</span>
                <div className="flex gap-2">
                  {visibleExpenses < expenses.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleExpenses((v) => Math.min(v + 10, expenses.length))}
                      className="text-primary hover:underline"
                    >
                      Show more
                    </button>
                  )}
                  {visibleExpenses > 10 && (
                    <button
                      type="button"
                      onClick={() => setVisibleExpenses(10)}
                      className="text-primary hover:underline"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            )}
          )}
        </div>
      </div>
    </div>
  );
}

function LeadsTab({
  conferenceId,
  leads,
  team,
  leadStatusOptions,
  onRefresh,
  setActionError,
}: {
  conferenceId: string;
  leads: ConferenceDetailPayload["conference"]["leads"];
  team: TeamMember[];
  leadStatusOptions: Array<{ value: ConferenceLeadStatus; label: string }>;
  onRefresh: () => Promise<void>;
  setActionError: (value: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
    status: "NEW" as ConferenceLeadStatus,
    assignedToUserId: "",
  }));

  const assigneeOptions = [
    { value: "", label: "Unassigned" },
    ...team.map((user) => ({ value: user.id, label: user.name || user.email })),
  ];

  const createLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          email: form.email || undefined,
          companyName: form.companyName || undefined,
          status: form.status,
          assignedToUserId: form.assignedToUserId || undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Create failed (${res.status}).`);
      }
      setForm({ firstName: "", lastName: "", email: "", companyName: "", status: "NEW", assignedToUserId: "" });
      await onRefresh();
    } catch (e2) {
      setActionError(e2 instanceof Error ? e2.message : "Failed to create lead.");
    } finally {
      setSaving(false);
    }
  };

  const patchLead = async (leadId: string, patch: Record<string, unknown>) => {
    setActionError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Update failed (${res.status}).`);
      }
      await onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-secondary p-4">
        <h2 className="text-sm font-semibold text-foreground">Add Lead</h2>
        <form onSubmit={createLead} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">First</label>
            <input
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Last</label>
            <input
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              placeholder="name@company.com"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
            <input
              value={form.companyName}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ConferenceLeadStatus }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {leadStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Assignee</label>
            <select
              value={form.assignedToUserId}
              onChange={(e) => setForm((p) => ({ ...p, assignedToUserId: e.target.value }))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {assigneeOptions.map((opt) => (
                <option key={opt.value || "__none__"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Lead"}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-secondary">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lead</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignee</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Captured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {leads.length === 0 ? (
              <tr className="bg-card">
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No leads yet.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || "Unnamed lead";
                return (
                  <tr key={lead.id} className="bg-card hover:bg-secondary/40">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <div className="min-w-0">
                        <p className="truncate">{name}</p>
                        {lead.email ? (
                          <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{lead.companyName || "—"}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={lead.status}
                        disabled={saving}
                        onChange={(e) => void patchLead(lead.id, { status: e.target.value })}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                      >
                        {leadStatusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={lead.assignedToUserId ?? ""}
                        disabled={saving}
                        onChange={(e) => void patchLead(lead.id, { assignedToUserId: e.target.value || null })}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                      >
                        {assigneeOptions.map((opt) => (
                          <option key={opt.value || "__none__"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground" title={formatDateTime(lead.capturedAt)}>
                      {formatDate(lead.capturedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
