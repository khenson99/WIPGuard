"use client";

import React, { useMemo, useState } from "react";
import { DataTable, type DataTableColumn, fmt$, fmtN, fmtPct, SectionCard } from "@/components/analytics/dashboard-primitives";
import type {
  ChannelGroup,
  SalesPerformanceDealAuditRow,
  SalesPerformancePack,
  SalesPerformanceRepMonthChannelRow,
  SalesPerformanceRepMonthRow,
} from "@/lib/analytics/types";

type TabId = "repMonth" | "repMonthChannel" | "dealAudit" | "channelMapping";

function monthRangeUtc(fromIso: string, toIso: string): string[] {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return [];

  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  const out: string[] = [];
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return fmtPct(value * 100);
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  ).sort((a, b) => a.localeCompare(b));

  const escapeCell = (value: unknown) => {
    if (value == null) return "";
    const text = Array.isArray(value) ? value.join(";") : String(value);
    const needsQuotes = /[",\n]/.test(text);
    const escaped = text.replaceAll('"', '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function flattenRow(
  row: Record<string, unknown>,
  prefix = "",
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const [key, value] of Object.entries(row)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      out[nextKey] = value;
      continue;
    }
    flattenRow(value as Record<string, unknown>, nextKey, out);
  }
  return out;
}

function channelGroupOptions(): ChannelGroup[] {
  return ["Inbound", "Outbound", "Partner", "Product-led", "Unknown"];
}

export function SalesPerformanceView({ pack }: { pack: SalesPerformancePack | null }) {
  const [tab, setTab] = useState<TabId>("repMonth");
  const [repFilter, setRepFilter] = useState<string>("All");
  const [channelFilter, setChannelFilter] = useState<ChannelGroup | "All">("All");

  const repNames = useMemo(() => {
    const reps = new Set<string>();
    for (const row of pack?.repMonthRows ?? []) reps.add(row.repName);
    return ["All", ...[...reps].sort((a, b) => a.localeCompare(b))];
  }, [pack]);

  const months = useMemo(() => {
    if (!pack) return [];
    return monthRangeUtc(pack.from, pack.to);
  }, [pack]);

  const repMonthRows = useMemo(() => {
    const rows = pack?.repMonthRows ?? [];
    return rows.filter((row) => repFilter === "All" || row.repName === repFilter);
  }, [pack, repFilter]);

  const repMonthChannelRows = useMemo(() => {
    const rows = pack?.repMonthChannelRows ?? [];
    return rows.filter((row) => {
      if (repFilter !== "All" && row.repName !== repFilter) return false;
      if (channelFilter !== "All" && row.channelGroup !== channelFilter) return false;
      return true;
    });
  }, [pack, repFilter, channelFilter]);

  const dealAuditRows = useMemo(() => {
    const rows = pack?.dealAuditRows ?? [];
    return rows.filter((row) => repFilter === "All" || row.repName === repFilter);
  }, [pack, repFilter]);

  const dataQuality = useMemo(() => {
    if (!pack) return null;

    const from = new Date(pack.from);
    const to = new Date(pack.to);
    const inRange = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return false;
      return d >= from && d <= to;
    };

    const signedDeals = dealAuditRows.filter(
      (row) => row.stageId.toLowerCase() === "closedwon" && inRange(row.closedAt)
    );
    const total = signedDeals.length;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : null);

    const missingSource = signedDeals.filter((row) => row.flags.includes("missing_source")).length;
    const missingOwner = signedDeals.filter((row) => row.flags.includes("missing_owner")).length;
    const amountZero = signedDeals.filter((row) => row.flags.includes("amount_zero")).length;
    const missingCloseDate = signedDeals.filter((row) => row.flags.includes("missing_close_date")).length;

    return {
      total,
      missingSourcePct: pct(missingSource),
      missingOwnerPct: pct(missingOwner),
      amountZeroPct: pct(amountZero),
      missingCloseDatePct: pct(missingCloseDate),
    };
  }, [pack, dealAuditRows]);

  const repAverages = useMemo(() => {
    if (!pack) return [];
    const reps = repNames.filter((r) => r !== "All");
    const index = new Map<string, Map<string, SalesPerformanceRepMonthRow>>();
    for (const row of pack.repMonthRows) {
      const repBucket = index.get(row.repName) ?? new Map<string, SalesPerformanceRepMonthRow>();
      repBucket.set(row.month, row);
      index.set(row.repName, repBucket);
    }

    return reps.map((repName) => {
      const repBucket = index.get(repName) ?? new Map();
      let signedDeals = 0;
      let booked = 0;
      let realized = 0;
      for (const month of months) {
        const row = repBucket.get(month);
        if (!row) continue;
        signedDeals += row.signedDealsCount;
        booked += row.signedDealsBookedValue;
        realized += row.signedDealsRealizedValue30d;
      }
      const denom = months.length || 1;
      return {
        repName,
        avgSignedDealsPerMonth: signedDeals / denom,
        avgBookedPerMonth: booked / denom,
        avgRealizedPerMonth30d: realized / denom,
      };
    });
  }, [pack, repNames, months]);

  const repMonthColumns: DataTableColumn<SalesPerformanceRepMonthRow>[] = [
    { key: "month", header: "Month" },
    { key: "repName", header: "Rep" },
    { key: "leadsCreatedCount", header: "Leads", align: "right", render: (r) => fmtN(r.leadsCreatedCount) },
    { key: "opportunitiesCreatedCount", header: "Opps", align: "right", render: (r) => fmtN(r.opportunitiesCreatedCount) },
    { key: "leadToOpportunityRate", header: "Lead→Opp", align: "right", render: (r) => formatRate(r.leadToOpportunityRate) },
    { key: "signedDealsCount", header: "Signed", align: "right", render: (r) => fmtN(r.signedDealsCount) },
    { key: "signedDealsBookedValue", header: "Booked", align: "right", render: (r) => fmt$(r.signedDealsBookedValue) },
    { key: "avgSignedDealSizeBooked", header: "Avg Deal", align: "right", render: (r) => (r.avgSignedDealSizeBooked == null ? "—" : fmt$(r.avgSignedDealSizeBooked)) },
    { key: "medianSignedDealSizeBooked", header: "Median", align: "right", render: (r) => (r.medianSignedDealSizeBooked == null ? "—" : fmt$(r.medianSignedDealSizeBooked)) },
    { key: "signedDealsRealizedValue30d", header: "Realized 30d", align: "right", render: (r) => fmt$(r.signedDealsRealizedValue30d) },
    { key: "bookedToRealizedRatio30d", header: "Booked→Realized", align: "right", render: (r) => formatRate(r.bookedToRealizedRatio30d) },
    { key: "opportunityToClosedRate90d", header: "Opp→Won (90d)", align: "right", render: (r) => formatRate(r.opportunityToClosedRate90d) },
    { key: "winRateDecided", header: "Win Rate (decided)", align: "right", render: (r) => formatRate(r.winRateDecided) },
    { key: "signedInboundShare", header: "Inbound %", align: "right", render: (r) => formatRate(r.signedInboundShare) },
    { key: "signedOutboundShare", header: "Outbound %", align: "right", render: (r) => formatRate(r.signedOutboundShare) },
    { key: "signedPartnerShare", header: "Partner %", align: "right", render: (r) => formatRate(r.signedPartnerShare) },
    { key: "signedProductLedShare", header: "Product-led %", align: "right", render: (r) => formatRate(r.signedProductLedShare) },
    { key: "signedUnknownShare", header: "Unknown %", align: "right", render: (r) => formatRate(r.signedUnknownShare) },
  ];

  const repMonthChannelColumns: DataTableColumn<SalesPerformanceRepMonthChannelRow>[] = [
    { key: "month", header: "Month" },
    { key: "repName", header: "Rep" },
    { key: "channelGroup", header: "Group" },
    { key: "rawSource", header: "Source" },
    { key: "opportunitiesCreatedCount", header: "Opps", align: "right", render: (r) => fmtN(r.opportunitiesCreatedCount) },
    { key: "signedDealsCount", header: "Signed", align: "right", render: (r) => fmtN(r.signedDealsCount) },
    { key: "bookedValue", header: "Booked", align: "right", render: (r) => fmt$(r.bookedValue) },
    { key: "avgBookedDealSize", header: "Avg Deal", align: "right", render: (r) => (r.avgBookedDealSize == null ? "—" : fmt$(r.avgBookedDealSize)) },
    { key: "realizedValue30d", header: "Realized 30d", align: "right", render: (r) => fmt$(r.realizedValue30d) },
    { key: "winRateDecided", header: "Win Rate", align: "right", render: (r) => formatRate(r.winRateDecided) },
    { key: "avgDaysToClose", header: "Days to close", align: "right", render: (r) => (r.avgDaysToClose == null ? "—" : r.avgDaysToClose.toFixed(1)) },
  ];

  const dealAuditColumns: DataTableColumn<SalesPerformanceDealAuditRow>[] = [
    { key: "hubspotDealId", header: "Deal ID" },
    { key: "dealName", header: "Deal" },
    { key: "repName", header: "Rep" },
    { key: "stageLabel", header: "Stage" },
    { key: "amount", header: "Amount", align: "right", render: (r) => fmt$(r.amount) },
    { key: "rawSource", header: "Source" },
    { key: "channelGroup", header: "Group" },
    { key: "stripeLinked", header: "Stripe", align: "center", render: (r) => (r.stripeLinked ? "Y" : "—") },
    { key: "stripeRealized30d", header: "Realized 30d", align: "right", render: (r) => fmt$(r.stripeRealized30d) },
    { key: "flags", header: "Flags", render: (r) => (r.flags.length ? r.flags.join(", ") : "—") },
  ];

  const mappingColumns: DataTableColumn<{ rawSource: string; channelGroup: ChannelGroup }>[] = [
    { key: "rawSource", header: "HubSpot source" },
    { key: "channelGroup", header: "Channel group" },
  ];

  if (!pack) {
    return (
      <SectionCard title="Sales Performance" subtitle="Rep-by-month sales performance pack">
        <p className="text-sm text-muted-foreground">No data available.</p>
      </SectionCard>
    );
  }

  const exportRepMonth = () => {
    downloadCsv(
      `sales-performance_rep-by-month_${pack.from.slice(0, 10)}_${pack.to.slice(0, 10)}.csv`,
      repMonthRows.map((r) => flattenRow(r as unknown as Record<string, unknown>))
    );
  };

  const exportRepMonthChannel = () => {
    downloadCsv(
      `sales-performance_rep-by-month-channel_${pack.from.slice(0, 10)}_${pack.to.slice(0, 10)}.csv`,
      repMonthChannelRows.map((r) => flattenRow(r as unknown as Record<string, unknown>))
    );
  };

  const exportDealAudit = () => {
    downloadCsv(
      `sales-performance_deal-audit_${pack.from.slice(0, 10)}_${pack.to.slice(0, 10)}.csv`,
      dealAuditRows.map((r) => flattenRow(r as unknown as Record<string, unknown>))
    );
  };

  const exportMapping = () => {
    downloadCsv(
      `sales-performance_channel-mapping_${pack.from.slice(0, 10)}_${pack.to.slice(0, 10)}.csv`,
      pack.channelMapping.map((r) => ({ rawSource: r.rawSource, channelGroup: r.channelGroup }))
    );
  };

  return (
    <div className="space-y-4">
      {pack.errors.length > 0 ? (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-700 dark:text-yellow-300">
          <p className="font-medium text-foreground">Notes</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {pack.errors.slice(0, 5).map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {dataQuality && dataQuality.total > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium text-foreground">Data quality (Closed Won in range)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtN(dataQuality.total)} signed deals · Missing source {dataQuality.missingSourcePct == null ? "—" : fmtPct(dataQuality.missingSourcePct)} · Missing owner{" "}
            {dataQuality.missingOwnerPct == null ? "—" : fmtPct(dataQuality.missingOwnerPct)} · Amount = 0{" "}
            {dataQuality.amountZeroPct == null ? "—" : fmtPct(dataQuality.amountZeroPct)} · Missing close date{" "}
            {dataQuality.missingCloseDatePct == null ? "—" : fmtPct(dataQuality.missingCloseDatePct)}
          </p>
        </div>
      ) : null}

      <SectionCard
        title="Sales Performance"
        subtitle={`Rep-by-month performance · ${pack.from.slice(0, 10)} → ${pack.to.slice(0, 10)}${pack.fromSnapshot ? " (cached)" : ""}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">
              Rep{" "}
              <select
                className="ml-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
              >
                {repNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {tab === "repMonthChannel" ? (
              <label className="text-xs text-muted-foreground">
                Channel{" "}
                <select
                  className="ml-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value as ChannelGroup | "All")}
                >
                  <option value="All">All</option>
                  {channelGroupOptions().map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("repMonth")}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                tab === "repMonth" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Rep × Month
            </button>
            <button
              type="button"
              onClick={() => setTab("repMonthChannel")}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                tab === "repMonthChannel" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Rep × Month × Channel
            </button>
            <button
              type="button"
              onClick={() => setTab("dealAudit")}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                tab === "dealAudit" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Deal Audit
            </button>
            <button
              type="button"
              onClick={() => setTab("channelMapping")}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                tab === "channelMapping" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Channel Mapping
            </button>
          </div>
        </div>

        <div className="mt-4">
          {tab === "repMonth" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Average signed deals per rep per month includes months with zero signed deals in the selected range.
                </p>
                <button
                  type="button"
                  onClick={exportRepMonth}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Export CSV
                </button>
              </div>

              <DataTable
                columns={
                  [
                    { key: "repName", header: "Rep" },
                    {
                      key: "avgSignedDealsPerMonth",
                      header: "Avg signed / month",
                      align: "right",
                      render: (r) => (r.avgSignedDealsPerMonth as number).toFixed(2),
                    },
                    {
                      key: "avgBookedPerMonth",
                      header: "Avg booked / month",
                      align: "right",
                      render: (r) => fmt$(r.avgBookedPerMonth as number),
                    },
                    {
                      key: "avgRealizedPerMonth30d",
                      header: "Avg realized 30d / month",
                      align: "right",
                      render: (r) => fmt$(r.avgRealizedPerMonth30d as number),
                    },
                  ] satisfies DataTableColumn<Record<string, unknown>>[]
                }
                rows={repAverages as unknown as Record<string, unknown>[]}
                emptyMessage="No reps found in this range."
              />

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Detailed rep-by-month table</p>
                <button
                  type="button"
                  onClick={exportRepMonth}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Export CSV
                </button>
              </div>
              <DataTable columns={repMonthColumns} rows={repMonthRows} emptyMessage="No rep-month rows in this range." />
            </div>
          ) : null}

          {tab === "repMonthChannel" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Channel drilldown (volume vs quality).</p>
                <button
                  type="button"
                  onClick={exportRepMonthChannel}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Export CSV
                </button>
              </div>
              <DataTable
                columns={repMonthChannelColumns}
                rows={repMonthChannelRows}
                emptyMessage="No rep-month-channel rows in this range."
              />
            </div>
          ) : null}

          {tab === "dealAudit" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Audit extract (every metric traces back to deals).</p>
                <button
                  type="button"
                  onClick={exportDealAudit}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Export CSV
                </button>
              </div>
              <DataTable columns={dealAuditColumns} rows={dealAuditRows} emptyMessage="No deals in this range." />
            </div>
          ) : null}

          {tab === "channelMapping" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                  Mapping is heuristic; update classification rules in `src/lib/analytics/fetchers.ts` (`classifyChannelGroup`) if needed.
                </p>
                <button
                  type="button"
                  onClick={exportMapping}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Export CSV
                </button>
              </div>
              <DataTable columns={mappingColumns} rows={pack.channelMapping} emptyMessage="No sources found." />
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
