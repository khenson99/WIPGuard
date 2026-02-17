"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle, DollarSign, Users, Target, CheckSquare,
  Globe, Mail, TrendingUp, Clock, BarChart2, ArrowLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { SectionSkeleton } from "@/components/analytics/skeleton";
import { smartFormat, humanizeKey, guessIconForKey } from "@/lib/analytics/format";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import {
  getAnalyticsPrimaryForSection,
  getAnalyticsSecondaryForPrimary,
  getAnalyticsSubSectionById,
} from "@/lib/analytics/section-registry";

interface AnalyticsSectionPageProps {
  sectionId: string;
}

interface CachedSectionPayload {
  analyticsData: AnalyticsDashboardData | null;
  auxPayload: Record<string, unknown> | null;
}

const SECTION_CACHE_PREFIX = "analytics:section:v1:";
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
  | "snapshot";

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

function readSectionCache(sectionId: string, rangeQuery: string): CachedSectionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(sectionCacheKey(sectionId, rangeQuery));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSectionPayload>;
    return {
      analyticsData: (parsed.analyticsData as AnalyticsDashboardData | null) ?? null,
      auxPayload: (parsed.auxPayload as Record<string, unknown> | null) ?? null,
    };
  } catch {
    return null;
  }
}

function writeSectionCache(sectionId: string, rangeQuery: string, payload: CachedSectionPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(sectionCacheKey(sectionId, rangeQuery), JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (private browsing/storage quotas).
  }
}

const ICON_MAP: Record<string, LucideIcon> = {
  "dollar-sign": DollarSign,
  "users": Users,
  "target": Target,
  "check-square": CheckSquare,
  "globe": Globe,
  "mail": Mail,
  "trending-up": TrendingUp,
  "clock": Clock,
  "bar-chart-2": BarChart2,
};

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
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{title} failed to load.</p>
            <p className="mt-0.5 text-xs text-red-400">{errors[0]}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          No data available for this integration in the selected range.
        </p>
      </div>
    );
  }

  const scalarEntries = Object.entries(payload).filter(([, value]) => {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });

  if (scalarEntries.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">{title} — no scalar metrics found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {scalarEntries.slice(0, 12).map(([key, value]) => {
          const iconName = guessIconForKey(key);
          const IconComp = ICON_MAP[iconName] || BarChart2;
          return (
            <div
              key={key}
              className="group rounded-xl border border-border bg-card px-4 py-3 transition-all duration-200 hover:border-primary/30 hover:bg-secondary/30"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {humanizeKey(key)}
                </p>
                <div className="rounded-lg bg-primary/10 p-1 text-primary opacity-60 group-hover:opacity-100 transition-opacity">
                  <IconComp className="h-3 w-3" />
                </div>
              </div>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                {smartFormat(key, value)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsSectionPage({ sectionId }: AnalyticsSectionPageProps) {
  const searchParams = useSearchParams();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardData | null>(null);
  const [auxPayload, setAuxPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const primary = getAnalyticsPrimaryForSection(sectionId);
  const child = getAnalyticsSubSectionById(sectionId);
  const secondaryItems = primary ? getAnalyticsSecondaryForPrimary(primary.id) : [];
  const rangeQuery = useMemo(() => buildRangeQuery(searchParams), [searchParams]);
  const searchParamsString = searchParams?.toString() ?? "";
  const fullRangeSuffix = rangeQuery ? `&${rangeQuery}` : "";

  useEffect(() => {
    if (!primary) {
      setError("Section not found");
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const cached = readSectionCache(sectionId, rangeQuery);
    const isOpsSection = Boolean(
      child && OPS_DOMAINS.includes(child.dataDomain as (typeof OPS_DOMAINS)[number])
    );

    if (cached) {
      setAnalyticsData(cached.analyticsData);
      setAuxPayload(cached.auxPayload);
      setLoading(false);
    } else {
      setAnalyticsData(null);
      setAuxPayload(null);
      setLoading(true);
    }
    setError(null);

    const load = async () => {
      try {
        const params = new URLSearchParams(searchParamsString);
        let nextAnalytics: AnalyticsDashboardData | null = isOpsSection ? null : cached?.analyticsData ?? null;
        let nextAux: Record<string, unknown> | null = cached?.auxPayload ?? null;

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
            const response = await fetch(`/api/analytics/decision-dashboard?lookbackDays=${Math.max(7, Math.min(120, lookback))}`, {
              signal: controller.signal,
            });
            nextAux = (await response.json()) as Record<string, unknown>;
          } else if (child?.dataDomain === "flowMetrics") {
            if (!params.get("from") || !params.get("to")) {
              const now = new Date();
              params.set("from", new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
              params.set("to", now.toISOString().slice(0, 10));
            }
            const response = await fetch(`/api/flow/metrics?${params.toString()}&interval=week`, {
              signal: controller.signal,
            });
            nextAux = (await response.json()) as Record<string, unknown>;
          } else if (child?.dataDomain === "flowRisk") {
            const response = await fetch("/api/flow/risk?blockerLookbackDays=30&fixedDateLookaheadDays=14", {
              signal: controller.signal,
            });
            nextAux = (await response.json()) as Record<string, unknown>;
          } else if (child?.dataDomain === "observability") {
            const response = await fetch("/api/ops/observability", {
              signal: controller.signal,
            });
            nextAux = (await response.json()) as Record<string, unknown>;
          }
        } else {
          const response = await fetch(`/api/analytics?section=${sectionId}${rangeQuery ? `&${rangeQuery}` : ""}`, {
            signal: controller.signal,
          });
          nextAnalytics = (await response.json()) as AnalyticsDashboardData;
          nextAux = null;
        }

        if (!active) {
          return;
        }

        setAnalyticsData(nextAnalytics);
        setAuxPayload(nextAux);
        setError(null);
        writeSectionCache(sectionId, rangeQuery, {
          analyticsData: nextAnalytics,
          auxPayload: nextAux,
        });
      } catch (fetchError) {
        if (!active || (fetchError instanceof Error && fetchError.name === "AbortError")) {
          return;
        }
        if (!cached) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load section");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [sectionId, primary, child, rangeQuery, searchParamsString]);

  if (!primary) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Unknown section. <Link href="/analytics" className="text-primary">Back to analytics</Link>
      </div>
    );
  }

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
    if (renderKind === "finance-stripe") return <FinanceStripeTab data={analyticsData} />;
    if (renderKind === "finance-hubspot") return <FinanceHubSpotTab data={analyticsData} />;
    if (renderKind === "sales-hubspot") return <SalesFunnelTab data={analyticsData} />;
    if (renderKind === "decisionDashboard") return <DecisionDashboardView payload={auxPayload} />;
    if (renderKind === "flowMetrics") return <FlowMetricsView payload={auxPayload} />;
    if (renderKind === "flowRisk") return <FlowRiskView payload={auxPayload} />;
    if (renderKind === "observability") return <ObservabilityView payload={auxPayload} />;

    const payload = (analyticsData as unknown as Record<string, unknown>) || null;
    const domainKey = child.dataDomain;
    const domainPayload =
      domainKey === "product" || domainKey === "pylon"
        ? (payload?.[domainKey] as Record<string, unknown> | null)
        : (payload?.[domainKey] as Record<string, unknown> | null);
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
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/analytics${rangeQuery ? `?${rangeQuery}` : ""}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {primary.description || "First-class analytics with integration drill-down."}
            </p>
          </div>
        </div>
        <AnalyticsTimeRangeControls />
      </div>

      {/* Sub-section tabs */}
      {secondaryItems.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5">
          {secondaryItems.map((item) => {
            const isActive = item.id === child?.id;
            return (
              <Link
                key={item.id}
                href={`${item.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <SectionSkeleton />
      ) : error ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border bg-card">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm font-medium text-foreground">Failed to load section</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : (
        <>
          {child ? (
            renderChild()
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
        </>
      )}

      <div className="text-right text-[11px] text-muted-foreground">
        <Link href={`/settings?tab=integrations${fullRangeSuffix}`} className="hover:text-foreground">
          Manage integration connection status in Settings
        </Link>
      </div>
    </div>
  );
}
