"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CalendarRange,
  DollarSign,
  ExternalLink,
  Filter,
  FlaskConical,
  PanelsTopLeft,
  UserRound,
  Users,
} from "lucide-react";
import type {
  AnalyticsDashboardData,
  VisitorFunnelBreakdownRow,
  VisitorFunnelRecord,
} from "@/lib/analytics/types";
import { DrilldownPanel } from "./drilldown-panel";
import { StatCard } from "./stat-card";

interface RecordsResponse {
  records: VisitorFunnelRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const STAGE_LABELS: Record<string, string> = {
  visitors: "Visitors",
  identified: "Identified",
  demo_booked: "Demo Booked",
  kanban_card_created: "Kanban Card Created",
  trial_started: "Trials Started",
  paid_customer: "Paid Customers",
};

const STAGE_ICONS = [
  Users,
  UserRound,
  CalendarRange,
  PanelsTopLeft,
  FlaskConical,
  DollarSign,
] as const;

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatStage(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replaceAll("_", " ");
}

function formatMilestone(record: VisitorFunnelRecord, stage: string): string {
  const milestone = record.milestones.find((entry) => entry.stage === stage);
  if (!milestone?.occurredAt) return "—";
  return new Date(milestone.occurredAt).toLocaleDateString();
}

function buildCsvRows(records: VisitorFunnelRecord[]): string[][] {
  return records.map((record) => [
    record.anonymousId,
    record.firstTouchChannel ?? "",
    record.firstTouchSource ?? "",
    record.firstTouchCampaign ?? "",
    record.deepestStage,
    record.firstSeenAt,
    record.lastSeenAt,
    record.identities?.map((identity) => `${identity.type}:${identity.value}`).join(" | ") ?? "",
  ]);
}

export function VisitorFunnelTab({ data }: { data: AnalyticsDashboardData | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const funnel = data?.visitorFunnel;
  const isAdmin = session?.user?.role === "admin";
  const [recordsState, setRecordsState] = useState<{
    href: string | null;
    payload: RecordsResponse | null;
    error: string | null;
  }>({
    href: null,
    payload: null,
    error: null,
  });

  const recordsHref = (() => {
    const hrefValue = funnel?.recordsApi.href;
    if (typeof window === "undefined" || !hrefValue) return null;
    const href = new URL(hrefValue, window.location.origin);
    href.searchParams.set("page", "1");
    href.searchParams.set("pageSize", "10");
    return `${href.pathname}${href.search}`;
  })();

  useEffect(() => {
    if (!isAdmin || !recordsHref) return;

    let active = true;
    const controller = new AbortController();

    void fetch(recordsHref, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Preview request failed (${response.status})`);
        }
        const payload = (await response.json()) as RecordsResponse;
        if (!active) return;
        setRecordsState({
          href: recordsHref,
          payload,
          error: null,
        });
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        setRecordsState({
          href: recordsHref,
          payload: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load visitor preview.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isAdmin, recordsHref]);

  if (!funnel) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        No visitor funnel data is available for the selected range.
      </div>
    );
  }

  const updateFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  };

  const previewIsCurrent = Boolean(
    isAdmin && recordsHref && recordsState.href === recordsHref
  );
  const previewRecords = previewIsCurrent ? recordsState.payload?.records ?? [] : [];
  const previewTotal = previewIsCurrent ? recordsState.payload?.pagination.total ?? 0 : 0;
  const previewError = previewIsCurrent ? recordsState.error : null;
  const previewLoading = Boolean(isAdmin && recordsHref && !previewIsCurrent);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Anonymous Visit to Customer Funnel</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              First-party visit cohorts joined to de-anonymization, demo, kanban, trial, and paid conversion milestones.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => updateFilter("quickFilter", "all")}
              className={`rounded-md px-3 py-1.5 text-xs ${
                funnel.filters.quickFilter === "all"
                  ? "bg-foreground text-background"
                  : "border border-border bg-background text-muted-foreground"
              }`}
            >
              All Channels
            </button>
            <button
              type="button"
              onClick={() => updateFilter("quickFilter", "reddit")}
              className={`rounded-md px-3 py-1.5 text-xs ${
                funnel.filters.quickFilter === "reddit"
                  ? "bg-[#ff4500] text-white"
                  : "border border-border bg-background text-muted-foreground"
              }`}
            >
              Reddit Only
            </button>
            <button
              type="button"
              onClick={() => updateFilter("knownOnly", funnel.filters.knownOnly ? null : "true")}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                funnel.filters.knownOnly
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              Known Only
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <select
            value={funnel.filters.stage}
            onChange={(event) => updateFilter("stage", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All stages</option>
            {funnel.stages.map((stage) => (
              <option key={stage.stage} value={stage.stage}>
                {stage.label}
              </option>
            ))}
          </select>
          <select
            value={funnel.filters.channel}
            onChange={(event) => updateFilter("channel", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All channels</option>
            {funnel.availableChannels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
          <select
            value={funnel.filters.source ?? "all"}
            onChange={(event) => updateFilter("source", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All sources</option>
            {funnel.availableSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select
            value={funnel.filters.campaign ?? "all"}
            onChange={(event) => updateFilter("campaign", event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            <option value="all">All campaigns</option>
            {funnel.availableCampaigns.map((campaign) => (
              <option key={campaign} value={campaign}>
                {campaign}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        {funnel.stages.map((stage, index) => {
          const Icon = STAGE_ICONS[index] ?? Users;
          return (
            <StatCard
              key={stage.stage}
              label={stage.label}
              value={stage.count}
              subtitle={`Visitors: ${pct(stage.conversionFromVisitors)} · Prev: ${pct(stage.conversionFromPrevious)}`}
              icon={Icon}
            />
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Weekly Trend</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Cohort entry and milestone counts by ISO week.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              Closed-won reference: {funnel.secondaryMetrics.closedWonCount.toLocaleString()}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Week</th>
                  <th className="pb-2 pr-4 font-medium">Visitors</th>
                  <th className="pb-2 pr-4 font-medium">Identified</th>
                  <th className="pb-2 pr-4 font-medium">Demo</th>
                  <th className="pb-2 pr-4 font-medium">Kanban</th>
                  <th className="pb-2 pr-4 font-medium">Trial</th>
                  <th className="pb-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {funnel.trends.map((row) => (
                  <tr key={row.week} className="border-t border-border">
                    <td className="py-2 pr-4 text-foreground">{row.week}</td>
                    <td className="py-2 pr-4">{row.visitors.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.identified.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.demo_booked.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.kanban_card_created.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.trial_started.toLocaleString()}</td>
                    <td className="py-2">{row.paid_customer.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Action Overlap</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Visitors who completed multiple downstream actions in the range.
          </p>
          <div className="mt-4 space-y-2">
            {funnel.overlaps.map((overlap) => (
              <div key={overlap.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span className="text-foreground">{overlap.key.replaceAll("_", " ").replace("+", " + ")}</span>
                <span className="font-medium text-foreground">{overlap.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownCard title="Channels" rows={funnel.channelBreakdown} />
        <BreakdownCard title="Sources" rows={funnel.sourceBreakdown} />
        <BreakdownCard title="Campaigns" rows={funnel.campaignBreakdown} />
      </div>

      <DrilldownPanel
        title="Admin Record Preview"
        subtitle="Top visitor rows with identity and milestone evidence."
        statusLine={
          isAdmin
            ? previewLoading
              ? "Loading admin preview…"
              : `${previewTotal} total matching visitors`
            : "Admin role required for row-level identity drill-down."
        }
        csvExport={
          isAdmin && previewRecords.length > 0
            ? {
                filename: `visitor-funnel-preview-${new Date().toISOString().slice(0, 10)}.csv`,
                headers: [
                  "Anonymous ID",
                  "Channel",
                  "Source",
                  "Campaign",
                  "Deepest Stage",
                  "First Seen",
                  "Last Seen",
                  "Identities",
                ],
                rows: () => buildCsvRows(previewRecords),
              }
            : undefined
        }
        isEmpty={!isAdmin || (!previewLoading && previewRecords.length === 0)}
        emptyMessage={isAdmin ? previewError ?? "No matching visitor records." : "Admin access required."}
      >
        <div className="space-y-2">
          {previewRecords.map((record) => (
            <div key={record.visitorId} className="rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {record.firstTouchSource ?? "unknown source"} / {record.firstTouchChannel ?? "unknown channel"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.anonymousId} · {new Date(record.firstSeenAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deepest Stage</p>
                  <p className="text-sm font-semibold text-foreground">{formatStage(record.deepestStage)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-xs lg:grid-cols-3">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">Milestones</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>Demo: {formatMilestone(record, "demo_booked")}</div>
                    <div>Kanban: {formatMilestone(record, "kanban_card_created")}</div>
                    <div>Trial: {formatMilestone(record, "trial_started")}</div>
                    <div>Paid: {formatMilestone(record, "paid_customer")}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">Identity Links</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {(record.identities ?? []).slice(0, 4).map((identity) => (
                      <div key={`${identity.type}:${identity.value}`}>
                        {identity.type}: {identity.value} ({identity.provenance})
                      </div>
                    ))}
                    {(record.identities?.length ?? 0) === 0 ? <div>None</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">Provider Evidence</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {(record.providers ?? []).slice(0, 4).map((provider) => (
                      <div key={provider.provider}>
                        {provider.provider}: {provider.signalCount} signals{provider.accepted ? " accepted" : ""}
                      </div>
                    ))}
                    {(record.providers?.length ?? 0) === 0 ? <div>None</div> : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {isAdmin && funnel.recordsApi.href ? (
          <div className="mt-4 flex justify-end">
            <a
              href={funnel.recordsApi.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Open records API
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}
      </DrilldownPanel>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: VisitorFunnelBreakdownRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Top acquisition slices in the current filter context.</p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{row.key}</p>
              <p className="text-xs text-muted-foreground">{row.visitors.toLocaleString()} visitors</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Identified {row.identified} · Demo {row.demoBooked} · Kanban {row.kanbanCards} · Trial {row.trialsStarted} · Paid {row.paidCustomers}
            </p>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No breakdown rows in the selected range.</p>
        ) : null}
      </div>
    </div>
  );
}
