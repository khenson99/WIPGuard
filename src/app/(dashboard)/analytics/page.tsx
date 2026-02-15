"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, RefreshCw, Clock, AlertCircle } from "lucide-react";
import { ANALYTICS_TABS } from "@/lib/analytics/types";
import type { AnalyticsDashboardData, AnalyticsTab } from "@/lib/analytics/types";
import { OverviewTab } from "@/components/analytics/overview-tab";
import { MarketingTab } from "@/components/analytics/marketing-tab";
import { SalesFunnelTab } from "@/components/analytics/sales-funnel-tab";
import { ActionPlanTab } from "@/components/analytics/action-plan-tab";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const url = forceRefresh ? "/api/analytics?refresh=true" : "/api/analytics";
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchData(); }, [fetchData]);

  // Hourly auto-refresh
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Live data from HubSpot, Stripe & Mercury
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {data?.errors && data.errors.length > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Some data sources unavailable</p>
              <p className="text-muted-foreground">
                {data.errors.map((e) => `${e.source}: ${e.message}`).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-border">
          {ANALYTICS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading analytics…</p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "overview" && <OverviewTab data={data} />}
            {activeTab === "marketing" && <MarketingTab data={data} />}
            {activeTab === "sales-funnel" && <SalesFunnelTab data={data} />}
            {activeTab === "action-plan" && <ActionPlanTab data={data} />}
          </>
        )}
      </div>
    </div>
  );
}
