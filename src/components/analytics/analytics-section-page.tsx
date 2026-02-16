"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketingTabNew } from "@/components/analytics/marketing-tab-new";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { SalesFunnelTab } from "@/components/analytics/sales-funnel-tab";
import { CustomerSuccessTab } from "@/components/analytics/customer-success-tab";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import {
  DecisionDashboardView,
  FlowMetricsView,
  FlowRiskView,
  ObservabilityView,
} from "@/components/analytics/ops-insights";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  getAnalyticsPrimaryForSection,
  getAnalyticsSecondaryForPrimary,
  getAnalyticsSubSectionById,
} from "@/lib/analytics/section-registry";

interface AnalyticsSectionPageProps {
  sectionId: string;
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

function SnapshotCards({
  title,
  payload,
}: {
  title: string;
  payload: Record<string, unknown> | null;
}) {
  if (!payload) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No data available for this integration in the selected range.
      </div>
    );
  }

  const scalarEntries = Object.entries(payload).filter(([, value]) => {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });

  if (scalarEntries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        {title} loaded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {scalarEntries.slice(0, 12).map(([key, value]) => (
          <div key={key} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs capitalize text-muted-foreground">{key}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{String(value)}</p>
          </div>
        ))}
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
  const fullRangeSuffix = rangeQuery ? `&${rangeQuery}` : "";

  useEffect(() => {
    if (!primary) {
      setError("Section not found");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        setAuxPayload(null);

        if (!child || ["decisionDashboard", "flowMetrics", "flowRisk", "observability"].includes(child.dataDomain)) {
          const tasks: Array<Promise<unknown>> = [];

          if (!child || ["decisionDashboard", "flowMetrics", "flowRisk", "observability"].includes(child.dataDomain) === false) {
            tasks.push(
              fetch(`/api/analytics?section=${sectionId}${rangeQuery ? `&${rangeQuery}` : ""}`, { cache: "no-store" })
                .then((response) => response.json())
                .then((payload) => setAnalyticsData(payload as AnalyticsDashboardData))
            );
          }

          if (child?.dataDomain === "decisionDashboard") {
            const from = searchParams?.get("from");
            const to = searchParams?.get("to");
            let lookback = 30;
            if (from && to) {
              const fromDate = new Date(`${from}T00:00:00.000Z`);
              const toDate = new Date(`${to}T23:59:59.999Z`);
              if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && fromDate <= toDate) {
                lookback = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
              }
            } else {
              lookback = Number((searchParams?.get("range") || "30d").replace("d", "")) || 30;
            }
            tasks.push(
              fetch(`/api/analytics/decision-dashboard?lookbackDays=${Math.max(7, Math.min(120, lookback))}`, { cache: "no-store" })
                .then((response) => response.json())
                .then((payload) => setAuxPayload(payload as Record<string, unknown>))
            );
          } else if (child?.dataDomain === "flowMetrics") {
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            if (!params.get("from") || !params.get("to")) {
              const now = new Date();
              params.set("from", new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
              params.set("to", now.toISOString().slice(0, 10));
            }
            tasks.push(
              fetch(`/api/flow/metrics?${params.toString()}&interval=week`, { cache: "no-store" })
                .then((response) => response.json())
                .then((payload) => setAuxPayload(payload as Record<string, unknown>))
            );
          } else if (child?.dataDomain === "flowRisk") {
            tasks.push(
              fetch("/api/flow/risk?blockerLookbackDays=30&fixedDateLookaheadDays=14", { cache: "no-store" })
                .then((response) => response.json())
                .then((payload) => setAuxPayload(payload as Record<string, unknown>))
            );
          } else if (child?.dataDomain === "observability") {
            tasks.push(
              fetch("/api/ops/observability", { cache: "no-store" })
                .then((response) => response.json())
                .then((payload) => setAuxPayload(payload as Record<string, unknown>))
            );
          }

          await Promise.all(tasks);
        } else {
          const response = await fetch(`/api/analytics?section=${sectionId}${rangeQuery ? `&${rangeQuery}` : ""}`, {
            cache: "no-store",
          });
          const payload = (await response.json()) as AnalyticsDashboardData;
          setAnalyticsData(payload);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load section");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [sectionId, primary, child, rangeQuery, searchParams]);

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

    if (child.dataDomain === "decisionDashboard") {
      return <DecisionDashboardView payload={auxPayload} />;
    }
    if (child.dataDomain === "flowMetrics") {
      return <FlowMetricsView payload={auxPayload} />;
    }
    if (child.dataDomain === "flowRisk") {
      return <FlowRiskView payload={auxPayload} />;
    }
    if (child.dataDomain === "observability") {
      return <ObservabilityView payload={auxPayload} />;
    }

    const payload = (analyticsData as unknown as Record<string, unknown>) || null;
    const domainKey = child.dataDomain;
    const domainPayload =
      domainKey === "product" || domainKey === "pylon"
        ? (payload?.[domainKey] as Record<string, unknown> | null)
        : (payload?.[domainKey] as Record<string, unknown> | null);

    return <SnapshotCards title={`${child.label} Snapshot`} payload={domainPayload} />;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            First-class analytics with integration drill-down.
          </p>
        </div>
        <AnalyticsTimeRangeControls />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {ANALYTICS_PRIMARY_SECTIONS.map((item) => (
          <Link
            key={item.id}
            href={`${item.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
            className={`rounded-md px-2 py-1 text-xs ${
              item.id === primary.id
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

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

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading section...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>
      ) : (
        <>{child ? renderChild() : renderPrimary()}</>
      )}

      <div className="text-right text-[11px] text-muted-foreground">
        <Link href={`/settings?tab=integrations${fullRangeSuffix}`} className="hover:text-foreground">
          Manage integration connection status in Settings
        </Link>
      </div>
    </div>
  );
}
