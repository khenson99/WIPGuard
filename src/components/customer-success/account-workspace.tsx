"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import type { CustomerSuccessAccountDetail } from "@/lib/customer-success/types";

type WorkspaceTab =
  | "overview"
  | "health"
  | "commercial"
  | "timeline"
  | "stakeholders"
  | "tasks"
  | "success-plan"
  | "outreach";

type MutationBanner =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "Health Details" },
  { id: "commercial", label: "Commercial" },
  { id: "timeline", label: "Timeline" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "tasks", label: "Tasks" },
  { id: "success-plan", label: "Success Plan" },
  { id: "outreach", label: "Outreach" },
];

const TASK_STATUSES = ["BACKLOG", "QUEUED", "ACTIVE"] as const;
const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
const OUTREACH_CHANNELS = ["EMAIL", "SLACK"] as const;

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatNumber(value?: number): string {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatHealthTone(score: number): string {
  if (score >= 80) return "text-[var(--success)]";
  if (score >= 65) return "text-[var(--warning)]";
  return "text-red-500";
}

function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inputClasses(multiline = false): string {
  return `${multiline ? "min-h-24" : "h-10"} w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20`;
}

function buttonClasses(tone: "primary" | "secondary" | "danger" = "primary"): string {
  if (tone === "primary") {
    return "rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";
  }
  if (tone === "danger") {
    return "rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60";
  }
  return "rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60";
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export function CustomerSuccessAccountWorkspace({ accountId }: { accountId: string }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [mutationBanner, setMutationBanner] = useState<MutationBanner>(null);
  const [activeMutation, setActiveMutation] = useState<string | null>(null);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskStatus, setTaskStatus] = useState<(typeof TASK_STATUSES)[number]>("ACTIVE");
  const [taskPriority, setTaskPriority] = useState<(typeof TASK_PRIORITIES)[number]>("P2");
  const [taskDueDate, setTaskDueDate] = useState("");

  const [planName, setPlanName] = useState("");
  const [planTemplateKey, setPlanTemplateKey] = useState("");
  const [planTargetDate, setPlanTargetDate] = useState("");
  const [planMilestones, setPlanMilestones] = useState("");

  const [outreachChannel, setOutreachChannel] = useState<(typeof OUTREACH_CHANNELS)[number]>("EMAIL");
  const [outreachRecipientName, setOutreachRecipientName] = useState("");
  const [outreachRecipientAddress, setOutreachRecipientAddress] = useState("");
  const [outreachTemplateKey, setOutreachTemplateKey] = useState("");
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachBody, setOutreachBody] = useState("");

  const resource = useDashboardResource<CustomerSuccessAccountDetail>({
    cacheKey: `customer-success:account:${accountId}`,
    deps: [accountId],
    async load({ signal }) {
      const response = await fetch(`/api/customer-success/accounts/${accountId}`, {
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as CustomerSuccessAccountDetail | { error?: string };
      if (!response.ok) {
        throw new Error(body && "error" in body && body.error ? body.error : "Failed to load account workspace");
      }
      return body as CustomerSuccessAccountDetail;
    },
    getLastUpdatedAt: (payload) => payload.health.updatedAt,
  });

  async function runMutation(input: {
    key: string;
    successMessage: string;
    request: () => Promise<unknown>;
    afterSuccess?: () => void;
  }) {
    setActiveMutation(input.key);
    setMutationBanner(null);

    try {
      await input.request();
      input.afterSuccess?.();
      await resource.refresh();
      setMutationBanner({ tone: "success", message: input.successMessage });
    } catch (error) {
      setMutationBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setActiveMutation(null);
    }
  }

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading account workspace..." className="h-64" />;
  }

  if (resource.error && !resource.data) {
    return <DashboardErrorBanner message={resource.error} />;
  }

  if (!resource.data) {
    return <DashboardErrorBanner message="No customer-success account data available." />;
  }

  const detail = resource.data;
  const activeAlerts = detail.alerts.filter((alert) => alert.status === "open" || alert.status === "in_progress");

  return (
    <div className="space-y-6">
      {resource.stale && resource.error ? (
        <DashboardStaleBanner
          label={resource.error}
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
        />
      ) : null}

      {mutationBanner ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            mutationBanner.tone === "success"
              ? "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]"
              : "border-red-500/30 bg-red-500/10 text-red-600"
          }`}
        >
          {mutationBanner.message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/analytics/customer-success" className="text-xs text-muted-foreground hover:text-foreground">
              Back to Customer Success
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">{detail.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.lifecycleStage} {detail.tier ? `• ${detail.tier}` : ""} {detail.segment ? `• ${detail.segment}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Health</p>
              <p className={`mt-1 text-2xl font-semibold ${formatHealthTone(detail.health.score)}`}>
                {detail.health.grade} {formatNumber(detail.health.score)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="mt-1 text-sm font-medium text-foreground">{detail.ownerName || "Unassigned"}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Open Alerts</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{activeAlerts.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Renewal</p>
              <p className="mt-1 text-sm font-medium text-foreground">{formatDate(detail.commercial?.renewalDate)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              activeTab === tab.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Account Summary</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Health Trend</p>
                <p className="mt-1 text-sm font-medium text-foreground">{detail.health.trend}</p>
                <p className="mt-2 text-xs text-muted-foreground">Confidence {formatNumber(detail.health.confidence)}%</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Top Recommended Outreach</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {detail.outreach.recommendedTemplates[0] || "check-in"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Stakeholder Coverage</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {detail.stakeholders.filter((stakeholder) => stakeholder.coverageStatus === "covered").length}/
                  {detail.stakeholders.length} covered
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Success Plan Milestones</p>
                <p className="mt-1 text-sm font-medium text-foreground">{detail.successPlan.milestones.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Attention Queue</h2>
            <div className="mt-4 space-y-3">
              {detail.alerts.slice(0, 5).map((alert) => {
                const isUpdating = activeMutation !== null && activeMutation.startsWith(`alert:${alert.id}:`);
                return (
                  <div key={alert.id} className="rounded-xl border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{alert.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatEnumLabel(alert.severity)} • {formatEnumLabel(alert.status)} • {formatEnumLabel(alert.slaStatus)}
                        </p>
                      </div>
                      <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                        {formatEnumLabel(alert.source)}
                      </span>
                    </div>
                    {alert.suggestedAction ? (
                      <p className="mt-2 text-xs text-muted-foreground">{alert.suggestedAction}</p>
                    ) : null}
                    {alert.status === "open" || alert.status === "in_progress" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {alert.status === "open" ? (
                          <button
                            type="button"
                            className={buttonClasses("secondary")}
                            disabled={isUpdating}
                            onClick={() =>
                              void runMutation({
                                key: `alert:${alert.id}:IN_PROGRESS`,
                                successMessage: "Alert moved to in progress.",
                                request: () =>
                                  postJson(`/api/customer-success/accounts/${accountId}/alerts/${alert.id}/status`, {
                                    status: "IN_PROGRESS",
                                  }),
                              })
                            }
                          >
                            {isUpdating ? "Updating..." : "Mark In Progress"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={buttonClasses("primary")}
                          disabled={isUpdating}
                          onClick={() =>
                            void runMutation({
                              key: `alert:${alert.id}:RESOLVED`,
                              successMessage: "Alert resolved.",
                              request: () =>
                                postJson(`/api/customer-success/accounts/${accountId}/alerts/${alert.id}/status`, {
                                  status: "RESOLVED",
                                }),
                            })
                          }
                        >
                          {isUpdating ? "Updating..." : "Resolve"}
                        </button>
                        <button
                          type="button"
                          className={buttonClasses("danger")}
                          disabled={isUpdating}
                          onClick={() =>
                            void runMutation({
                              key: `alert:${alert.id}:DISMISSED`,
                              successMessage: "Alert dismissed.",
                              request: () =>
                                postJson(`/api/customer-success/accounts/${accountId}/alerts/${alert.id}/status`, {
                                  status: "DISMISSED",
                                }),
                            })
                          }
                        >
                          {isUpdating ? "Updating..." : "Dismiss"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {detail.alerts.length === 0 ? <p className="text-sm text-muted-foreground">No active alerts.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "health" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(detail.health.components).map(([key, component]) => (
            <div key={key} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
              <p className={`mt-2 text-2xl font-semibold ${formatHealthTone(component.score)}`}>
                {formatNumber(component.score)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {component.status} • {component.trend}
              </p>
              <div className="mt-3 space-y-2">
                {component.evidence.map((item) => (
                  <p key={item} className="text-xs text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "commercial" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Commercial Snapshot</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ARR</span>
                <span className="text-foreground">{formatNumber(detail.commercial?.arr)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Renewal Date</span>
                <span className="text-foreground">{formatDate(detail.commercial?.renewalDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payment Status</span>
                <span className="text-foreground">{detail.commercial?.paymentStatus || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Expansion Potential</span>
                <span className="text-foreground">{detail.commercial?.expansionPotential || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "timeline" ? (
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Log Note</h2>
            <p className="mt-1 text-xs text-muted-foreground">Notes are persisted and folded into the timeline after refresh.</p>
            <div className="mt-4 space-y-3">
              <input
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                placeholder="Optional title"
                className={inputClasses()}
              />
              <textarea
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Capture meeting takeaways, relationship context, or risk notes"
                className={inputClasses(true)}
              />
              <button
                type="button"
                className={buttonClasses("primary")}
                disabled={activeMutation === "note:create"}
                onClick={() => {
                  if (!noteBody.trim()) {
                    setMutationBanner({ tone: "error", message: "Note body is required." });
                    return;
                  }

                  void runMutation({
                    key: "note:create",
                    successMessage: "Note added to the account timeline.",
                    request: () =>
                      postJson(`/api/customer-success/accounts/${accountId}/notes`, {
                        title: noteTitle || undefined,
                        body: noteBody,
                      }),
                    afterSuccess: () => {
                      setNoteTitle("");
                      setNoteBody("");
                    },
                  });
                }}
              >
                {activeMutation === "note:create" ? "Saving..." : "Add Note"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
            <div className="mt-4 space-y-3">
              {detail.timeline.map((event) => (
                <div key={event.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(event.occurredAt)}</p>
                  </div>
                  {event.description ? <p className="mt-1 text-xs text-muted-foreground">{event.description}</p> : null}
                </div>
              ))}
              {detail.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No timeline entries yet.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "stakeholders" ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Stakeholders</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Coverage</th>
                  <th className="pb-2 font-medium">Last Touch</th>
                </tr>
              </thead>
              <tbody>
                {detail.stakeholders.map((stakeholder) => (
                  <tr key={stakeholder.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 text-foreground">
                      <div>{stakeholder.name}</div>
                      {stakeholder.email ? <div className="text-xs text-muted-foreground">{stakeholder.email}</div> : null}
                    </td>
                    <td className="py-3 text-muted-foreground">{stakeholder.role}</td>
                    <td className="py-3 text-muted-foreground">{stakeholder.coverageStatus || "—"}</td>
                    <td className="py-3 text-muted-foreground">{formatDate(stakeholder.lastTouchAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Create Linked Task</h2>
            <div className="mt-4 space-y-3">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Task title"
                className={inputClasses()}
              />
              <textarea
                value={taskNotes}
                onChange={(event) => setTaskNotes(event.target.value)}
                placeholder="Optional notes or handoff context"
                className={inputClasses(true)}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value as (typeof TASK_STATUSES)[number])} className={inputClasses()}>
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ))}
                </select>
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as (typeof TASK_PRIORITIES)[number])} className={inputClasses()}>
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} className={inputClasses()} />
              </div>
              <button
                type="button"
                className={buttonClasses("primary")}
                disabled={activeMutation === "task:create"}
                onClick={() => {
                  if (!taskTitle.trim()) {
                    setMutationBanner({ tone: "error", message: "Task title is required." });
                    return;
                  }

                  void runMutation({
                    key: "task:create",
                    successMessage: "Linked task created.",
                    request: () =>
                      postJson(`/api/customer-success/accounts/${accountId}/tasks`, {
                        title: taskTitle,
                        notes: taskNotes || undefined,
                        status: taskStatus,
                        priority: taskPriority,
                        dueDate: taskDueDate || undefined,
                      }),
                    afterSuccess: () => {
                      setTaskTitle("");
                      setTaskNotes("");
                      setTaskStatus("ACTIVE");
                      setTaskPriority("P2");
                      setTaskDueDate("");
                    },
                  });
                }}
              >
                {activeMutation === "task:create" ? "Creating..." : "Create Task"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Linked Tasks</h2>
            <div className="mt-4 space-y-3">
              {detail.tasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{formatEnumLabel(task.status)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Priority {task.priority || "—"} • Due {formatDate(task.dueDate)}
                  </p>
                </div>
              ))}
              {detail.tasks.length === 0 ? <p className="text-sm text-muted-foreground">No linked tasks.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "success-plan" ? (
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Create Success Plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">Creating a new active plan archives any existing active plan for this account.</p>
            <div className="mt-4 space-y-3">
              <input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Plan name" className={inputClasses()} />
              <input value={planTemplateKey} onChange={(event) => setPlanTemplateKey(event.target.value)} placeholder="Template key (optional)" className={inputClasses()} />
              <input type="date" value={planTargetDate} onChange={(event) => setPlanTargetDate(event.target.value)} className={inputClasses()} />
              <textarea
                value={planMilestones}
                onChange={(event) => setPlanMilestones(event.target.value)}
                placeholder="One milestone per line"
                className={inputClasses(true)}
              />
              <button
                type="button"
                className={buttonClasses("primary")}
                disabled={activeMutation === "plan:create"}
                onClick={() => {
                  if (!planName.trim()) {
                    setMutationBanner({ tone: "error", message: "Success plan name is required." });
                    return;
                  }

                  void runMutation({
                    key: "plan:create",
                    successMessage: "Success plan created.",
                    request: () =>
                      postJson(`/api/customer-success/accounts/${accountId}/success-plan`, {
                        name: planName,
                        templateKey: planTemplateKey || undefined,
                        targetDate: planTargetDate || undefined,
                        milestoneTitles: planMilestones
                          .split("\n")
                          .map((title) => title.trim())
                          .filter(Boolean),
                      }),
                    afterSuccess: () => {
                      setPlanName("");
                      setPlanTemplateKey("");
                      setPlanTargetDate("");
                      setPlanMilestones("");
                    },
                  });
                }}
              >
                {activeMutation === "plan:create" ? "Creating..." : "Create Plan"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Success Plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">Template {detail.successPlan.templateKey || "custom"}</p>
            <div className="mt-4 space-y-3">
              {detail.successPlan.milestones.map((milestone) => (
                <div key={milestone.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{milestone.title}</p>
                    <p className="text-xs text-muted-foreground">{formatEnumLabel(milestone.status)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(milestone.dueDate)}</p>
                </div>
              ))}
              {detail.successPlan.milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "outreach" ? (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Recommended Templates</h2>
              <div className="mt-4 space-y-2">
                {detail.outreach.recommendedTemplates.map((template) => (
                  <button
                    key={template}
                    type="button"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:bg-secondary"
                    onClick={() => setOutreachTemplateKey(template)}
                  >
                    {template}
                  </button>
                ))}
                {detail.outreach.recommendedTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recommended templates yet.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Compose Outreach</h2>
              <div className="mt-4 space-y-3">
                <select value={outreachChannel} onChange={(event) => setOutreachChannel(event.target.value as (typeof OUTREACH_CHANNELS)[number])} className={inputClasses()}>
                  {OUTREACH_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {formatEnumLabel(channel)}
                    </option>
                  ))}
                </select>
                <input
                  value={outreachRecipientName}
                  onChange={(event) => setOutreachRecipientName(event.target.value)}
                  placeholder="Recipient name (optional)"
                  className={inputClasses()}
                />
                <input
                  value={outreachRecipientAddress}
                  onChange={(event) => setOutreachRecipientAddress(event.target.value)}
                  placeholder="Recipient email or Slack address"
                  className={inputClasses()}
                />
                <input
                  value={outreachTemplateKey}
                  onChange={(event) => setOutreachTemplateKey(event.target.value)}
                  placeholder="Template key (optional)"
                  className={inputClasses()}
                />
                <input
                  value={outreachSubject}
                  onChange={(event) => setOutreachSubject(event.target.value)}
                  placeholder="Subject"
                  className={inputClasses()}
                />
                <textarea
                  value={outreachBody}
                  onChange={(event) => setOutreachBody(event.target.value)}
                  placeholder="Message body"
                  className={inputClasses(true)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClasses("secondary")}
                    disabled={activeMutation === "outreach:draft" || activeMutation === "outreach:send"}
                    onClick={() => {
                      if (!outreachRecipientAddress.trim() || !outreachBody.trim()) {
                        setMutationBanner({ tone: "error", message: "Recipient address and body are required to save a draft." });
                        return;
                      }

                      void runMutation({
                        key: "outreach:draft",
                        successMessage: "Outreach draft saved.",
                        request: () =>
                          postJson(`/api/customer-success/accounts/${accountId}/outreach/drafts`, {
                            channel: outreachChannel,
                            recipientName: outreachRecipientName || undefined,
                            recipientAddress: outreachRecipientAddress,
                            templateKey: outreachTemplateKey || undefined,
                            subject: outreachSubject || undefined,
                            body: outreachBody,
                          }),
                      });
                    }}
                  >
                    {activeMutation === "outreach:draft" ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    className={buttonClasses("primary")}
                    disabled={activeMutation === "outreach:draft" || activeMutation === "outreach:send"}
                    onClick={() => {
                      if (!outreachRecipientAddress.trim() || !outreachBody.trim()) {
                        setMutationBanner({ tone: "error", message: "Recipient address and body are required to queue outreach." });
                        return;
                      }

                      void runMutation({
                        key: "outreach:send",
                        successMessage: "Outreach queued for delivery.",
                        request: () =>
                          postJson(`/api/customer-success/accounts/${accountId}/outreach/send`, {
                            channel: outreachChannel,
                            recipientName: outreachRecipientName || undefined,
                            recipientAddress: outreachRecipientAddress,
                            templateKey: outreachTemplateKey || undefined,
                            subject: outreachSubject || undefined,
                            body: outreachBody,
                          }),
                        afterSuccess: () => {
                          setOutreachRecipientName("");
                          setOutreachRecipientAddress("");
                          setOutreachTemplateKey("");
                          setOutreachSubject("");
                          setOutreachBody("");
                          setOutreachChannel("EMAIL");
                        },
                      });
                    }}
                  >
                    {activeMutation === "outreach:send" ? "Queueing..." : "Queue Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Recent Messages</h2>
            <div className="mt-4 space-y-3">
              {detail.outreach.recentMessages.map((message) => (
                <div key={message.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{message.subject}</p>
                    <p className="text-xs text-muted-foreground">{formatEnumLabel(message.status)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(message.sentAt)}</p>
                </div>
              ))}
              {detail.outreach.recentMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach history yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
