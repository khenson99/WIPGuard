"use client";

import { Search, Award, Link2, TrendingUp } from "lucide-react";
import { fmtCurrency, fmtNumber } from "@/lib/analytics/format";
import { StatCard } from "../stat-card";
import type { SemrushData } from "@/lib/analytics/types";

interface SEOIntelligenceProps {
  semrush: SemrushData | null;
}

export function SEOIntelligence({ semrush }: SEOIntelligenceProps) {
  if (!semrush) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Search className="h-4 w-4 text-[#fc5a29]" />
          SEMrush SEO Intelligence
        </h3>
        <div className="flex min-h-[120px] items-center justify-center">
          <p className="text-sm text-muted-foreground">SEMrush not connected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Search className="h-4 w-4 text-[#fc5a29]" />
        SEMrush SEO Intelligence
      </h3>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Authority Score" value={String(semrush.authorityScore)} icon={Award} size="sm" />
        <StatCard label="Backlinks" value={fmtNumber(semrush.backlinks)} icon={Link2} size="sm" />
        <StatCard label="Organic Keywords" value={fmtNumber(semrush.organicKeywords)} icon={Search} size="sm" />
        <StatCard label="Organic Traffic" value={fmtNumber(semrush.organicTraffic)} icon={TrendingUp} size="sm" />
      </div>

      {/* Organic vs Paid Comparison */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Organic Search
          </p>
          <div className="space-y-2">
            <MetricRow label="Keywords" value={fmtNumber(semrush.organicKeywords)} />
            <MetricRow label="Traffic" value={fmtNumber(semrush.organicTraffic)} />
            <MetricRow label="Traffic Cost" value={fmtCurrency(semrush.organicTrafficCost)} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Paid Search
          </p>
          <div className="space-y-2">
            <MetricRow label="Keywords" value={fmtNumber(semrush.paidKeywords)} />
            <MetricRow label="Traffic" value={fmtNumber(semrush.paidTraffic)} />
            <MetricRow label="Traffic Cost" value={fmtCurrency(semrush.paidTrafficCost)} />
          </div>
        </div>
      </div>

      {/* Top Keywords Table */}
      {semrush.topKeywords && semrush.topKeywords.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Top Organic Keywords
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Keyword
                  </th>
                  <th className="py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Pos
                  </th>
                  <th className="py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Volume
                  </th>
                  <th className="py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Traffic
                  </th>
                  <th className="py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    CPC
                  </th>
                </tr>
              </thead>
              <tbody>
                {semrush.topKeywords.map((kw, idx) => (
                  <tr key={idx} className="border-b border-border/40">
                    <td className="py-2.5 text-foreground">{kw.keyword}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
                          kw.position <= 3
                            ? "bg-emerald-500/10 text-emerald-500"
                            : kw.position <= 10
                              ? "bg-amber-500/10 text-amber-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {kw.position}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {fmtNumber(kw.volume)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {fmtNumber(kw.traffic)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {fmtCurrency(kw.cpc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Organic Competitors */}
      {semrush.organicCompetitors && semrush.organicCompetitors.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Organic Competitors
          </p>
          <div className="space-y-1.5">
            {semrush.organicCompetitors.map((comp, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2.5 text-sm"
              >
                <span className="font-medium text-foreground">{comp.domain}</span>
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span>Common: {fmtNumber(comp.commonKeywords)}</span>
                  <span>Traffic: {fmtNumber(comp.organicTraffic)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
