"use client";

import {
  FileText, Database, Calendar,
  FormInput, Link2,
} from "lucide-react";
import type { AnalyticsDashboardData, WebflowFormEntry } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { StatCard } from "@/components/analytics/stat-card";
import {
  timeAgo,
  AlertBanner, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";

interface AdsWebflowTabProps {
  data: AnalyticsDashboardData | null;
}

export function AdsWebflowTab({ data }: AdsWebflowTabProps) {
  const webflow = data?.webflow;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "webflow")
      .map((entry) => entry.message),
    ...(data?.freshness?.webflow?.lastError ? [data.freshness.webflow.lastError] : []),
  ];

  if (!webflow) {
    return (
      <FinanceDataEmptyState
        title="Webflow data is unavailable"
        message="We could not load Webflow site data for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const {
    siteName, lastPublished, totalPages, totalCollections,
    formSubmissions, customDomains,
  } = webflow;

  // ── Derived metrics ──
  const totalFormSubmissions = formSubmissions.reduce((sum, f) => sum + f.count, 0);
  const referenceTimestamp = data?.meta?.servedAt
    ? new Date(data.meta.servedAt).getTime()
    : null;
  const lastPublishedTimestamp = lastPublished ? new Date(lastPublished).getTime() : null;
  const daysSincePublish = referenceTimestamp !== null && lastPublishedTimestamp !== null
    ? Math.floor((referenceTimestamp - lastPublishedTimestamp) / (1000 * 60 * 60 * 24))
    : null;

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (daysSincePublish !== null && daysSincePublish > 30) {
    alerts.push({
      severity: "warning",
      title: `Site hasn't been published in ${daysSincePublish} days`,
      description: "Stale content may impact SEO and user experience. Review pending changes and publish.",
    });
  }
  if (daysSincePublish !== null && daysSincePublish > 90) {
    alerts.push({
      severity: "critical",
      title: `Site is ${daysSincePublish} days stale`,
      description: "The site hasn't been published in over 3 months. Unpublished changes may be accumulating. Review and publish immediately.",
    });
  }
  if (customDomains.length === 0) {
    alerts.push({
      severity: "info",
      title: "No custom domains configured",
      description: "Site is only accessible via Webflow subdomain. Add a custom domain for a professional presence.",
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (daysSincePublish !== null && daysSincePublish <= 7) {
    insights.push({
      title: "Recently Published",
      insight: `Site was published ${daysSincePublish === 0 ? "today" : `${daysSincePublish} day${daysSincePublish !== 1 ? "s" : ""} ago`}. Content is fresh and up-to-date.`,
      severity: "success",
    });
  }
  if (totalFormSubmissions > 0) {
    const topForm = [...formSubmissions].sort((a, b) => b.count - a.count)[0];
    insights.push({
      title: "Form Activity",
      insight: `${totalFormSubmissions} total form submission${totalFormSubmissions !== 1 ? "s" : ""}. "${topForm.formName}" leads with ${topForm.count} submission${topForm.count !== 1 ? "s" : ""}.`,
      severity: "success",
    });
  }
  if (totalPages > 50) {
    insights.push({
      title: "Large Site",
      insight: `${totalPages} pages — consider auditing for unused or duplicate pages to keep the site lean and fast.`,
      severity: "info",
    });
  }
  if (totalCollections > 10) {
    insights.push({
      title: "Complex CMS",
      insight: `${totalCollections} CMS collections. Ensure data structure stays organized and remove unused collections.`,
      severity: "info",
    });
  }
  if (formSubmissions.length === 0) {
    insights.push({
      title: "No Form Submissions",
      insight: "No form submissions recorded in this period. Check if forms are working properly or if there's a conversion issue.",
      action: "Test all site forms to verify they're capturing submissions correctly.",
      severity: "warning",
    });
  }

  // ── Form submissions table ──
  const formColumns: DataTableColumn<WebflowFormEntry>[] = [
    { key: "formName", header: "Form Name", render: (r) => <span className="font-medium text-foreground">{r.formName}</span> },
    { key: "count", header: "Submissions", align: "right", render: (r) => <span className="tabular-nums font-medium">{r.count}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner key={i} severity={a.severity} title={a.title} description={a.description} />
          ))}
        </div>
      )}

      {/* Site Header */}
      <SectionCard title={siteName || "Webflow Site"} subtitle="Site overview and health">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Pages"
            value={totalPages.toString()}
            icon={FileText}
          />
          <StatCard
            label="CMS Collections"
            value={totalCollections.toString()}
            icon={Database}
          />
          <StatCard
            label="Form Submissions"
            value={totalFormSubmissions.toString()}
            icon={FormInput}
          />
          <StatCard
            label="Last Published"
            value={lastPublished ? timeAgo(lastPublished) : "Never"}
            icon={Calendar}
            iconColor={daysSincePublish !== null && daysSincePublish > 30 ? "text-yellow-500" : "text-primary"}
          />
        </div>
      </SectionCard>

      {/* Domains + Publishing */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Custom Domains */}
        <SectionCard title="Custom Domains" subtitle={`${customDomains.length} domain${customDomains.length !== 1 ? "s" : ""} configured`}>
          {customDomains.length > 0 ? (
            <div className="space-y-2">
              {customDomains.map((domain) => (
                <div key={domain} className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{domain}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No custom domains configured. Site is served via Webflow subdomain.</p>
          )}
        </SectionCard>

        {/* Publishing Status */}
        <SectionCard title="Publishing Status" subtitle="Deployment and content freshness">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-sm text-foreground">Last Published</span>
              <span className={`text-sm font-bold ${
                daysSincePublish !== null && daysSincePublish > 30
                  ? "text-yellow-500"
                  : daysSincePublish !== null && daysSincePublish > 90
                    ? "text-red-500"
                    : "text-emerald-500"
              }`}>
                {lastPublished ? timeAgo(lastPublished) : "Never published"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-sm text-foreground">Site Name</span>
              <span className="text-sm font-bold text-foreground">{siteName || "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-sm text-foreground">Pages</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{totalPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-sm text-foreground">CMS Collections</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{totalCollections}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Form Submissions */}
      {formSubmissions.length > 0 && (
        <SectionCard title="Form Submissions" subtitle="Submissions by form">
          <div className="space-y-4">
            {/* Form distribution bars */}
            <div className="space-y-2">
              {[...formSubmissions]
                .sort((a, b) => b.count - a.count)
                .map((form) => {
                  const maxCount = Math.max(...formSubmissions.map((f) => f.count), 1);
                  const share = totalFormSubmissions > 0
                    ? (form.count / totalFormSubmissions) * 100
                    : 0;
                  return (
                    <div key={form.formName} className="flex items-center gap-3">
                      <span className="w-40 truncate text-right text-sm text-muted-foreground" title={form.formName}>
                        {form.formName}
                      </span>
                      <div className="flex-1">
                        <div className="relative h-7 overflow-hidden rounded-md">
                          <div
                            className="flex h-full items-center rounded-md bg-primary px-3 transition-all duration-500"
                            style={{
                              width: `${Math.max((form.count / maxCount) * 100, 10)}%`,
                              minWidth: "50px",
                            }}
                          >
                            <span className="text-[10px] font-bold text-white drop-shadow">
                              {form.count}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Table view */}
            <DataTable
              columns={formColumns}
              rows={[...formSubmissions].sort((a, b) => b.count - a.count)}
              emptyMessage="No form submissions"
            />
          </div>
        </SectionCard>
      )}

      {/* Insights & Recommendations */}
      {insights.length > 0 && (
        <SectionCard title="Insights & Recommendations">
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightCard key={i} title={ins.title} insight={ins.insight} action={ins.action} severity={ins.severity} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
