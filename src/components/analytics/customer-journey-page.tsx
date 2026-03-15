"use client";

import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  MousePointerClick,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { populateConnectionStatus } from "@/hooks/use-connection-status";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";

function fmtNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

function fmtPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function fmtMoney(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

type JourneyStageCard = {
  id: string;
  label: string;
  value: number;
  subtitle: string;
};

function buildJourneyStages(data: AnalyticsDashboardData): JourneyStageCard[] {
  const traffic = Math.max(
    data.googleAnalytics?.sessions30d ?? 0,
    data.lifecycleFunnel?.stages.find((stage) => stage.id === "awareness")?.volume ?? 0,
  );
  const leads = Math.max(
    data.hubspot?.contacts.recentContacts ?? 0,
    data.lifecycleFunnel?.stages.find((stage) => stage.id === "acquisition")?.volume ?? 0,
  );
  const demos = Math.max(
    data.demoAnalytics?.totalScheduled ?? 0,
    data.hubspot?.funnel.demoScheduled ?? 0,
  );
  const deals = Math.max(
    data.hubspot?.funnel.totalDeals ?? 0,
    data.customerJourney?.journeys.length ?? 0,
  );
  const subscriptions = Math.max(
    data.financialPlanning?.subscriptionOverview?.mergedActiveSubscriptions ?? 0,
    data.hubspot?.funnel.activeSubscriptions ?? 0,
    data.stripe?.subscriptions.active ?? 0,
  );
  const support = Math.max(
    data.pylon?.openConversations ?? 0,
    data.pylon?.resolvedInRange ?? 0,
  );
  const retained = Math.max(
    data.lifecycleFunnel?.stages.find((stage) => stage.id === "retention")?.volume ?? 0,
    subscriptions - (data.stripe?.subscriptions.recentChurnEvents.length ?? 0),
  );

  return [
    { id: "traffic", label: "Traffic", value: traffic, subtitle: `${fmtNumber(data.googleAnalytics?.users30d)} users` },
    { id: "lead", label: "Lead", value: leads, subtitle: `${fmtNumber(data.webflow?.formSubmissions.reduce((sum, form) => sum + form.count, 0) ?? 0)} webflow submissions` },
    { id: "demo", label: "Demo", value: demos, subtitle: `${fmtPct(data.hubspot?.funnel.noShowRate ?? data.demoAnalytics?.noShowRate ?? null)} no-show rate` },
    { id: "deal", label: "Deal", value: deals, subtitle: `${fmtMoney(data.hubspot?.funnel.avgDealSize ?? null)} avg deal size` },
    { id: "subscription", label: "Subscription", value: subscriptions, subtitle: `${fmtMoney(data.stripe?.revenue.mrr ?? null)} MRR` },
    { id: "support", label: "Onboarding & Support", value: support, subtitle: `${fmtNumber(data.pylon?.urgentConversations ?? 0)} urgent conversations` },
    { id: "retention", label: "Retention", value: retained, subtitle: `${fmtNumber(data.stripe?.subscriptions.recentChurnEvents.length ?? 0)} recent churn events` },
  ];
}

function conversionFrom(previous: number, current: number): number | null {
  if (previous <= 0) return null;
  return (current / previous) * 100;
}

function deriveNextActions(data: AnalyticsDashboardData, stages: JourneyStageCard[]) {
  const actions: Array<{ title: string; detail: string; severity: "critical" | "warning" | "info" }> = [];
  const demoNoShowRate = data.demoAnalytics?.noShowRate ?? data.hubspot?.funnel.noShowRate ?? 0;
  const urgentSupport = data.pylon?.urgentConversations ?? 0;
  const churnEvents = data.stripe?.subscriptions.recentChurnEvents.length ?? 0;
  const topPath = data.customerJourney?.topPaths[0] ?? null;
  const weakestStep = stages
    .map((stage, index) => {
      if (index === 0) return null;
      const pct = conversionFrom(stages[index - 1].value, stage.value);
      return pct == null ? null : { from: stages[index - 1].label, to: stage.label, pct };
    })
    .filter((item): item is { from: string; to: string; pct: number } => item !== null)
    .sort((a, b) => a.pct - b.pct)[0];

  if (weakestStep && weakestStep.pct < 30) {
    actions.push({
      title: `Repair the ${weakestStep.from} → ${weakestStep.to} handoff`,
      detail: `${fmtPct(weakestStep.pct)} of customers are making that transition. Tighten routing, follow-up timing, and stage definitions before adding more top-of-funnel volume.`,
      severity: weakestStep.pct < 15 ? "critical" : "warning",
    });
  }

  if (demoNoShowRate > 20) {
    actions.push({
      title: "Reduce demo no-shows",
      detail: `Demo no-show rate is ${fmtPct(demoNoShowRate)}. Add reminder sequences and confirm owner follow-up inside 24 hours.`,
      severity: demoNoShowRate > 30 ? "critical" : "warning",
    });
  }

  if (urgentSupport > 10) {
    actions.push({
      title: "Stabilize onboarding and support load",
      detail: `${fmtNumber(urgentSupport)} urgent Pylon conversations are open. Rebalance ownership and separate onboarding incidents from reactive support.`,
      severity: urgentSupport > 20 ? "critical" : "warning",
    });
  }

  if (churnEvents > 0) {
    actions.push({
      title: "Close the post-sale loop",
      detail: `${fmtNumber(churnEvents)} subscriptions churned recently. Pair churn reasons with the preceding journey path and support history before reworking acquisition.`,
      severity: "warning",
    });
  }

  if (topPath) {
    actions.push({
      title: "Codify the best-performing journey",
      detail: `The top path is ${topPath.sequence.join(" → ")} with ${fmtNumber(topPath.count)} journeys. Preserve that path in outbound, demo scheduling, and onboarding motions.`,
      severity: "info",
    });
  }

  return actions.slice(0, 4);
}

export function CustomerJourneyDashboard({ data }: { data: AnalyticsDashboardData }) {
  const stages = useMemo(() => buildJourneyStages(data), [data]);
  const nextActions = useMemo(() => deriveNextActions(data, stages), [data, stages]);
  const topChannels = data.customerJourney?.touchpointSummary.slice(0, 4) ?? [];
  const topPaths = data.customerJourney?.topPaths.slice(0, 4) ?? [];
  const avgTouchpoints = data.customerJourney?.avgTouchpoints ?? 0;
  const medianDaysToClose = data.customerJourney?.medianDaysToClose ?? 0;
  const subscriptions = data.financialPlanning?.subscriptionOverview?.mergedActiveSubscriptions
    ?? data.stripe?.subscriptions.active
    ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Customer Journey</h2>
        <p className="text-sm text-muted-foreground">
          Track the motion from traffic to retention, identify the weakest handoff, and focus the next operator action.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Journeys" value={fmtNumber(data.customerJourney?.journeys.length ?? 0)} icon={Users} />
        <StatCard label="Avg Touchpoints" value={avgTouchpoints > 0 ? avgTouchpoints.toFixed(1) : "—"} icon={MousePointerClick} />
        <StatCard label="Median Days to Close" value={medianDaysToClose > 0 ? fmtNumber(medianDaysToClose) : "—"} icon={TrendingUp} />
        <StatCard label="Active Subscriptions" value={fmtNumber(subscriptions)} icon={Sparkles} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Journey 360</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Acquisition, conversion, support, and retention in one view.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {data.customerJourney?.stageOrderSource ? `Stage order: ${data.customerJourney.stageOrderSource}` : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-7">
          {stages.map((stage, index) => {
            const prev = index > 0 ? stages[index - 1] : null;
            const conversion = prev ? conversionFrom(prev.value, stage.value) : null;
            return (
              <div key={stage.id} className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{stage.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{fmtNumber(stage.value)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{stage.subtitle}</p>
                {conversion != null ? (
                  <div className="mt-3 flex items-center gap-1 text-[11px]">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className={conversion < 30 ? "text-red-500" : conversion < 60 ? "text-amber-500" : "text-emerald-500"}>
                      {fmtPct(conversion)} from {prev?.label.toLowerCase()}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Top Channels</h3>
          <p className="mt-1 text-xs text-muted-foreground">Where journeys start and where they convert.</p>
          <div className="mt-4 space-y-3">
            {topChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channel data is available yet.</p>
            ) : (
              topChannels.map((channel) => (
                <div key={channel.channel} className="rounded-lg border border-border/70 bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{channel.channel}</p>
                    <p className="text-sm text-foreground">{fmtNumber(channel.totalTouchpoints)}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fmtNumber(channel.firstTouchCount)} first-touch • {fmtNumber(channel.conversionCount)} conversion touchpoints
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Common Paths</h3>
          <p className="mt-1 text-xs text-muted-foreground">The paths customers are actually taking through the funnel.</p>
          <div className="mt-4 space-y-3">
            {topPaths.length === 0 ? (
              <p className="text-sm text-muted-foreground">No path data is available yet.</p>
            ) : (
              topPaths.map((path, index) => (
                <div key={`${path.sequence.join("-")}-${index}`} className="rounded-lg border border-border/70 bg-background px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{path.sequence.join(" → ")}</p>
                    <p className="text-sm text-foreground">{fmtNumber(path.count)}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fmtNumber(path.demos)} demos • {fmtNumber(path.freeTrials)} trials • {fmtMoney(path.avgValue)} avg value
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Next Actions</h3>
          <div className="mt-4 space-y-3">
            {nextActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent journey interventions are required right now.</p>
            ) : (
              nextActions.map((action) => (
                <div
                  key={action.title}
                  className={`rounded-lg border px-3 py-3 ${
                    action.severity === "critical"
                      ? "border-red-500/30 bg-red-500/5"
                      : action.severity === "warning"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border/70 bg-background"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{action.detail}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Post-Sale Snapshot</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Open support conversations</p>
                <p className="text-sm font-medium text-foreground">{fmtNumber(data.pylon?.openConversations ?? 0)}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Urgent support conversations</p>
                <p className="text-sm font-medium text-foreground">{fmtNumber(data.pylon?.urgentConversations ?? 0)}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Recent churn signals</p>
                <p className="text-sm font-medium text-foreground">{fmtNumber(data.stripe?.subscriptions.recentChurnEvents.length ?? 0)}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Avg first response</p>
                <p className="text-sm font-medium text-foreground">
                  {data.pylon?.avgFirstResponseMinutes != null ? `${fmtNumber(data.pylon.avgFirstResponseMinutes)} min` : "—"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function CustomerJourneyPage() {
  const resource = useDashboardResource<AnalyticsDashboardData>({
    cacheKey: "analytics:overview:v1",
    deps: [],
    load: async ({ signal, refresh }) => {
      const params = new URLSearchParams({ section: "overview" });
      if (refresh) {
        params.set("refresh", "true");
      }
      const response = await fetch(`/api/analytics?${params.toString()}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Analytics overview request failed (${response.status})`);
      }
      return (await response.json()) as AnalyticsDashboardData;
    },
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? payload.lastFullRefresh ?? null,
    mapError: (error) =>
      error instanceof Error && error.message ? error.message : "Could not load journey data.",
  });

  const data = resource.data;

  useEffect(() => {
    if (!data) return;
    populateConnectionStatus(data.freshness, data);
  }, [data]);

  if (resource.loading && !resource.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading journey data…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-4">
        {resource.error ? (
          <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} retryLabel="Refresh journey" />
        ) : null}
        <DashboardEmptyState
          title="Customer journey unavailable"
          message="No journey data is available right now."
          actionLabel="Refresh journey"
          onAction={resource.refresh}
        />
      </div>
    );
  }

  const hasJourneySignal = Boolean(
    (data.customerJourney?.journeys.length ?? 0) > 0 ||
      (data.hubspot?.funnel.totalDeals ?? 0) > 0 ||
      (data.googleAnalytics?.sessions30d ?? 0) > 0 ||
      (data.stripe?.subscriptions.active ?? 0) > 0,
  );

  if (!hasJourneySignal) {
    return (
      <div className="p-4">
        <DashboardEmptyState
          title="No customer journey data yet"
          message="Connect acquisition, CRM, billing, and support sources to map the journey from traffic through retention."
          actionLabel="Refresh journey"
          onAction={resource.refresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!resource.error && resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label="Showing cached journey analytics while fresh data is fetched."
        />
      ) : null}

      {resource.error ? (
        <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} retryLabel="Refresh journey" />
      ) : null}

      <CustomerJourneyDashboard data={data} />
    </div>
  );
}
