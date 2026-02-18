"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketingTabNew } from "@/components/analytics/marketing-tab-new";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { FinanceStripeTab } from "@/components/analytics/finance-stripe-tab";
import { FinanceHubSpotTab } from "@/components/analytics/finance-hubspot-tab";
import { SalesFunnelTab } from "@/components/analytics/sales-funnel-tab";
import { CustomerSuccessTab } from "@/components/analytics/customer-success-tab";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import {
  DecisionDashboardView,
  FlowMetricsView,
  FlowRiskView,
  ObservabilityView,
} from "@/components/analytics/ops-insights";
import { LifecycleFunnelPanel } from "@/components/analytics/lifecycle-funnel-panel";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import {
  getAnalyticsPrimaryForSection,
  getAnalyticsSecondaryForPrimary,
  getAnalyticsSubSectionById,
} from "@/lib/analytics/section-registry";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";

interface AnalyticsSectionPageProps {
  sectionId: string;
}

interface SectionViewModel {
  analyticsData: AnalyticsDashboardData | null;
  auxPayload: Record<string, unknown> | null;
}

const SECTION_CACHE_PREFIX = "analytics:section:v2:";
const OPS_DOMAINS = ["decisionDashboard", "flowMetrics", "flowRisk", "observability"] as const;
type ChildDataDomain = "decisionDashboard" | "flowMetrics" | "flowRisk" | "observability" | string;

export type AnalyticsChildRenderKind =
  | "finance-stripe"
  | "finance-hubspot"
  | "sales-hubspot"
  | "decisionDashboard"
  | "flowMetrics"
  | "flowRisk"
  | "observability"
  | "parent";

export function resolveAnalyticsChildRenderKind(input: {
  childId: string;
  childDataDomain: ChildDataDomain;
}): AnalyticsChildRenderKind {
  if (input.childId === "finance-stripe") return "finance-stripe";
  if (input.childId === "finance-hubspot") return "finance-hubspot";
  if (input.childId === "sales-hubspot") return "sales-hubspot";
  if (input.childDataDomain === "decisionDashboard") return "decisionDashboard";
  if (input.childDataDomain === "flowMetrics") return "flowMetrics";
  if (input.childDataDomain === "flowRisk") return "flowRisk";
  if (input.childDataDomain === "observability") return "observability";
  return "parent";
}

function buildRangeQuery(searchParams: URLSearchParams | null): string {
  const params = new URLSearchParams();
  const range = searchParams?.get("range");
  const from = searchParams?.get("from");
  const to = searchParams?.get("to");
  if (range) params.set("range", range);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

function sectionCacheKey(sectionId: string, rangeQuery: string): string {
  return `${SECTION_CACHE_PREFIX}${sectionId}:${rangeQuery || "default"}`;
}

export function AnalyticsSectionPage({ sectionId }: AnalyticsSectionPageProps) {
  const searchParams = useSearchParams();
  const primary = getAnalyticsPrimaryForSection(sectionId);
  const child = getAnalyticsSubSectionById(sectionId);
  const secondaryItems = primary ? getAnalyticsSecondaryForPrimary(primary.id) : [];
  const rangeQuery = useMemo(() => buildRangeQuery(searchParams), [searchParams]);
  const searchParamsString = searchParams?.toString() ?? "";
  const fullRangeSuffix = rangeQuery ? `&${rangeQuery}` : "";

  const resource = useDashboardResource<SectionViewModel>({
    cacheKey: sectionCacheKey(sectionId, rangeQuery),
    deps: [sectionId, rangeQuery, searchParamsString, child?.id],
    load: async ({ signal, refresh }) => {
      const params = new URLSearchParams(searchParamsString);
      const isOpsSection = Boolean(child && OPS_DOMAINS.includes(child.dataDomain as (typeof OPS_DOMAINS)[number]));

      if (isOpsSection) {
        if (child?.dataDomain === "decisionDashboard") {
          const from = params.get("from");
          const to = params.get("to");
          let lookback = 30;
          if (from && to) {
            const fromDate = new Date(`${from}T00:00:00.000Z`);
            const toDate = new Date(`${to}T23:59:59.999Z`);
            if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && fromDate <= toDate) {
              lookback = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
            }
          } else {
            lookback = Number((params.get("range") || "30d").replace("d", "")) || 30;
          }

          const response = await fetch(
            `/api/analytics/decision-dashboard?lookbackDays=${Math.max(7, Math.min(120, lookback))}`,
            { signal, cache: refresh ? "no-store" : "default" }
          );
          if (!response.ok) {
            throw new Error(`Decision dashboard request failed (${response.status})`);
          }

          return {
            analyticsData: null,
            auxPayload: (await response.json()) as Record<string, unknown>,
          };
        }

        if (child?.dataDomain === "flowMetrics") {
          if (!params.get("from") || !params.get("to")) {
            const now = new Date();
            params.set("from", new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
            params.set("to", now.toISOString().slice(0, 10));
          }
          const response = await fetch(`/api/flow/metrics?${params.toString()}&interval=week`, {
            signal,
            cache: refresh ? "no-store" : "default",
          });
          if (!response.ok) {
            throw new Error(`Flow metrics request failed (${response.status})`);
          }

          return {
            analyticsData: null,
            auxPayload: (await response.json()) as Record<string, unknown>,
          };
        }

        if (child?.dataDomain === "flowRisk") {
          const response = await fetch("/api/flow/risk?blockerLookbackDays=30&fixedDateLookaheadDays=14", {
            signal,
            cache: refresh ? "no-store" : "default",
          });
          if (!response.ok) {
            throw new Error(`Flow risk request failed (${response.status})`);
          }

          return {
            analyticsData: null,
            auxPayload: (await response.json()) as Record<string, unknown>,
          };
        }

        if (child?.dataDomain === "observability") {
          const response = await fetch("/api/ops/observability", {
            signal,
            cache: refresh ? "no-store" : "default",
          });
          if (!response.ok) {
            throw new Error(`Observability request failed (${response.status})`);
          }

          return {
            analyticsData: null,
            auxPayload: (await response.json()) as Record<string, unknown>,
          };
        }
      }

      const analyticsParams = new URLSearchParams(rangeQuery);
      analyticsParams.set("section", sectionId);
      if (refresh) {
        analyticsParams.set("refresh", "true");
      }

      const response = await fetch(`/api/analytics?${analyticsParams.toString()}`, {
        signal,
        cache: refresh ? "no-store" : "default",
      });
      if (!response.ok) {
        throw new Error(`Analytics section request failed (${response.status})`);
      }

      return {
        analyticsData: (await response.json()) as AnalyticsDashboardData,
        auxPayload: null,
      };
    },
    getLastUpdatedAt: (payload) => {
      return payload.analyticsData?.meta?.servedAt ?? payload.analyticsData?.lastFullRefresh ?? null;
    },
    mapError: (error) => {
      if (error instanceof Error && error.message.trim().length > 0) return error.message;
      return "Failed to load section.";
    },
  });

  if (!primary) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Unknown section. <Link href="/analytics" className="text-primary">Back to analytics</Link>
      </div>
    );
  }

  const analyticsData = resource.data?.analyticsData ?? null;
  const auxPayload = resource.data?.auxPayload ?? null;
  const title = child?.label ?? primary.label;

  const renderPrimaryById = (id: string) => {
    if (id === "ads-traffic") return <MarketingTabNew data={analyticsData} />;
    if (id === "finance") return <FinanceTab data={analyticsData} />;
    if (id === "sales-pipeline") return <SalesFunnelTab data={analyticsData} />;
    if (id === "customer-success") return <CustomerSuccessTab data={analyticsData} />;
    return null;
  };

  const renderPrimary = () => renderPrimaryById(sectionId);

  const renderChild = () => {
    if (!child) return null;

    const renderKind = resolveAnalyticsChildRenderKind({
      childId: child.id,
      childDataDomain: child.dataDomain,
    });
    if (renderKind === "decisionDashboard") return <DecisionDashboardView payload={auxPayload} />;
    if (renderKind === "flowMetrics") return <FlowMetricsView payload={auxPayload} />;
    if (renderKind === "flowRisk") return <FlowRiskView payload={auxPayload} />;
    if (renderKind === "observability") return <ObservabilityView payload={auxPayload} />;
    const primaryId = primary?.id;
    if (!primaryId) return null;

    const dashboard = renderKind === "finance-stripe"
      ? <FinanceStripeTab data={analyticsData} />
      : renderKind === "finance-hubspot"
        ? <FinanceHubSpotTab data={analyticsData} />
        : renderKind === "sales-hubspot"
          ? <SalesFunnelTab data={analyticsData} />
          : renderPrimaryById(primaryId);

    return (
      <div className="space-y-4">
        {dashboard}
        <LifecycleFunnelPanel
          lifecycle={analyticsData?.lifecycleFunnel ?? null}
          insights={analyticsData?.aiInsights?.global ?? []}
          sectionFocus={primaryId}
        />
        <AiInsightsPanel bundle={analyticsData?.aiInsights ?? null} defaultFilter={primaryId} />
      </div>
    );
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            First-class analytics with integration drill-down.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnalyticsTimeRangeControls />
          <button
            type="button"
            onClick={resource.refresh}
            disabled={resource.refreshing}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            {resource.refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </div>

      {(resource.stale || (analyticsData?.staleDomains.length ?? 0) > 0) && (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
        />
      )}

      {resource.error ? (
        <DashboardErrorBanner
          message={resource.error}
          onRetry={resource.refresh}
          settingsHref={`/settings?tab=integrations${fullRangeSuffix}`}
        />
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {secondaryItems.map((item) => (
          <Link
            key={item.id}
            href={`${item.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
            className={`rounded-md px-2 py-1 text-xs ${
              item.id === child?.id
                ? "bg-primary/90 text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {resource.loading && !resource.data ? (
        <DashboardLoadingState message="Loading section..." className="h-[30vh]" />
      ) : !resource.data ? (
        <DashboardEmptyState
          title="Section unavailable"
          message="No section data is available right now."
          actionLabel="Refresh now"
          onAction={resource.refresh}
        />
      ) : child ? (
        <div className="space-y-4">
          {renderChild()}
          {analyticsData?.aiInsights && (
            <AiInsightsPanel
              bundle={analyticsData.aiInsights}
              defaultFilter={primary.id}
              compact
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {renderPrimary()}
          <LifecycleFunnelPanel
            lifecycle={analyticsData?.lifecycleFunnel ?? null}
            insights={analyticsData?.aiInsights?.global ?? []}
            sectionFocus={primary.id}
          />
          <AiInsightsPanel bundle={analyticsData?.aiInsights ?? null} defaultFilter={primary.id} />
        </div>
      )}

      <div className="text-right text-[11px] text-muted-foreground">
        <Link href={`/settings?tab=integrations${fullRangeSuffix}`} className="hover:text-foreground">
          Manage integration connection status in Settings
        </Link>
      </div>
    </div>
  );
}
