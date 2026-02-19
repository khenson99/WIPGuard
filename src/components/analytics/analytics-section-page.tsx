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
import { FinanceMercuryTab } from "@/components/analytics/finance-mercury-tab";
import { AdsGoogleAnalyticsTab } from "@/components/analytics/ads-google-analytics-tab";
import { AdsGoogleAdsTab } from "@/components/analytics/ads-google-ads-tab";
import { AdsMetaAdsTab } from "@/components/analytics/ads-meta-ads-tab";
import { AdsRedditAdsTab } from "@/components/analytics/ads-reddit-ads-tab";
import { AdsWebflowTab } from "@/components/analytics/ads-webflow-tab";
import { AdsSemrushTab } from "@/components/analytics/ads-semrush-tab";
import { AdsCodaKanbanTab } from "@/components/analytics/ads-coda-kanban-tab";
import { SalesHubspotTab } from "@/components/analytics/sales-hubspot-tab";
import { SalesStripeTab } from "@/components/analytics/sales-stripe-tab";
import { GenericWorkspaceTab } from "@/components/analytics/generic-workspace-tab";
import { GenericSlackTab } from "@/components/analytics/generic-slack-tab";
import { CsPylonTab } from "@/components/analytics/cs-pylon-tab";
import { CsCodaTab } from "@/components/analytics/cs-coda-tab";
import { CsProductTab } from "@/components/analytics/cs-product-tab";
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
  | "finance-mercury"
  | "sales-hubspot"
  | "sales-stripe"
  | "sales-google-workspace"
  | "sales-slack"
  | "ads-google-analytics"
  | "ads-google-ads"
  | "ads-meta-ads"
  | "ads-reddit-ads"
  | "ads-webflow"
  | "ads-semrush"
  | "ads-coda-kanban"
  | "cs-pylon"
  | "cs-coda"
  | "cs-product"
  | "cs-google-workspace"
  | "cs-slack"
  | "decisionDashboard"
  | "flowMetrics"
  | "flowRisk"
  | "observability"
  | "snapshot";

export function resolveAnalyticsChildRenderKind(input: {
  childId: string;
  childDataDomain: ChildDataDomain;
}): AnalyticsChildRenderKind {
  // Finance
  if (input.childId === "finance-stripe") return "finance-stripe";
  if (input.childId === "finance-hubspot") return "finance-hubspot";
  if (input.childId === "finance-mercury") return "finance-mercury";
  // Sales
  if (input.childId === "sales-hubspot") return "sales-hubspot";
  if (input.childId === "sales-stripe") return "sales-stripe";
  if (input.childId === "sales-google-workspace") return "sales-google-workspace";
  if (input.childId === "sales-slack") return "sales-slack";
  // Ads & Traffic
  if (input.childId === "ads-google-analytics") return "ads-google-analytics";
  if (input.childId === "ads-google-ads") return "ads-google-ads";
  if (input.childId === "ads-meta-ads") return "ads-meta-ads";
  if (input.childId === "ads-reddit-ads") return "ads-reddit-ads";
  if (input.childId === "ads-webflow") return "ads-webflow";
  if (input.childId === "ads-semrush") return "ads-semrush";
  if (input.childId === "ads-coda-kanban") return "ads-coda-kanban";
  // Customer Success
  if (input.childId === "cs-pylon") return "cs-pylon";
  if (input.childId === "cs-coda") return "cs-coda";
  if (input.childId === "cs-product") return "cs-product";
  if (input.childId === "cs-google-workspace") return "cs-google-workspace";
  if (input.childId === "cs-slack") return "cs-slack";
  // Ops
  if (input.childDataDomain === "decisionDashboard") return "decisionDashboard";
  if (input.childDataDomain === "flowMetrics") return "flowMetrics";
  if (input.childDataDomain === "flowRisk") return "flowRisk";
  if (input.childDataDomain === "observability") return "observability";
  return "snapshot";
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

function summarizePayload(payload: Record<string, unknown>) {
  const keys = Object.keys(payload);
  const scalarEntries = keys.filter((key) => {
    const value = payload[key];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });
  const arrayEntries = keys.filter((key) => Array.isArray(payload[key]));
  const objectEntries = keys.filter((key) => {
    const value = payload[key];
    return !!value && typeof value === "object" && !Array.isArray(value);
  });
  return {
    scalarEntries,
    arrayEntries,
    objectEntries,
    totalKeys: keys.length,
  };
}

function SnapshotCards({
  title,
  payload,
  errors,
}: {
  title: string;
  payload: Record<string, unknown> | null;
  errors?: string[];
}) {
  if (!payload) {
    if (errors && errors.length > 0) {
      return (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
          <p className="font-medium text-foreground">{title} failed to load.</p>
          <p className="mt-1">{errors[0]}</p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No data available for this integration in the selected range.
      </div>
    );
  }

  const summary = summarizePayload(payload);

  if (summary.scalarEntries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="text-sm font-medium text-foreground">{title} loaded.</p>
        <p className="mt-1 text-xs">
          {summary.totalKeys} top-level keys · {summary.arrayEntries.length} arrays · {summary.objectEntries.length} nested objects.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.scalarEntries.slice(0, 12).map((key) => (
          <div key={key} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs capitalize text-muted-foreground">{key}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{String(payload[key])}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {summary.totalKeys} keys total · {summary.arrayEntries.length} arrays · {summary.objectEntries.length} nested objects
      </p>
    </div>
  );
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

  const renderPrimary = () => {
    if (sectionId === "ads-traffic") return <MarketingTabNew data={analyticsData} />;
    if (sectionId === "finance") return <FinanceTab data={analyticsData} />;
    if (sectionId === "sales-pipeline") return <SalesFunnelTab data={analyticsData} />;
    if (sectionId === "customer-success") return <CustomerSuccessTab data={analyticsData} />;
    return null;
  };

  const renderChild = () => {
    if (!child) return null;

    const renderKind = resolveAnalyticsChildRenderKind({
      childId: child.id,
      childDataDomain: child.dataDomain,
    });
    // Finance
    if (renderKind === "finance-stripe") return <FinanceStripeTab data={analyticsData} />;
    if (renderKind === "finance-hubspot") return <FinanceHubSpotTab data={analyticsData} />;
    if (renderKind === "finance-mercury") return <FinanceMercuryTab data={analyticsData} />;
    // Sales
    if (renderKind === "sales-hubspot") return <SalesHubspotTab data={analyticsData} />;
    if (renderKind === "sales-stripe") return <SalesStripeTab data={analyticsData} />;
    if (renderKind === "sales-google-workspace") return <GenericWorkspaceTab data={analyticsData} />;
    if (renderKind === "sales-slack") return <GenericSlackTab data={analyticsData} />;
    // Ads & Traffic
    if (renderKind === "ads-google-analytics") return <AdsGoogleAnalyticsTab data={analyticsData} />;
    if (renderKind === "ads-google-ads") return <AdsGoogleAdsTab data={analyticsData} />;
    if (renderKind === "ads-meta-ads") return <AdsMetaAdsTab data={analyticsData} />;
    if (renderKind === "ads-reddit-ads") return <AdsRedditAdsTab data={analyticsData} />;
    if (renderKind === "ads-webflow") return <AdsWebflowTab data={analyticsData} />;
    if (renderKind === "ads-semrush") return <AdsSemrushTab data={analyticsData} />;
    if (renderKind === "ads-coda-kanban") return <AdsCodaKanbanTab data={analyticsData} />;
    // Customer Success
    if (renderKind === "cs-pylon") return <CsPylonTab data={analyticsData} />;
    if (renderKind === "cs-coda") return <CsCodaTab data={analyticsData} />;
    if (renderKind === "cs-product") return <CsProductTab data={analyticsData} />;
    if (renderKind === "cs-google-workspace") return <GenericWorkspaceTab data={analyticsData} />;
    if (renderKind === "cs-slack") return <GenericSlackTab data={analyticsData} />;
    // Ops
    if (renderKind === "decisionDashboard") return <DecisionDashboardView payload={auxPayload} />;
    if (renderKind === "flowMetrics") return <FlowMetricsView payload={auxPayload} />;
    if (renderKind === "flowRisk") return <FlowRiskView payload={auxPayload} />;
    if (renderKind === "observability") return <ObservabilityView payload={auxPayload} />;

    // Fallback for any unrecognized sub-sections
    const payload = (analyticsData as unknown as Record<string, unknown>) || null;
    const domainKey = child.dataDomain;
    const domainPayload = (payload?.[domainKey] as Record<string, unknown> | null) ?? null;
    const domainErrors = (analyticsData?.errors ?? [])
      .filter((entry) => entry.source === domainKey)
      .map((entry) => entry.message);

    return (
      <SnapshotCards
        title={`${child.label} Snapshot`}
        payload={domainPayload}
        errors={domainErrors}
      />
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
