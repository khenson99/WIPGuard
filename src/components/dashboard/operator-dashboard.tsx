"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { WorkspaceBadge } from "@/components/dashboard/workspace-badge";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import type { DashboardOverviewPayload } from "@/lib/platform/dashboard/overview";
import { getWorkspaceById, type WorkspaceId } from "@/lib/platform/workspaces";

const OPERATOR_DASHBOARD_CACHE_KEY = "dashboard:overview:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDashboardOverviewPayload(value: unknown): value is DashboardOverviewPayload {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.revenueSummary) &&
    isRecord(value.integrationHealth) &&
    isRecord(value.automationAttention) &&
    isRecord(value.analyticsFreshness) &&
    typeof value.generatedAt === "string"
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function OverviewCard({
  workspaceId,
  title,
  href,
  primary,
  secondary,
  tertiary,
}: {
  workspaceId: WorkspaceId;
  title: string;
  href: string;
  primary: string;
  secondary: string;
  tertiary: string;
}) {
  return (
    <Link
      href={href}
      data-workspace-id={workspaceId}
      className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-secondary/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <WorkspaceBadge workspaceId={workspaceId} />
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-foreground">{primary}</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-4 space-y-1 text-xs text-muted-foreground">
        <p>{secondary}</p>
        <p>{tertiary}</p>
      </div>
    </Link>
  );
}

export function OperatorDashboard() {
  const resource = useDashboardResource<DashboardOverviewPayload>({
    cacheKey: OPERATOR_DASHBOARD_CACHE_KEY,
    deps: [],
    load: async ({ signal, refresh }) => {
      const response = await fetch("/api/dashboard/overview", {
        signal,
        cache: refresh ? "no-store" : "default",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        const errorMessage =
          payload?.error && payload.error.trim().length > 0
            ? payload.error
            : `Overview request failed (${response.status})`;
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as unknown;
      if (!isDashboardOverviewPayload(payload)) {
        throw new Error("Dashboard overview payload is invalid");
      }

      return payload;
    },
    getLastUpdatedAt: (payload) => payload.generatedAt,
    mapError: (error) => {
      if (error instanceof Error && error.message.trim().length > 0) {
        if (error.message === "Organization context required for dashboard overview") {
          return "Dashboard overview needs an organization context before it can load operator metrics.";
        }
        return error.message;
      }
      return "Could not load operator overview.";
    },
  });
  const requiresOrganizationContext =
    resource.error === "Dashboard overview needs an organization context before it can load operator metrics.";

  const cards = useMemo(() => {
    if (!resource.data) return [];

    const deals = getWorkspaceById(resource.data.revenueSummary.workspaceId);
    const integrations = getWorkspaceById(resource.data.integrationHealth.workspaceId);
    const automations = getWorkspaceById(resource.data.automationAttention.workspaceId);
    const analytics = getWorkspaceById(resource.data.analyticsFreshness.workspaceId);

    return [
      {
        workspaceId: resource.data.revenueSummary.workspaceId,
        title: deals?.label ?? "Deals",
        href: deals?.href ?? "/deals",
        primary: `${resource.data.revenueSummary.openDeals} open deals worth ${formatCurrency(resource.data.revenueSummary.pipelineValue)}`,
        secondary: `${resource.data.revenueSummary.closingThisMonth} expected to close this month`,
        tertiary: `${resource.data.revenueSummary.wonThisQuarter} wins closed this quarter`,
      },
      {
        workspaceId: resource.data.integrationHealth.workspaceId,
        title: integrations?.label ?? "Integrations",
        href: integrations?.href ?? "/integrations",
        primary: `${resource.data.integrationHealth.connectedConnections}/${resource.data.integrationHealth.totalConnections} providers connected`,
        secondary: `${resource.data.integrationHealth.degradedConnections} degraded, ${resource.data.integrationHealth.errorConnections} in error`,
        tertiary: `${resource.data.integrationHealth.missingConnections} missing and ${resource.data.integrationHealth.staleConnections} stale`,
      },
      {
        workspaceId: resource.data.automationAttention.workspaceId,
        title: automations?.label ?? "Automations",
        href: automations?.href ?? "/automations",
        primary: `${resource.data.automationAttention.activeWorkflows} active workflows running`,
        secondary: `${resource.data.automationAttention.failingRuns} failing runs, ${resource.data.automationAttention.waitingExternalRuns} waiting externally`,
        tertiary: `${resource.data.automationAttention.pendingApprovals + resource.data.automationAttention.pendingRecommendations} runs paused at human checkpoints`,
      },
      {
        workspaceId: resource.data.analyticsFreshness.workspaceId,
        title: analytics?.label ?? "Analytics",
        href: analytics?.href ?? "/analytics",
        primary: `${resource.data.analyticsFreshness.healthyDomains} healthy analytics domains`,
        secondary: `${resource.data.analyticsFreshness.staleDomains} stale, ${resource.data.analyticsFreshness.errorDomains} errored`,
        tertiary: `${resource.data.analyticsFreshness.missingDomains} missing snapshots`,
      },
    ];
  }, [resource.data]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Operator Cockpit</h1>
            <p className="text-xs text-muted-foreground">
              Platform-wide GTM signals across revenue, integrations, automations, and analytics.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Last updated:{" "}
              {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
              {resource.fromCache ? " (cache warm start)" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={resource.refresh}
            disabled={resource.refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {resource.refreshing ? "Refreshing..." : "Refresh overview"}
          </button>
        </div>

        {resource.stale ? (
          <DashboardStaleBanner
            lastUpdatedAt={resource.lastUpdatedAt}
            onRefresh={resource.refresh}
            refreshing={resource.refreshing}
          />
        ) : null}

        {resource.error && resource.data ? (
          <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} />
        ) : null}

        {resource.loading && !resource.data ? (
          <DashboardLoadingState message="Loading operator overview..." className="h-32" />
        ) : null}

        {!resource.loading && !resource.data ? (
          <DashboardEmptyState
            title={requiresOrganizationContext ? "Organization Context Required" : "Operator overview unavailable"}
            message={
              resource.error ??
              "No operator overview data was returned."
            }
            actionLabel="Refresh now"
            onAction={resource.refresh}
          />
        ) : null}

        {cards.length > 0 ? (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3" aria-label="Operator overview cards">
            {cards.map((card) => (
              <OverviewCard key={card.workspaceId} {...card} />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
