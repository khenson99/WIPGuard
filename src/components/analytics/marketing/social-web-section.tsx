"use client";

import { Facebook, Layout } from "lucide-react";
import { fmtNumber } from "@/lib/analytics/format";
import type { MetaPageData, WebflowData } from "@/lib/analytics/types";

interface SocialWebSectionProps {
  metaPage: MetaPageData | null;
  webflow: WebflowData | null;
}

export function SocialWebSection({ metaPage, webflow }: SocialWebSectionProps) {
  const hasMetaPageSignal = Boolean(
    metaPage && (metaPage.pageLikes > 0 || metaPage.pageFollowers > 0 || metaPage.postReach30d > 0 || metaPage.postEngagement30d > 0 || metaPage.topPosts.length > 0),
  );

  const hasWebflowSignal = Boolean(
    webflow && (webflow.totalPages > 0 || webflow.totalCollections > 0 || webflow.formSubmissions.length > 0 || webflow.customDomains.length > 0 || Boolean(webflow.siteName) || Boolean(webflow.lastPublished)),
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Meta Page Insights */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Facebook className="h-4 w-4 text-primary" />
          Meta Page
        </h3>

        {!metaPage ? (
          <EmptySlot text="Meta Page not connected" />
        ) : !hasMetaPageSignal ? (
          <EmptySlot text="No Meta Page data in selected range" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <MetricTile label="Likes" value={fmtNumber(metaPage.pageLikes)} />
              <MetricTile label="Followers" value={fmtNumber(metaPage.pageFollowers)} />
              <MetricTile label="Reach (30d)" value={fmtNumber(metaPage.postReach30d)} />
              <MetricTile label="Engagement (30d)" value={fmtNumber(metaPage.postEngagement30d)} />
            </div>

            {metaPage.topPosts.length > 0 && (
              <div>
                <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Top Posts
                </p>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {metaPage.topPosts.slice(0, 5).map((post, idx) => (
                    <div key={idx} className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm">
                      <p className="line-clamp-2 text-foreground">{post.message}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {fmtNumber(post.reach)} reach &middot; {fmtNumber(post.engagement)} engagement
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Webflow Site Info */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layout className="h-4 w-4 text-primary" />
          Webflow
        </h3>

        {!webflow ? (
          <EmptySlot text="Webflow not connected" />
        ) : !hasWebflowSignal ? (
          <EmptySlot text="No Webflow data in selected range" />
        ) : (
          <div className="space-y-4">
            {(webflow.siteName || webflow.lastPublished) && (
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2.5">
                {webflow.siteName && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Site</p>
                    <p className="text-sm font-medium text-foreground">{webflow.siteName}</p>
                  </div>
                )}
                {webflow.lastPublished && (
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Last Published</p>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(webflow.lastPublished).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <MetricTile label="Pages" value={String(webflow.totalPages || 0)} />
              <MetricTile label="Collections" value={String(webflow.totalCollections || 0)} />
            </div>

            {webflow.formSubmissions.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Form Submissions
                </p>
                <div className="space-y-1">
                  {webflow.formSubmissions.map((form, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                      <span className="truncate text-foreground">{form.formName}</span>
                      <span className="font-semibold tabular-nums text-foreground">{form.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {webflow.customDomains.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Custom Domains
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {webflow.customDomains.map((domain, idx) => (
                    <span
                      key={idx}
                      className="rounded-md bg-secondary/60 px-2.5 py-1 text-xs text-foreground"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function EmptySlot({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
