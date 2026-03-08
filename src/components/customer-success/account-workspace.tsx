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

export function CustomerSuccessAccountWorkspace({ accountId }: { accountId: string }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
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
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {detail.alerts.filter((alert) => alert.status === "open" || alert.status === "in_progress").length}
              </p>
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
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
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
              {detail.alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.severity} • {alert.status} • {alert.slaStatus}
                  </p>
                </div>
              ))}
              {detail.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active alerts.</p>
              ) : null}
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
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Linked Tasks</h2>
          <div className="mt-4 space-y-3">
            {detail.tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.status}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Priority {task.priority || "—"} • Due {formatDate(task.dueDate)}
                </p>
              </div>
            ))}
            {detail.tasks.length === 0 ? <p className="text-sm text-muted-foreground">No linked tasks.</p> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "success-plan" ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Success Plan</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Template {detail.successPlan.templateKey || "custom"}
          </p>
          <div className="mt-4 space-y-3">
            {detail.successPlan.milestones.map((milestone) => (
              <div key={milestone.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{milestone.title}</p>
                  <p className="text-xs text-muted-foreground">{milestone.status}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(milestone.dueDate)}</p>
              </div>
            ))}
            {detail.successPlan.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "outreach" ? (
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Recommended Templates</h2>
            <div className="mt-4 space-y-2">
              {detail.outreach.recommendedTemplates.map((template) => (
                <div key={template} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                  {template}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Recent Messages</h2>
            <div className="mt-4 space-y-3">
              {detail.outreach.recentMessages.map((message) => (
                <div key={message.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{message.subject}</p>
                    <p className="text-xs text-muted-foreground">{message.status}</p>
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
