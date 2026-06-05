/**
 * "What needs attention" feed builder — ported from `buildAttention` in
 * `prototype/app/components.jsx`. Ranks source issues, anomalies, and
 * off-target pacing; returns at most 4 items, error → warning → info.
 */

import { deltaPct, fmtByUnit, fmtMetric, paceState, snapshot } from "./format";
import type { ImladrisModel } from "./types";

export type AttentionSeverity = "error" | "warning" | "info";

export interface AttentionItem {
  sev: AttentionSeverity;
  tag: string;
  title: string;
  desc: string;
  metricKey: string;
  mag: number;
}

const SEV_RANK: Record<AttentionSeverity, number> = { error: 3, warning: 2, info: 1 };

export function buildAttention(model: ImladrisModel, idx: number): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. source issues
  const stateToSev: Record<string, AttentionSeverity> = { error: "error", stale: "warning", partial: "info" };
  Object.entries(model.providers).forEach(([key, p]) => {
    if (p.state === "connected") return;
    const affected = model.metrics.filter((m) => m.sources.includes(key as never));
    if (!affected.length) return;
    const affLabels = affected.slice(0, 2).map((m) => m.label.toLowerCase()).join(", ");
    items.push({
      sev: stateToSev[p.state] ?? "info",
      tag: "Data source",
      title: `${p.label} · ${p.state === "error" ? "disconnected" : p.state}`,
      desc: `${p.error || ""} Affects ${affLabels}${affected.length > 2 ? ` +${affected.length - 2} more` : ""}.`,
      metricKey: affected[0].key,
      mag: 100,
    });
  });

  // 2. anomalies + goal pacing
  model.metrics.forEach((m) => {
    const snap = snapshot(m, idx);
    const d = deltaPct(snap.value, snap.prev);
    if (d != null) {
      const up = d > 0;
      const bad = m.good === "down" ? up : !up;
      if (bad && Math.abs(d) >= 8) {
        items.push({
          sev: Math.abs(d) >= 12 ? "warning" : "info",
          tag: "Anomaly",
          title: `${m.label} ${up ? "up" : "down"} ${Math.abs(d).toFixed(0)}% MoM`,
          desc: m.narrative ?? "",
          metricKey: m.key,
          mag: Math.abs(d),
        });
        return;
      }
    }
    if (m.target != null) {
      const st = paceState(snap.value, m.target, m.good);
      if (st === "behind") {
        const gap =
          m.good === "down"
            ? ((snap.value - m.target) / m.target) * 100
            : ((m.target - snap.value) / m.target) * 100;
        if (gap >= 6) {
          items.push({
            sev: gap >= 18 ? "warning" : "info",
            tag: "Off target",
            title: `${m.label} behind plan`,
            desc: `${fmtMetric(m, snap.value)} vs ${m.targetLabel || fmtByUnit(m.target, m.unit)} target.`,
            metricKey: m.key,
            mag: gap,
          });
        }
      }
    }
  });

  items.sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev] || b.mag - a.mag);
  return items.slice(0, 4);
}
