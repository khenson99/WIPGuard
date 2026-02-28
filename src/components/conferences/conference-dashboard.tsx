"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ConferenceCard } from "@/components/conferences/conference-card";
import { ConferenceCreateModal } from "@/components/conferences/conference-create-modal";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import {
  CONFERENCE_STATUS_LABELS,
  type ConferenceListItem,
  type ConferenceStatus,
} from "@/types";

type TimingFilter = "all" | "upcoming" | "past";

interface ConferencesResponseWithMeta {
  items: ConferenceListItem[];
  meta?: { servedAt: string; isPartial: boolean };
}

const CACHE_KEY = "dashboard:conferences:v1";

const STATUS_OPTIONS: Array<{ value: ConferenceStatus | ""; label: string }> = [
  { value: "", label: "All Statuses" },
  ...Object.entries(CONFERENCE_STATUS_LABELS).map(([value, label]) => ({
    value: value as ConferenceStatus,
    label,
  })),
];

export function ConferenceDashboard() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<ConferenceStatus | "">("");
  const [timingFilter, setTimingFilter] = useState<TimingFilter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const resource = useDashboardResource<{ conferences: ConferenceListItem[]; meta?: ConferencesResponseWithMeta["meta"] }>({
    cacheKey: CACHE_KEY,
    deps: [],
    load: async ({ signal, refresh }) => {
      const res = await fetch("/api/conferences?meta=true", {
        signal,
        cache: refresh ? "no-store" : "default",
      });
      if (!res.ok) throw new Error(`Conferences request failed (${res.status})`);
      const payload = (await res.json()) as ConferencesResponseWithMeta;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return { conferences: items, meta: payload.meta };
    },
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? null,
    mapError: (error) => (error instanceof Error ? error.message : "Could not load conferences."),
  });

  const conferences = resource.data?.conferences ?? [];

  const filtered = useMemo(() => {
    const now = resource.lastUpdatedAt ? Date.parse(resource.lastUpdatedAt) : null;
    const q = query.trim().toLowerCase();

    return conferences.filter((conf) => {
      if (statusFilter && conf.status !== statusFilter) return false;
      if (timingFilter === "upcoming") {
        const end = Date.parse(conf.endDate);
        if (now !== null && !Number.isNaN(end) && end < now) return false;
      }
      if (timingFilter === "past") {
        const end = Date.parse(conf.endDate);
        if (now === null) return false;
        if (Number.isNaN(end) || end >= now) return false;
      }
      if (q) {
        const haystack = `${conf.name} ${conf.city ?? ""} ${conf.region ?? ""} ${conf.country ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [conferences, query, resource.lastUpdatedAt, statusFilter, timingFilter]);

  const onCreated = async (created: { id: string }, opts: { seedPlaybook: boolean }) => {
    setCreateOpen(false);

    if (opts.seedPlaybook) {
      try {
        await fetch(`/api/conferences/${created.id}/apply-playbook`, { method: "POST" });
      } catch {
        // Non-fatal; user can seed later from detail.
      }
    }

    router.push(`/conferences/${created.id}`);
  };

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading conferences..." className="h-[50vh]" />;
  }

  if (!resource.data) {
    return (
      <DashboardEmptyState
        title="Conferences unavailable"
        message={resource.error ?? "No conference data available."}
        actionLabel="Refresh now"
        onAction={resource.refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Conferences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan events, track deadlines, budget, and leads.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
            {resource.fromCache ? " (cache warm start)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resource.refresh}
            disabled={resource.refreshing}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            {resource.refreshing ? "Refreshing..." : "Refresh now"}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="btn-primary-theme flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Conference
          </button>
        </div>
      </div>

      {resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label="Showing cached conferences while refresh retries."
        />
      ) : null}

      {resource.error ? (
        <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ConferenceStatus | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={timingFilter}
          onChange={(e) => setTimingFilter(e.target.value as TimingFilter)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Filter by timing"
        >
          <option value="all">All</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or location…"
          className="w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          aria-label="Search conferences by name or location"
        />
      </div>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          title="No conferences match filters"
          message="Try adjusting filters or create a new conference."
          actionLabel="New Conference"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((conference) => (
            <ConferenceCard
              key={conference.id}
              conference={conference}
              onClick={() => router.push(`/conferences/${conference.id}`)}
            />
          ))}
        </div>
      )}

      <ConferenceCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}
