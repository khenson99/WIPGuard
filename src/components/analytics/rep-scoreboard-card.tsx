"use client";

import type { DealsByRep } from "@/lib/analytics/types";
import { DataTable, type DataTableColumn, fmt$, fmtN, SectionCard } from "./dashboard-primitives";

export function RepScoreboardCard({
  rows,
  title = "Sales Rep Scoreboard",
  subtitle = "Pipeline and win metrics by team member",
  emptyMessage = "No rep data available",
}: {
  rows?: DealsByRep[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}) {
  const repRows = [...(rows ?? [])].sort((a, b) => b.value - a.value);

  const columns: DataTableColumn<DealsByRep>[] = [
    { key: "repName", label: "Rep Name" },
    { key: "count", label: "Total Deals", align: "right", render: (row) => fmtN(row.count) },
    { key: "value", label: "Total Pipeline", align: "right", render: (row) => fmt$(row.value) },
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
  ];

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <DataTable columns={columns} rows={repRows} emptyMessage={emptyMessage} />
    </SectionCard>
  );
}

