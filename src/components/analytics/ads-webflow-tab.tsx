"use client";

import {
  FileText, Database, Calendar,
  FormInput, Link2, Search, RefreshCw,
} from "lucide-react";
import type {
  AnalyticsDashboardData,
  WebflowFormEntry,
  WebflowPageDetail,
} from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { StatCard } from "@/components/analytics/stat-card";
import { BarDisplay, RingStat } from "@/components/analytics/bar-display";
import { AreaTrend } from "@/components/charts/area-trend";
import {
  fmtN, fmtPct, timeAgo,
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

  // Safe defaults for new fields (backward compat with old snapshots)
  const publishedPages = webflow.publishedPages ?? totalPages;
  const draftPages = webflow.draftPages ?? 0;
  const archivedPages = webflow.archivedPages ?? 0;
  const seoAudit = webflow.seoAudit ?? {
    totalPages: 0, pagesWithSeoTitle: 0, pagesWithSeoDescription: 0,
    pagesWithOgImage: 0, seoScore: 0,
  };
  const contentFreshness = webflow.contentFreshness ?? {
    updatedLast7d: 0, updatedLast30d: 0, updatedLast90d: 0, staleOver90d: 0,
  };
  const recentlyUpdatedPages = webflow.recentlyUpdatedPages ?? [];
  const collections = webflow.collections ?? [];
  const totalCmsItems = webflow.totalCmsItems ?? 0;
  const emptyCollections = webflow.emptyCollections ?? 0;
  const formTrend = webflow.formTrend ?? [];
  const totalFormSubmissions = webflow.totalFormSubmissions
    ?? formSubmissions.reduce((sum, f) => sum + f.count, 0);
  const pages = webflow.pages ?? [];

  // ── Derived metrics ──
  const referenceTimestamp = data?.meta?.servedAt
    ? new Date(data.meta.servedAt).getTime()
    : null;
  const lastPublishedTimestamp = lastPublished ? new Date(lastPublished).getTime() : null;
  const daysSincePublish = referenceTimestamp !== null && lastPublishedTimestamp !== null
    ? Math.floor((referenceTimestamp - lastPublishedTimestamp) / (1000 * 60 * 60 * 24))
    : null;

  // Freshness exclusive buckets for display
  const fresh7d = contentFreshness.updatedLast7d;
  const fresh8to30d = contentFreshness.updatedLast30d - contentFreshness.updatedLast7d;
  const fresh31to90d = contentFreshness.updatedLast90d - contentFreshness.updatedLast30d;
  const stale90d = contentFreshness.staleOver90d;

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (daysSincePublish !== null && daysSincePublish > 90) {
    alerts.push({
      severity: "critical",
      title: `Site is ${daysSincePublish} days stale`,
      description: "The site hasn't been published in over 3 months. Unpublished changes may be accumulating. Review and publish immediately.",
    });
  } else if (daysSincePublish !== null && daysSincePublish > 30) {
    alerts.push({
      severity: "warning",
      title: `Site hasn't been published in ${daysSincePublish} days`,
      description: "Stale content may impact SEO and user experience. Review pending changes and publish.",
    });
  }
  if (seoAudit.seoScore > 0 && seoAudit.seoScore < 50) {
    alerts.push({
      severity: "warning",
      title: `SEO coverage is low — ${seoAudit.seoScore}%`,
      description: "Many pages are missing SEO titles, meta descriptions, or Open Graph images. Improve coverage to boost search visibility.",
    });
  }
  if (customDomains.length === 0) {
    alerts.push({
      severity: "info",
      title: "No custom domains configured",
      description: "Site is only accessible via Webflow subdomain. Add a custom domain for a professional presence.",
    });
  }
  if (emptyCollections > 0) {
    alerts.push({
      severity: "info",
      title: `${emptyCollections} empty CMS collection${emptyCollections !== 1 ? "s" : ""}`,
      description: "Some collections have no items. Consider removing unused collections to keep the CMS clean.",
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
  if (seoAudit.seoScore >= 80) {
    insights.push({
      title: "Strong SEO Coverage",
      insight: `${seoAudit.seoScore}% SEO score — most pages have proper titles, descriptions, and OG images.`,
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
  if (stale90d > totalPages * 0.5 && totalPages > 0) {
    insights.push({
      title: "Content Going Stale",
      insight: `${stale90d} of ${totalPages} pages haven't been updated in over 90 days. Outdated content can hurt SEO.`,
      action: "Audit stale pages and update or archive those no longer relevant.",
      severity: "warning",
    });
  }
  if (draftPages > totalPages * 0.3 && totalPages > 0) {
    insights.push({
      title: "Many Draft Pages",
      insight: `${draftPages} pages are still in draft. Review and publish or discard drafts that are no longer needed.`,
      severity: "info",
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

  // ── Table columns ──
  const formColumns: DataTableColumn<WebflowFormEntry>[] = [
    { key: "formName", header: "Form Name", render: (r) => <span className="font-medium text-foreground">{r.formName}</span> },
    { key: "count", header: "Submissions", align: "right", render: (r) => <span className="tabular-nums font-medium">{r.count}</span> },
  ];

  const recentPageColumns: DataTableColumn<WebflowPageDetail>[] = [
    { key: "title", header: "Page", render: (r) => <span className="font-medium text-foreground truncate max-w-[200px] block">{r.title || r.slug}</span> },
    { key: "slug", header: "Slug", render: (r) => <span className="text-muted-foreground truncate max-w-[160px] block">/{r.slug}</span> },
    { key: "updatedOn", header: "Updated", render: (r) => <span className="text-muted-foreground text-xs">{r.updatedOn ? timeAgo(r.updatedOn) : "—"}</span> },
    {
      key: "status", header: "Status", render: (r) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          r.archived
            ? "bg-muted text-muted-foreground"
            : r.draft
              ? "bg-yellow-500/10 text-yellow-600"
              : "bg-emerald-500/10 text-emerald-600"
        }`}>
          {r.archived ? "Archived" : r.draft ? "Draft" : "Published"}
        </span>
      ),
    },
  ];

  const seoMissingPages = pages.filter((p) => !p.seoTitle || !p.seoDescription).slice(0, 10);
  const seoMissingColumns: DataTableColumn<WebflowPageDetail>[] = [
    { key: "title", header: "Page", render: (r) => <span className="font-medium text-foreground truncate max-w-[180px] block">{r.title || r.slug}</span> },
    {
      key: "missing", header: "Missing", render: (r) => {
        const missing: string[] = [];
        if (!r.seoTitle) missing.push("Title");
        if (!r.seoDescription) missing.push("Description");
        if (!r.openGraphImageUrl) missing.push("OG Image");
        return <span className="text-xs text-yellow-600">{missing.join(", ")}</span>;
      },
    },
  ];

  // SEO ring color
  const seoColor = seoAudit.seoScore >= 80
    ? "#22c55e"
    : seoAudit.seoScore >= 50
      ? "#eab308"
      : "#ef4444";

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

      {/* KPI Stat Cards */}
      <SectionCard title={siteName || "Webflow Site"} subtitle="Site overview and health">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            label="Published Pages"
            value={publishedPages.toString()}
            subtitle={`${draftPages} draft, ${archivedPages} archived`}
            icon={FileText}
          />
          <StatCard
            label="CMS Items"
            value={fmtN(totalCmsItems)}
            subtitle={`${totalCollections} collection${totalCollections !== 1 ? "s" : ""}`}
            icon={Database}
          />
          <StatCard
            label="Form Submissions"
            value={fmtN(totalFormSubmissions)}
            subtitle={`${formSubmissions.length} active form${formSubmissions.length !== 1 ? "s" : ""}`}
            icon={FormInput}
          />
          <StatCard
            label="SEO Health"
            value={`${seoAudit.seoScore}%`}
            icon={Search}
            iconColor={seoAudit.seoScore >= 80 ? "text-emerald-500" : seoAudit.seoScore >= 50 ? "text-yellow-500" : "text-red-500"}
          />
          <StatCard
            label="Fresh Content"
            value={contentFreshness.updatedLast30d.toString()}
            subtitle="pages updated in last 30 days"
            icon={RefreshCw}
          />
          <StatCard
            label="Last Published"
            value={lastPublished ? timeAgo(lastPublished) : "Never"}
            icon={Calendar}
            iconColor={daysSincePublish !== null && daysSincePublish > 30 ? "text-yellow-500" : "text-primary"}
          />
        </div>
      </SectionCard>

      {/* Form Submission Trend */}
      {formTrend.length > 1 && (
        <SectionCard title="Form Submission Trend" subtitle="Daily submissions over the selected period">
          <AreaTrend
            data={formTrend.map((e) => ({ ...e }) as Record<string, unknown>)}
            xKey="date"
            yKeys={["submissions"]}
            colors={["hsl(var(--primary))"]}
            height={220}
            xFormatter={(v) => {
              const d = new Date(v);
              return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
          />
        </SectionCard>
      )}

      {/* SEO Audit + CMS Collections */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* SEO Audit */}
        <SectionCard title="SEO Audit" subtitle={`${seoAudit.seoScore}% coverage score`}>
          <div className="space-y-4">
            <div className="flex justify-center">
              <RingStat value={seoAudit.seoScore} max={100} label="SEO Score" color={seoColor} />
            </div>
            <div className="space-y-2">
              {[
                { label: "SEO Title", count: seoAudit.pagesWithSeoTitle },
                { label: "Meta Description", count: seoAudit.pagesWithSeoDescription },
                { label: "OG Image", count: seoAudit.pagesWithOgImage },
              ].map((item) => {
                const pct = seoAudit.totalPages > 0 ? (item.count / seoAudit.totalPages) * 100 : 0;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="w-32 text-right text-sm text-muted-foreground">{item.label}</span>
                    <div className="flex-1">
                      <div className="relative h-5 overflow-hidden rounded bg-secondary/60">
                        <div
                          className="h-full rounded bg-primary/80 transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                      {item.count}/{seoAudit.totalPages} ({fmtPct(pct)})
                    </span>
                  </div>
                );
              })}
            </div>
            {seoMissingPages.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Pages Missing SEO</p>
                <DataTable columns={seoMissingColumns} rows={seoMissingPages} emptyMessage="All pages have SEO metadata" />
              </div>
            )}
          </div>
        </SectionCard>

        {/* CMS Collections */}
        <SectionCard title="CMS Collections" subtitle={`${fmtN(totalCmsItems)} items across ${totalCollections} collections`}>
          {collections.length > 0 ? (
            <div className="space-y-4">
              <BarDisplay
                items={[...collections]
                  .sort((a, b) => b.itemCount - a.itemCount)
                  .map((c) => ({
                    label: c.displayName,
                    value: c.itemCount,
                    color: c.itemCount === 0 ? "hsl(var(--muted-foreground))" : undefined,
                  }))}
              />
              {emptyCollections > 0 && (
                <p className="text-xs text-muted-foreground">
                  {emptyCollections} empty collection{emptyCollections !== 1 ? "s" : ""} — consider removing unused collections.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No CMS collections on this site.</p>
          )}
        </SectionCard>
      </div>

      {/* Content Freshness + Recently Updated */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Freshness Distribution */}
        <SectionCard title="Content Freshness" subtitle="When pages were last updated">
          <div className="space-y-3">
            {[
              { label: "Last 7 days", count: fresh7d, color: "#22c55e" },
              { label: "8–30 days", count: fresh8to30d, color: "#818cf8" },
              { label: "31–90 days", count: fresh31to90d, color: "#eab308" },
              { label: "Over 90 days", count: stale90d, color: "#ef4444" },
            ].map((bucket) => {
              const pct = totalPages > 0 ? (bucket.count / totalPages) * 100 : 0;
              return (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="w-28 text-right text-sm text-muted-foreground">{bucket.label}</span>
                  <div className="flex-1">
                    <div className="relative h-6 overflow-hidden rounded bg-secondary/60">
                      <div
                        className="h-full rounded transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: bucket.color }}
                      />
                    </div>
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                    {bucket.count} page{bucket.count !== 1 ? "s" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Recently Updated Pages */}
        <SectionCard title="Recently Updated Pages" subtitle="Last 10 modified pages">
          {recentlyUpdatedPages.length > 0 ? (
            <DataTable columns={recentPageColumns} rows={recentlyUpdatedPages} emptyMessage="No page update data" />
          ) : (
            <p className="text-sm text-muted-foreground">No page update timestamps available.</p>
          )}
        </SectionCard>
      </div>

      {/* Custom Domains + Form Breakdown */}
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

        {/* Form Submissions Breakdown */}
        {formSubmissions.length > 0 && (
          <SectionCard title="Form Submissions" subtitle="Submissions by form">
            <div className="space-y-4">
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
              <DataTable
                columns={formColumns}
                rows={[...formSubmissions].sort((a, b) => b.count - a.count)}
                emptyMessage="No form submissions"
              />
            </div>
          </SectionCard>
        )}
      </div>

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
