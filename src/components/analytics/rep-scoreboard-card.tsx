"use client";

import type { DealsByRep, HubSpotData, StripeData } from "@/lib/analytics/types";
import { DataTable, type DataTableColumn, fmt$, fmtN, fmtPct, SectionCard } from "./dashboard-primitives";

type HubspotDeal = NonNullable<HubSpotData["deals"]>[number];
type StripeChurnEvent = StripeData["subscriptions"]["recentChurnEvents"][number];

const DEMO_BOOKED_STAGES = new Set([
  "Demo Scheduled",
  "No-Show/Reschedule",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
  "Closed Lost",
]);

function normalizeRepName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function RepScoreboardCard({
  rows,
  deals,
  stripeChurnEvents,
  title = "Sales Rep Scoreboard",
  subtitle = "Pipeline and win metrics by team member",
  emptyMessage = "No rep data available",
}: {
  rows?: DealsByRep[];
  deals?: HubspotDeal[];
  stripeChurnEvents?: StripeChurnEvent[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}) {
  const repRows = [...(rows ?? [])].sort((a, b) => b.value - a.value);

  const dealsByRep = new Map<string, HubspotDeal[]>();
  for (const deal of deals ?? []) {
    const key = normalizeRepName(deal.repName ?? "Unassigned");
    const bucket = dealsByRep.get(key);
    if (bucket) bucket.push(deal);
    else dealsByRep.set(key, [deal]);
  }

  const churnedCustomers = new Set((stripeChurnEvents ?? []).map((event) => event.customer));

  type RepScoreboardRow = DealsByRep & {
    demosBooked: number | null;
    noShows: number | null;
    noShowRate: number | null;
    closedLost: number | null;
    winRate: number | null;
    avgDeal: number | null;
    avgWon: number | null;
    churnedClosedWon: number | null;
    churnRate: number | null;
    demoToWonRate: number | null;
  };

  const tableRows: RepScoreboardRow[] = repRows.map((row) => {
    const repDeals = dealsByRep.get(normalizeRepName(row.repName)) ?? null;
    const avgDeal = row.count > 0 ? row.value / row.count : 0;
    const avgWon = row.closedWon > 0 ? row.closedWonValue / row.closedWon : 0;

    if (!repDeals) {
      return {
        ...row,
        demosBooked: null,
        noShows: null,
        noShowRate: null,
        closedLost: null,
        winRate: null,
        churnedClosedWon: null,
        churnRate: null,
        demoToWonRate: null,
        avgDeal,
        avgWon,
      };
    }

    const demosBooked = repDeals.filter((deal) => DEMO_BOOKED_STAGES.has(deal.stageLabel)).length;
    const noShows = repDeals.filter((deal) => deal.stageLabel === "No-Show/Reschedule").length;
    const closedLost = repDeals.filter((deal) => deal.stageLabel === "Closed Lost").length;
    const decided = row.closedWon + closedLost;

    const churnedClosedWon = repDeals.filter((deal) => {
      if (deal.stageLabel !== "Closed Won") return false;
      const customerId = deal.stripeCustomerId?.trim();
      return Boolean(customerId && churnedCustomers.has(customerId));
    }).length;

    const winRate = decided > 0 ? (row.closedWon / decided) * 100 : 0;
    const noShowRate = demosBooked > 0 ? (noShows / demosBooked) * 100 : 0;
    const churnRate =
      row.closedWon > 0 ? (Math.min(churnedClosedWon, row.closedWon) / row.closedWon) * 100 : 0;
    const demoToWonRate = demosBooked > 0 ? (row.closedWon / demosBooked) * 100 : 0;

    return {
      ...row,
      demosBooked,
      noShows,
      noShowRate,
      closedLost,
      winRate,
      churnedClosedWon,
      churnRate,
      demoToWonRate,
      avgDeal,
      avgWon,
    };
  });

  const columns: DataTableColumn<RepScoreboardRow>[] = [
    { key: "repName", label: "Rep Name" },
    { key: "count", label: "Total Deals", align: "right", render: (row) => fmtN(row.count) },
    { key: "value", label: "Total Pipeline", align: "right", render: (row) => fmt$(row.value) },
    {
      key: "avgDeal",
      label: "Avg Deal",
      align: "right",
      render: (row) => (row.avgDeal == null ? "—" : fmt$(row.avgDeal)),
    },
    {
      key: "demosBooked",
      label: "Demos",
      align: "right",
      render: (row) => (row.demosBooked == null ? "—" : fmtN(row.demosBooked)),
    },
    {
      key: "noShows",
      label: "No-Shows",
      align: "right",
      render: (row) => (row.noShows == null ? "—" : fmtN(row.noShows)),
    },
    {
      key: "noShowRate",
      label: "No-Show %",
      align: "right",
      render: (row) => (row.noShowRate == null ? "—" : fmtPct(row.noShowRate)),
    },
    { key: "closedWon", label: "Won Count", align: "right", render: (row) => fmtN(row.closedWon) },
    {
      key: "closedWonValue",
      label: "Won Revenue",
      align: "right",
      render: (row) => (
        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          {fmt$(row.closedWonValue)}
        </span>
      ),
    },
    {
      key: "avgWon",
      label: "Avg Won",
      align: "right",
      render: (row) => (row.avgWon == null ? "—" : fmt$(row.avgWon)),
    },
    {
      key: "closedLost",
      label: "Lost Count",
      align: "right",
      render: (row) => (row.closedLost == null ? "—" : fmtN(row.closedLost)),
    },
    {
      key: "winRate",
      label: "Win Rate",
      align: "right",
      render: (row) => (row.winRate == null ? "—" : fmtPct(row.winRate)),
    },
    {
      key: "demoToWonRate",
      label: "Demo→Won %",
      align: "right",
      render: (row) => (row.demoToWonRate == null ? "—" : fmtPct(row.demoToWonRate)),
    },
    {
      key: "churnedClosedWon",
      label: "Churned Won",
      align: "right",
      render: (row) => (row.churnedClosedWon == null ? "—" : fmtN(row.churnedClosedWon)),
    },
    {
      key: "churnRate",
      label: "Churn %",
      align: "right",
      render: (row) => (row.churnRate == null ? "—" : fmtPct(row.churnRate)),
    },
  ];

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <DataTable columns={columns} rows={tableRows} emptyMessage={emptyMessage} />
    </SectionCard>
  );
}
