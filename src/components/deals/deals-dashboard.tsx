"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, RefreshCw, BarChart3, LayoutGrid, Table2 } from "lucide-react";
import { DealCard } from "@/components/deals/deal-card";
import { DealCreateModal } from "@/components/deals/deal-create-modal";
import { DealMeetingModal } from "@/components/deals/deal-meeting-modal";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DataTable, type DataTableColumn, fmt$ } from "@/components/analytics/dashboard-primitives";
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_ORDER,
  type DealListItem,
  type DealStage,
  type UserSummary,
} from "@/types";

type ViewMode = "table" | "pipeline";

const CACHE_KEY = "dashboard:deals:v1";

const STAGE_BADGE_CLASSES: Record<DealStage, string> = {
  LEAD: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  QUALIFIED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  PROPOSAL: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  NEGOTIATION: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  CLOSED_WON: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CLOSED_LOST: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const OPEN_STAGES: DealStage[] = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];

export function DealsDashboard() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [stageFilter, setStageFilter] = useState<DealStage | "">("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [query, setQuery] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const resource = useDashboardResource<DealListItem[]>({
    cacheKey: CACHE_KEY,
    deps: [],
    load: async ({ signal, refresh }) => {
      const res = await fetch("/api/deals", {
        signal,
        cache: refresh ? "no-store" : "default",
      });
      if (!res.ok) throw new Error(`Deals request failed (${res.status})`);
      return (await res.json()) as DealListItem[];
    },
  });

  const deals = resource.data ?? [];

  const owners = useMemo(() => {
    const map = new Map<string, UserSummary>();
    for (const d of deals) {
      if (d.owner) map.set(d.owner.id, d.owner);
    }
    return [...map.values()];
  }, [deals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minAmount) || 0;
    const max = Number(maxAmount) || Infinity;

    return deals.filter((deal) => {
      if (stageFilter && deal.stage !== stageFilter) return false;
      if (ownerFilter && deal.ownerId !== ownerFilter) return false;
      if (deal.amount < min || deal.amount > max) return false;
      if (q) {
        const haystack = `${deal.name} ${deal.company?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [deals, query, stageFilter, ownerFilter, minAmount, maxAmount]);

  const pipelineColumns = useMemo(() => {
    return OPEN_STAGES.map((stage) => ({
      stage,
      label: DEAL_STAGE_LABELS[stage],
      deals: filtered.filter((d) => d.stage === stage),
    }));
  }, [filtered]);

  const syncFromHubSpot = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/deals/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      await resource.refresh();
    } catch {
      // Non-fatal, refresh will show updated state
    } finally {
      setSyncing(false);
    }
  };

  const tableColumns: DataTableColumn<DealListItem>[] = [
    {
      key: "name",
      header: "Deal",
      render: (row) => (
        <button
          onClick={() => router.push(`/deals/${row.id}`)}
          className="text-left font-medium text-foreground hover:underline"
        >
          {row.name}
        </button>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row) => <span className="text-muted-foreground">{row.company?.name ?? "—"}</span>,
    },
    {
      key: "stage",
      header: "Stage",
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE_CLASSES[row.stage]}`}>
          {DEAL_STAGE_LABELS[row.stage]}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => <span className="tabular-nums">{fmt$(row.amount)}</span>,
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => <span className="text-muted-foreground">{row.owner?.name || row.owner?.email || "—"}</span>,
    },
    {
      key: "meetings",
      header: "Meetings",
      align: "center",
      render: (row) => <span className="tabular-nums text-muted-foreground">{row._count.meetings}</span>,
    },
  ];

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading deals..." className="h-[50vh]" />;
  }

  if (!resource.data) {
    return (
      <DashboardEmptyState
        title="Deals unavailable"
        message={resource.error ?? "No deal data available."}
        actionLabel="Refresh now"
        onAction={resource.refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your pipeline, track deals, and spot stale opportunities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/deals/analytics"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </Link>
          <button
            type="button"
            onClick={syncFromHubSpot}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync from HubSpot"}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="btn-primary-theme flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Deal
          </button>
        </div>
      </div>

      {resource.stale && (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label="Showing cached deals while refresh retries."
        />
      )}

      {resource.error && <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} />}

      {/* Filters + View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setViewMode("pipeline")}
            className={`flex items-center gap-1 px-3 py-2 text-sm ${viewMode === "pipeline" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"} rounded-l-lg`}
          >
            <LayoutGrid className="h-4 w-4" />
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1 px-3 py-2 text-sm ${viewMode === "table" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"} rounded-r-lg`}
          >
            <Table2 className="h-4 w-4" />
            Table
          </button>
        </div>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as DealStage | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Filter by stage"
        >
          <option value="">All Stages</option>
          {DEAL_STAGE_ORDER.map((s) => (
            <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Filter by owner"
        >
          <option value="">All Owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name || o.email}</option>
          ))}
        </select>

        <input
          type="number"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          placeholder="Min $"
          className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Minimum deal amount"
          min="0"
        />
        <input
          type="number"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          placeholder="Max $"
          className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Maximum deal amount"
          min="0"
        />

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deals..."
          className="w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Search deals by name or company"
        />
      </div>

      {/* Pipeline View */}
      {viewMode === "pipeline" && (
        <>
          {filtered.length === 0 ? (
            <DashboardEmptyState
              title="No deals match filters"
              message="Try adjusting filters or create a new deal."
              actionLabel="New Deal"
              onAction={() => setCreateOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pipelineColumns.map((col) => (
                <div
                  key={col.stage}
                  className="space-y-2"
                  data-stage={col.label}
                  data-testid={`stage-${col.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                    <span className="text-xs tabular-nums text-muted-foreground">{col.deals.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.deals.map((deal) => (
                      <DealCard key={deal.id} deal={deal} onClick={() => router.push(`/deals/${deal.id}`)} />
                    ))}
                    {col.deals.length === 0 && (
                      <p className="rounded-lg border border-dashed border-border/50 py-6 text-center text-xs text-muted-foreground">
                        No deals
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Closed deals summary below pipeline */}
          {(() => {
            const wonDeals = filtered.filter((d) => d.stage === "CLOSED_WON");
            const lostDeals = filtered.filter((d) => d.stage === "CLOSED_LOST");
            if (wonDeals.length === 0 && lostDeals.length === 0) return null;
            return (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Closed Won ({wonDeals.length})
                  </h3>
                  <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                    {fmt$(wonDeals.reduce((s, d) => s + d.amount, 0))}
                  </p>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Closed Lost ({lostDeals.length})
                  </h3>
                  <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                    {fmt$(lostDeals.reduce((s, d) => s + d.amount, 0))}
                  </p>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <DataTable columns={tableColumns} rows={filtered} emptyMessage="No deals match filters." />
        </div>
      )}

      <DealCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          router.push(`/deals/${created.id}`);
        }}
      />

      <DealMeetingModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        onCreated={() => {
          setMeetingOpen(false);
          void resource.refresh();
        }}
        deals={deals}
      />
    </div>
  );
}
