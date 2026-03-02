"use client";

import { useState, useMemo } from "react";
import {
  Route, Search, ChevronDown, ChevronRight,
  Filter, Calendar, DollarSign,
} from "lucide-react";
import type { AnalyticsDashboardData, TouchpointChannel } from "@/lib/analytics/types";
import { DrilldownPanel } from "./drilldown-panel";

const CHANNEL_LABELS: Record<TouchpointChannel, string> = {
  hubspot: "HubSpot",
  stripe: "Stripe",
  "google-workspace": "Google Workspace",
  slack: "Slack",
  webflow: "Webflow",
  coda: "Coda",
  "google-analytics": "Google Analytics",
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  "reddit-ads": "Reddit Ads",
  pylon: "Pylon",
  mercury: "Mercury",
  "paid-search": "Paid Search",
  "paid-social": "Paid Social",
  "organic-search": "Organic Search",
  referral: "Referral",
  direct: "Direct",
  email: "Email",
  partner: "Partner",
  outbound: "Outbound",
};

const CHANNEL_COLORS: Record<TouchpointChannel, string> = {
  hubspot: "#ff7a59",
  stripe: "#635bff",
  "google-workspace": "#4285f4",
  slack: "#e01e5a",
  webflow: "#4353ff",
  coda: "#f46a54",
  "google-analytics": "#e37400",
  "google-ads": "#4285f4",
  "meta-ads": "#0081fb",
  "reddit-ads": "#ff4500",
  pylon: "#6366f1",
  mercury: "#1c1c1e",
  "paid-search": "#4285f4",
  "paid-social": "#0081fb",
  "organic-search": "#22c55e",
  referral: "#8b5cf6",
  direct: "#6b7280",
  email: "#f59e0b",
  partner: "#06b6d4",
  outbound: "#ec4899",
};

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function CustomerJourneyDrillDown({ data }: { data: AnalyticsDashboardData | null }) {
  const journey = data?.customerJourney;
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allChannels = useMemo(() => {
    if (!journey) return [];
    const set = new Set<TouchpointChannel>();
    for (const j of journey.journeys) {
      for (const tp of j.touchpoints) set.add(tp.channel);
    }
    return Array.from(set).sort();
  }, [journey]);

  const allStages = useMemo(() => {
    if (!journey) return [];
    const set = new Set<string>();
    for (const j of journey.journeys) set.add(j.currentStage);
    return Array.from(set).sort();
  }, [journey]);

  const filtered = useMemo(() => {
    if (!journey) return [];
    return journey.journeys.filter((j) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = j.dealName.toLowerCase().includes(q);
        const matchEmail = j.contactEmail?.toLowerCase().includes(q);
        if (!matchName && !matchEmail) return false;
      }
      if (channelFilter !== "all") {
        if (!j.touchpoints.some((tp) => tp.channel === channelFilter)) return false;
      }
      if (stageFilter !== "all" && j.currentStage !== stageFilter) return false;
      return true;
    });
  }, [journey, search, channelFilter, stageFilter]);

  if (!journey || journey.journeys.length === 0) return <EmptyState />;

  return (
    <DrilldownPanel
      title="Customer Journey Records"
      subtitle="Expandable deal records with touchpoint timelines"
      statusLine={`${filtered.length} of ${journey.journeys.length} journeys`}
      csvExport={{
        filename: `customer-journeys-${new Date().toISOString().slice(0, 10)}.csv`,
        headers: ["Deal Name", "Contact Email", "Stage", "Touches", "Days in Pipeline", "Value"],
        rows: () =>
          filtered.map((j) => [
            j.dealName,
            j.contactEmail ?? "",
            j.currentStage,
            String(j.touchpoints.length),
            String(j.daysInPipeline),
            String(j.value),
          ]),
      }}
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search deal or contact\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Channels</option>
              {allChannels.map((ch) => (
                <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
              ))}
            </select>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Stages</option>
              {allStages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      }
    >
      {/* Journey Records */}
      <div className="space-y-2">
        {filtered.slice(0, 50).map((j) => {
          const expanded = expandedId === j.dealId;
          return (
            <div key={j.dealId} className="rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : j.dealId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{j.dealName}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.contactEmail ?? "No contact"} · {j.currentStage}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Route className="h-3 w-3" />
                    {j.touchpoints.length} touches
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {j.daysInPipeline}d
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                    <DollarSign className="h-3 w-3" />
                    {fmt$(j.value)}
                  </div>
                </div>
              </button>

              {expanded && (
                <div className="border-t border-border px-4 py-3">
                  <div className="relative ml-4 space-y-0 border-l-2 border-border pl-4">
                    {j.touchpoints.map((tp, idx) => (
                      <div key={idx} className="relative pb-3 last:pb-0">
                        <div
                          className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background"
                          style={{ backgroundColor: CHANNEL_COLORS[tp.channel] || "#6b7280" }}
                        />
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                                style={{ backgroundColor: CHANNEL_COLORS[tp.channel] || "#6b7280" }}
                              >
                                {CHANNEL_LABELS[tp.channel]}
                              </span>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {tp.type}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{tp.detail}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] tabular-nums text-muted-foreground">
                              {new Date(tp.timestamp).toLocaleDateString()}
                            </p>
                            {tp.value != null && tp.value > 0 && (
                              <p className="text-[10px] font-medium text-foreground">{fmt$(tp.value)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length > 50 && (
          <p className="text-center text-xs text-muted-foreground">
            Showing 50 of {filtered.length} journeys. Use filters to narrow results.
          </p>
        )}
      </div>
    </DrilldownPanel>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Route className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No customer journey data available</p>
        <p className="text-xs text-muted-foreground">Connect integrations to map journeys</p>
      </div>
    </div>
  );
}
