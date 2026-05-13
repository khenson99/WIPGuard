"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";

const MarketingTabNew = dynamic(() => import("@/components/analytics/marketing-tab-new").then((m) => m.MarketingTabNew), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceTab = dynamic(() => import("@/components/analytics/finance-tab").then((m) => m.FinanceTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceStripeTab = dynamic(() => import("@/components/analytics/finance-stripe-tab").then((m) => m.FinanceStripeTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceHubSpotTab = dynamic(() => import("@/components/analytics/finance-hubspot-tab").then((m) => m.FinanceHubSpotTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceMercuryTab = dynamic(() => import("@/components/analytics/finance-mercury-tab").then((m) => m.FinanceMercuryTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const SalesFunnelTab = dynamic(() => import("@/components/analytics/sales-funnel-tab").then((m) => m.SalesFunnelTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const CustomerSuccessTab = dynamic(() => import("@/components/analytics/customer-success-tab").then((m) => m.CustomerSuccessTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsGoogleAnalyticsTab = dynamic(() => import("@/components/analytics/ads-google-analytics-tab").then((m) => m.AdsGoogleAnalyticsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsGoogleAdsTab = dynamic(() => import("@/components/analytics/ads-google-ads-tab").then((m) => m.AdsGoogleAdsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsMetaAdsTab = dynamic(() => import("@/components/analytics/ads-meta-ads-tab").then((m) => m.AdsMetaAdsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsRedditAdsTab = dynamic(() => import("@/components/analytics/ads-reddit-ads-tab").then((m) => m.AdsRedditAdsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsWebflowTab = dynamic(() => import("@/components/analytics/ads-webflow-tab").then((m) => m.AdsWebflowTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsSemrushTab = dynamic(() => import("@/components/analytics/ads-semrush-tab").then((m) => m.AdsSemrushTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AdsCodaKanbanTab = dynamic(() => import("@/components/analytics/ads-coda-kanban-tab").then((m) => m.AdsCodaKanbanTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const SalesHubspotTab = dynamic(() => import("@/components/analytics/sales-hubspot-tab").then((m) => m.SalesHubspotTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const SalesStripeTab = dynamic(() => import("@/components/analytics/sales-stripe-tab").then((m) => m.SalesStripeTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const SalesPerformanceView = dynamic(() => import("@/components/analytics/sales-performance-view").then((m) => m.SalesPerformanceView), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const GenericWorkspaceTab = dynamic(() => import("@/components/analytics/generic-workspace-tab").then((m) => m.GenericWorkspaceTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const GenericSlackTab = dynamic(() => import("@/components/analytics/generic-slack-tab").then((m) => m.GenericSlackTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const CsPylonTab = dynamic(() => import("@/components/analytics/cs-pylon-tab").then((m) => m.CsPylonTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const LifecycleFunnelPanel = dynamic(() => import("@/components/analytics/lifecycle-funnel-panel").then((m) => m.LifecycleFunnelPanel), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const AiInsightsPanel = dynamic(() => import("@/components/analytics/ai-insights-panel").then((m) => m.AiInsightsPanel), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const GoogleAnalyticsDashboard = dynamic(() => import("./sub-dashboards/google-analytics-dashboard").then((m) => m.GoogleAnalyticsDashboard), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const StripeDashboard = dynamic(() => import("./sub-dashboards/stripe-dashboard").then((m) => m.StripeDashboard), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const HubspotSalesDashboard = dynamic(() => import("./sub-dashboards/hubspot-sales-dashboard").then((m) => m.HubspotSalesDashboard), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const CustomerJourneyTab = dynamic(() => import("@/components/analytics/customer-journey-tab").then((m) => m.CustomerJourneyTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const DemoAnalyticsTab = dynamic(() => import("@/components/analytics/demo-analytics-tab").then((m) => m.DemoAnalyticsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const ProcessAnalyticsTab = dynamic(() => import("@/components/analytics/process-analytics-tab").then((m) => m.ProcessAnalyticsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const CustomerJourneyDrillDown = dynamic(() => import("@/components/analytics/customer-journey-drill-down").then((m) => m.CustomerJourneyDrillDown), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const CustomerJourneyConversionTab = dynamic(() => import("@/components/analytics/customer-journey-conversion-tab").then((m) => m.CustomerJourneyConversionTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const VisitorFunnelTab = dynamic(() => import("@/components/analytics/visitor-funnel-tab").then((m) => m.VisitorFunnelTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const DemoSchedulingView = dynamic(() => import("@/components/analytics/demo-scheduling-view").then((m) => m.DemoSchedulingView), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const DemoAttributionView = dynamic(() => import("@/components/analytics/demo-attribution-view").then((m) => m.DemoAttributionView), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const DemoCoachingView = dynamic(() => import("@/components/analytics/demo-coaching-view").then((m) => m.DemoCoachingView), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const ProcessBottlenecksView = dynamic(() => import("@/components/analytics/process-bottlenecks-view").then((m) => m.ProcessBottlenecksView), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const ProcessHealthView = dynamic(() => import("@/components/analytics/process-health-view").then((m) => m.ProcessHealthView), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinancePlanningTab = dynamic(() => import("@/components/analytics/finance-planning-tab").then((m) => m.FinancePlanningTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceForecastTab = dynamic(() => import("@/components/analytics/finance-forecast-tab").then((m) => m.FinanceForecastTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinancePnlTab = dynamic(() => import("@/components/analytics/finance-pnl-tab").then((m) => m.FinancePnlTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceUnitEconomicsTab = dynamic(() => import("@/components/analytics/finance-unit-economics-tab").then((m) => m.FinanceUnitEconomicsTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const FinanceMonthlyHistoryTab = dynamic(() => import("@/components/analytics/finance-monthly-history-tab").then((m) => m.FinanceMonthlyHistoryTab), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
const ExecutiveAiBrief = dynamic(() => import("@/components/analytics/executive-ai-brief").then((m) => m.ExecutiveAiBrief), { loading: () => <DashboardLoadingState message="Loading section..." className="h-48" /> });
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { buildRangeQuery } from "@/lib/analytics/time-range";
import {
  ANALYTICS_SUB_SECTIONS,
  getAnalyticsPrimaryForSection,
  getAnalyticsSecondaryForPrimary,
  getAnalyticsSubSectionById,
} from "@/lib/analytics/section-registry";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { populateConnectionStatus } from "@/hooks/use-connection-status";

interface AnalyticsSectionPageProps {
  sectionId: string;
}

interface SectionViewModel {
  analyticsData: AnalyticsDashboardData | null;
}

const SECTION_CACHE_PREFIX = "analytics:section:v2:";

const SUB_DASHBOARD_MAP: Record<string, React.ComponentType<{ data: AnalyticsDashboardData | null }>> = {
  "ads-google-analytics": GoogleAnalyticsDashboard,
  "finance-stripe": StripeDashboard,
  "sales-stripe": StripeDashboard,
  "sales-hubspot": HubspotSalesDashboard,
  "finance-hubspot": HubspotSalesDashboard,
};

export type AnalyticsChildRenderKind =
  | "finance-stripe"
  | "finance-hubspot"
  | "finance-mercury"
  | "sales-hubspot"
  | "sales-stripe"
  | "sales-performance"
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
  | "cs-google-workspace"
  | "cs-slack"
  | "customerJourneyDrillDown"
  | "customerJourneyConversion"
  | "visitorFunnel"
  | "demoScheduling"
  | "demoAttribution"
  | "demoCoaching"
  | "processBottlenecks"
  | "processHealth"
  | "finance-planning"
  | "finance-forecast"
  | "finance-pnl"
  | "finance-unit-economics"
  | "finance-monthly-history"
  | "finance-ai-brief"
  | "snapshot";

const CHILD_ID_TO_RENDER_KIND = {
  // Finance
  "finance-stripe": "finance-stripe",
  "finance-hubspot": "finance-hubspot",
  "finance-mercury": "finance-mercury",
  "finance-planning": "finance-planning",
  "finance-forecast": "finance-forecast",
  "finance-pnl": "finance-pnl",
  "finance-unit-economics": "finance-unit-economics",
  "finance-monthly-history": "finance-monthly-history",
  "finance-ai-brief": "finance-ai-brief",
  // Sales
  "sales-hubspot": "sales-hubspot",
  "sales-stripe": "sales-stripe",
  "sales-performance": "sales-performance",
  "sales-google-workspace": "sales-google-workspace",
  "sales-slack": "sales-slack",
  // Website traffic + social media children
  "ads-google-analytics": "ads-google-analytics",
  "ads-google-ads": "ads-google-ads",
  "ads-meta-ads": "ads-meta-ads",
  "ads-reddit-ads": "ads-reddit-ads",
  "ads-webflow": "ads-webflow",
  "ads-semrush": "ads-semrush",
  "ads-coda-kanban": "ads-coda-kanban",
  // Customer Success
  "cs-pylon": "cs-pylon",
  "cs-google-workspace": "cs-google-workspace",
  "cs-slack": "cs-slack",
  // Customer Journey
  "cj-touchpoints": "customerJourneyDrillDown",
  "cj-conversion": "customerJourneyConversion",
  "cj-acquisition-funnel": "visitorFunnel",
  // Demo Analytics
  "demo-scheduling": "demoScheduling",
  "demo-attribution": "demoAttribution",
  "demo-coaching": "demoCoaching",
  // Process Analytics
  "process-bottlenecks": "processBottlenecks",
  "process-velocity": "processBottlenecks",
  "process-health": "processHealth",
  "process-throughput": "processHealth",
} as const satisfies Record<string, AnalyticsChildRenderKind>;

const DATA_DOMAIN_TO_RENDER_KIND = {
  customerJourney: "customerJourneyDrillDown",
  visitorFunnel: "visitorFunnel",
  demoAnalytics: "demoScheduling",
  processAnalytics: "processBottlenecks",
} as const satisfies Record<string, AnalyticsChildRenderKind>;

/**
 * Resolve which render variant to use for an analytics child section.
 *
 * Resolution order is intentional: `childId` is checked before `childDataDomain`
 * because it is the more specific identifier. Several Ops sub-sections share a
 * `dataDomain` (e.g. multiple entries map to "processAnalytics"), so resolving by
 * `childId` first ensures the correct specialised view is selected. The previous
 * if-chain checked `childDataDomain` first for some Ops entries, but that was a
 * latent inconsistency -- `childId` should always take priority.
 */
export function resolveAnalyticsChildRenderKind(input: {
  childId: string;
  childDataDomain: string;
}): AnalyticsChildRenderKind {
  return (
    (CHILD_ID_TO_RENDER_KIND as Record<string, AnalyticsChildRenderKind>)[input.childId] ??
    (DATA_DOMAIN_TO_RENDER_KIND as Record<string, AnalyticsChildRenderKind>)[input.childDataDomain] ??
    "snapshot"
  );
}

function sectionCacheKey(sectionId: string, querySignature: string): string {
  return `${SECTION_CACHE_PREFIX}${sectionId}:${querySignature || "default"}`;
}

function staleDomainsForSection(sectionId: string, staleDomains: string[]): string[] {
  const primary = getAnalyticsPrimaryForSection(sectionId);
  const child = getAnalyticsSubSectionById(sectionId);
  const relevantDomains = new Set<string>();

  if (child) {
    relevantDomains.add(child.dataDomain);
  } else if (primary) {
    ANALYTICS_SUB_SECTIONS.filter((item) => item.parentId === primary.id).forEach((item) => {
      relevantDomains.add(item.dataDomain);
    });
  }

  if (relevantDomains.has("metaAds")) {
    relevantDomains.add("metaPage");
    relevantDomains.add("instagram");
  }

  return staleDomains.filter((domain) => relevantDomains.has(domain));
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
  const summary = useMemo(() => summarizePayload(payload ?? {}), [payload]);

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
    cacheKey: sectionCacheKey(sectionId, searchParamsString),
    deps: [sectionId, rangeQuery, searchParamsString, child?.id],
    load: async ({ signal, refresh }) => {
      const analyticsParams = new URLSearchParams(searchParamsString);
      analyticsParams.set("section", sectionId);
      if (refresh) {
        analyticsParams.set("refresh", "true");
      }

      const response = await fetch(`/api/analytics?${analyticsParams.toString()}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Analytics section request failed (${response.status})`);
      }

      const analyticsData = (await response.json()) as AnalyticsDashboardData;

      // Populate connection status store with freshness data
      populateConnectionStatus(analyticsData?.freshness, analyticsData);

      return {
        analyticsData,
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

  const analyticsData = resource.data?.analyticsData ?? null;
  const relevantStaleDomains = staleDomainsForSection(sectionId, analyticsData?.staleDomains ?? []);
  const relevantErroredDomains = useMemo(() => {
    const errored = new Set(analyticsData?.meta?.erroredDomains ?? []);
    return relevantStaleDomains.filter((domain) => errored.has(domain));
  }, [analyticsData?.meta?.erroredDomains, relevantStaleDomains]);
  const relevantFallbackDomains = useMemo(() => {
    if (relevantErroredDomains.length === 0) return relevantStaleDomains;
    const errored = new Set(relevantErroredDomains);
    return relevantStaleDomains.filter((domain) => !errored.has(domain));
  }, [relevantErroredDomains, relevantStaleDomains]);
  const title = child?.label ?? primary?.label ?? "Analytics";

  const primaryContent = useMemo(() => {
    if (sectionId === "website-traffic") return <MarketingTabNew data={analyticsData} variant="website-traffic" />;
    if (sectionId === "social-media") return <MarketingTabNew data={analyticsData} variant="social-media" />;
    if (sectionId === "finance") return <FinanceTab data={analyticsData} />;
    if (sectionId === "sales-pipeline") return <SalesFunnelTab data={analyticsData} />;
    if (sectionId === "customer-success") return <CustomerSuccessTab data={analyticsData} />;
    if (sectionId === "customer-journey") return <CustomerJourneyTab data={analyticsData} />;
    if (sectionId === "demo-analytics") return <DemoAnalyticsTab data={analyticsData} />;
    if (sectionId === "process-analytics") return <ProcessAnalyticsTab data={analyticsData} />;
    return null;
  }, [sectionId, analyticsData]);

  const childContent = useMemo(() => {
    if (!child) return null;

    const renderKind = resolveAnalyticsChildRenderKind({
      childId: child.id,
      childDataDomain: child.dataDomain,
    });
    // Finance
    if (renderKind === "finance-stripe") return <FinanceStripeTab data={analyticsData} />;
    if (renderKind === "finance-hubspot") return <FinanceHubSpotTab data={analyticsData} />;
    if (renderKind === "finance-mercury") return <FinanceMercuryTab data={analyticsData} />;
    if (renderKind === "finance-planning") return <FinancePlanningTab data={analyticsData} />;
    if (renderKind === "finance-forecast") return <FinanceForecastTab data={analyticsData} />;
    if (renderKind === "finance-pnl") return <FinancePnlTab data={analyticsData} />;
    if (renderKind === "finance-unit-economics") return <FinanceUnitEconomicsTab data={analyticsData} />;
    if (renderKind === "finance-monthly-history") return <FinanceMonthlyHistoryTab />;
    if (renderKind === "finance-ai-brief") return <ExecutiveAiBrief />;
    // Sales
    if (renderKind === "sales-hubspot") return <SalesHubspotTab data={analyticsData} />;
    if (renderKind === "sales-stripe") return <SalesStripeTab data={analyticsData} />;
    if (renderKind === "sales-performance") return <SalesPerformanceView pack={analyticsData?.salesPerformance ?? null} />;
    if (renderKind === "sales-google-workspace") return <GenericWorkspaceTab data={analyticsData} />;
    if (renderKind === "sales-slack") return <GenericSlackTab data={analyticsData} />;
    // Website traffic + social media
    if (renderKind === "ads-google-analytics") return <AdsGoogleAnalyticsTab data={analyticsData} />;
    if (renderKind === "ads-google-ads") return <AdsGoogleAdsTab data={analyticsData} />;
    if (renderKind === "ads-meta-ads") return <AdsMetaAdsTab data={analyticsData} />;
    if (renderKind === "ads-reddit-ads") return <AdsRedditAdsTab data={analyticsData} />;
    if (renderKind === "ads-webflow") return <AdsWebflowTab data={analyticsData} />;
    if (renderKind === "ads-semrush") return <AdsSemrushTab data={analyticsData} />;
    if (renderKind === "ads-coda-kanban") return <AdsCodaKanbanTab data={analyticsData} />;
    // Customer Success
    if (renderKind === "cs-pylon") return <CsPylonTab data={analyticsData} />;
    if (renderKind === "cs-google-workspace") return <GenericWorkspaceTab data={analyticsData} />;
    if (renderKind === "cs-slack") return <GenericSlackTab data={analyticsData} />;
    if (renderKind === "customerJourneyDrillDown") return <CustomerJourneyDrillDown data={analyticsData} />;
    if (renderKind === "customerJourneyConversion") return <CustomerJourneyConversionTab data={analyticsData} />;
    if (renderKind === "visitorFunnel") return <VisitorFunnelTab data={analyticsData} />;
    if (renderKind === "demoScheduling") return <DemoSchedulingView data={analyticsData} />;
    if (renderKind === "demoAttribution") return <DemoAttributionView data={analyticsData} />;
    if (renderKind === "demoCoaching") return <DemoCoachingView data={analyticsData} />;
    if (renderKind === "processBottlenecks") return <ProcessBottlenecksView data={analyticsData} />;
    if (renderKind === "processHealth") return <ProcessHealthView data={analyticsData} />;

    // Check for dedicated sub-dashboard component
    const SubDashboard = SUB_DASHBOARD_MAP[sectionId];
    if (SubDashboard) {
      return <SubDashboard data={analyticsData} />;
    }

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
  }, [child, analyticsData, sectionId]);

  if (!primary) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Unknown section.{" "}
        <Link href="/analytics" className="text-primary">
          Back to analytics
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full space-y-6 overflow-y-auto p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            Funnel-stage analytics with integration drill-down.
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

      {!resource.error && (resource.stale || relevantFallbackDomains.length > 0) && (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label={
            relevantFallbackDomains.length > 0
              ? `Showing cached data for stale providers: ${relevantFallbackDomains.join(", ")}.`
              : undefined
          }
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
          {childContent}
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
          {primaryContent}
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
