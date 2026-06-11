/**
 * Client-side CSV export for the Imladris metric dashboards.
 *
 * Serializes exactly what the selected dashboard renders for the selected
 * month — the same snapshot / delta / trend gating as the KPI tiles. The
 * live-or-error principle carries into the export: metrics without a live
 * series get no delta and are stamped with the current period, and demo-mode
 * exports are labeled `demo` in every row and in the filename. Nothing is
 * fabricated to fill cells.
 */

import { DEPT_LABEL, deltaPct, fmtByUnit, hasTrend, snapshot } from "./format";
import type { DashboardDefinition, ImladrisModel } from "./types";

const CSV_HEADER = [
  "section",
  "metric_key",
  "metric",
  "department",
  "unit",
  "month",
  "value",
  "value_formatted",
  "delta_pct_vs_prev",
  "status",
  "confidence_pct",
  "sources",
  "data_source",
] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface DashboardSection {
  title: string;
  keys: string[];
}

function sectionsOf(dashboard: DashboardDefinition): DashboardSection[] {
  return [
    { title: "Headline", keys: dashboard.hero },
    ...dashboard.groups.map((g) => ({ title: g.title, keys: g.keys })),
  ];
}

/** Build the CSV body for one dashboard at the selected month index. */
export function buildDashboardCsv(
  model: ImladrisModel,
  dashboard: DashboardDefinition,
  idx: number,
): string {
  const rows: string[] = [CSV_HEADER.join(",")];

  for (const section of sectionsOf(dashboard)) {
    for (const key of section.keys) {
      const m = model.metricByKey[key];
      if (!m) continue;

      const trend = hasTrend(model, m);
      const snap = trend ? snapshot(m, idx) : null;
      const value = snap ? snap.value : m.value;
      const delta = snap ? deltaPct(snap.value, snap.prev) : null;
      const month = snap ? (model.months[snap.idx] ?? model.currentMonth) : model.currentMonth;

      rows.push(
        [
          csvCell(section.title),
          csvCell(m.key),
          csvCell(m.label),
          csvCell(DEPT_LABEL[m.dept] ?? m.dept),
          csvCell(m.unit),
          csvCell(month),
          csvCell(Number.isFinite(value) ? value : null),
          csvCell(Number.isFinite(value) ? fmtByUnit(value, m.unit) : null),
          csvCell(delta == null ? null : Math.round(delta * 10) / 10),
          csvCell(m.status),
          csvCell(Math.round(m.confidence * 100)),
          csvCell(m.sources.join("|")),
          csvCell(model.mode),
        ].join(","),
      );
    }
  }

  return `${rows.join("\r\n")}\r\n`;
}

/** `imladris-<dashboard>-<month>[-demo].csv` */
export function dashboardCsvFilename(
  model: ImladrisModel,
  dashboard: DashboardDefinition,
  idx: number,
): string {
  const month = model.months[Math.max(0, Math.min(idx, model.months.length - 1))] ?? model.currentMonth;
  const demoSuffix = model.mode === "demo" ? "-demo" : "";
  return `imladris-${dashboard.id}-${month}${demoSuffix}.csv`;
}

/** Trigger a browser download of the dashboard CSV. Client-side only. */
export function downloadDashboardCsv(
  model: ImladrisModel,
  dashboard: DashboardDefinition,
  idx: number,
): void {
  const blob = new Blob([buildDashboardCsv(model, dashboard, idx)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dashboardCsvFilename(model, dashboard, idx);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
