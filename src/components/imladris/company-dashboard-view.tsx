"use client";

/**
 * Company Tracker (lead view) renderer — the bespoke, founder-cockpit variant.
 *
 * Ported from the Company-Tracker-only sections of `DashboardView` in
 * `prototype/app/dashboards.jsx` (`CompanyHeadline`, `Stat`, `BoardPacing`,
 * `SegmentMatrix`). It is ADDITIVE: the generic `DashboardView` is untouched and
 * still drives Operating + the department views. This component is selected by
 * the Company route via the `isCompany` branch below.
 *
 * Composition: "What needs attention" → headline hero tiles → north-star ARR
 * area chart + revenue-composition contribution bars → board pacing bullets →
 * cohorts & segments (demo plan-tier matrix / live benchmark cohorts) → the
 * grouped KPI sections.
 *
 * Live-or-error is preserved end-to-end: the ARR/revenue-composition and board
 * pacing only render with the data they actually have (no series ⇒ the chart
 * shows its single-period empty state; no breakdown ⇒ an honest note); the
 * segment matrix renders the demo plan-tier cohorts only in demo mode and the
 * live `benchmarkContext.cohorts` only when the company API supplied them.
 */

import { AttentionFeed, KpiTile } from "./kpi-tile";
import { AreaChart } from "./charts";
import {
  fmtByUnit,
  fmtCurrency,
  fmtMetric,
  hasTrend,
  monthAbbr,
  monthName,
  numberOr0,
  snapshot,
} from "./format";
import { MetricIcon } from "./icons";
import { Contribution, DeltaChip, PaceBar } from "./primitives";
import { ArrowUpRight } from "lucide-react";
import styles from "./imladris-dashboard.module.css";
import type {
  DashboardDefinition,
  ImladrisModel,
  LiveSegment,
  MetricCohortDimension,
  NormalizedMetric,
} from "./types";

function gridClass(n: number): string {
  if (n >= 5) return styles.g5;
  if (n === 4) return styles.g4;
  if (n === 3) return styles.g3;
  if (n === 2) return styles.g2;
  return styles.g3;
}
function groupGrid(n: number): string {
  if (n <= 3) return gridClass(n);
  if (n === 4) return styles.g4;
  return styles.g3;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <span className={styles.sectionNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

interface TilesProps {
  keys: string[];
  model: ImladrisModel;
  idx: number;
  onOpen: (key: string) => void;
  month: string;
  prevMonth: string;
  hero?: boolean;
}

function Tiles({ keys, model, idx, onOpen, month, prevMonth, hero }: TilesProps) {
  return (
    <div className={`${styles.grid} ${hero ? gridClass(keys.length) : groupGrid(keys.length)}`}>
      {keys.map((k) => {
        const m = model.metricByKey[k];
        if (!m) return null;
        return (
          <KpiTile
            key={k}
            metric={m}
            idx={idx}
            onOpen={onOpen}
            hero={hero}
            month={month}
            compareLabel={`vs ${monthAbbr(prevMonth)}`}
            noTrend={!hasTrend(model, m)}
          />
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${styles.num}`}>{value}</div>
    </div>
  );
}

// ---- Company Tracker headline: ARR trajectory + revenue composition ----
function CompanyHeadline({
  model,
  idx,
  months,
  onOpen,
}: {
  model: ImladrisModel;
  idx: number;
  months: string[];
  onOpen: (key: string) => void;
}) {
  const arr = model.metricByKey["revenue.arr"];
  const rev = model.metricByKey["revenue.total_revenue"];
  const gm = model.metricByKey["finance.gross_margin"];
  const mrr = model.metricByKey["revenue.mrr"];
  if (!arr) return null;

  const arrSnap = snapshot(arr, idx);
  const netNew = arrSnap.prev != null ? arrSnap.value - arrSnap.prev : null;
  const arrHasTrend = hasTrend(model, arr);

  return (
    <section className={styles.section}>
      <div className={styles.grid} style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div className={`${styles.tile} ${styles.tileStatic}`} style={{ padding: "16px 18px" }}>
          <div className={styles.sectionHead} style={{ marginBottom: 6 }}>
            <div>
              <div className={styles.eyebrow}>North star</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                <span className={styles.num} style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {fmtCurrency(arrSnap.value)}
                </span>
                <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>ARR</span>
                {arrHasTrend && (
                  <DeltaChip
                    value={arrSnap.value}
                    prev={arrSnap.prev}
                    good="up"
                    compareLabel={`vs ${monthAbbr(months[Math.max(0, idx - 1)])}`}
                  />
                )}
              </div>
            </div>
            <button type="button" className={styles.pill} onClick={() => onOpen("revenue.arr")} style={{ height: 30 }}>
              Details <ArrowUpRight size={13} />
            </button>
          </div>
          {arrHasTrend ? (
            <AreaChart data={arr.history} months={months} selected={idx} height={188} />
          ) : (
            <div className={styles.chartEmpty} style={{ height: 188 }}>
              Single reported period — no ARR series published yet.
            </div>
          )}
          <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
            <Stat
              label="Net-new ARR"
              value={netNew == null ? "—" : `${netNew >= 0 ? "+" : ""}${fmtCurrency(netNew)}`}
            />
            {mrr && <Stat label="MRR" value={fmtCurrency(snapshot(mrr, idx).value)} />}
            {rev && <Stat label="Recognized rev." value={fmtCurrency(snapshot(rev, idx).value)} />}
          </div>
        </div>

        <div className={`${styles.tile} ${styles.tileStatic}`} style={{ padding: "16px 18px" }}>
          <div className={styles.dblockTitle} style={{ marginBottom: 12 }}>
            Revenue composition · {monthName(months[idx])}
          </div>
          {rev?.breakdown ? (
            <Contribution parts={rev.breakdown.parts} unit="currency" />
          ) : (
            <p className={`${styles.narr} ${styles.narrMuted}`} style={{ marginTop: 0 }}>
              Composition breakdown unavailable from the API.
            </p>
          )}
          {gm && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Stat label="Gross margin" value={fmtByUnit(snapshot(gm, idx).value, "percent")} />
                <div style={{ flex: 1, margin: "0 0 0 16px" }}>
                  <PaceBar value={snapshot(gm, idx).value} target={gm.target} good="up" unit="percent" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Board pacing strip (goal vs actual bullets) ----
const BOARD_PACING_KEYS = [
  "revenue.arr",
  "finance.cash_runway_months",
  "finance.net_burn",
  "customer_success.retention_rate",
];

function BoardPacing({
  model,
  idx,
  onOpen,
}: {
  model: ImladrisModel;
  idx: number;
  onOpen: (key: string) => void;
}) {
  const rows = BOARD_PACING_KEYS.map((k) => model.metricByKey[k]).filter(
    (m): m is NormalizedMetric => !!m && m.target != null,
  );
  if (!rows.length) return null;
  return (
    <Section title="Board pacing" note="Goal vs actual against this year's plan">
      <div className={`${styles.tile} ${styles.tileStatic}`} style={{ padding: "16px 18px" }}>
        <div className={`${styles.grid} ${styles.g2}`} style={{ gap: "16px 40px" }}>
          {rows.map((m) => {
            const snap = snapshot(m, idx);
            return (
              <button
                key={m.key}
                type="button"
                className={styles.bullet}
                onClick={() => onOpen(m.key)}
                style={{ background: "none", border: "none", textAlign: "left", padding: 0 }}
              >
                <div className={styles.bulletHead}>
                  <span className={styles.bulletName}>{m.label}</span>
                  <span className={`${styles.bulletSub} ${styles.num}`}>
                    {fmtMetric(m, snap.value)} <span style={{ color: "var(--border-strong)" }}>/</span>{" "}
                    {m.targetLabel || fmtByUnit(m.target, m.unit)}
                  </span>
                </div>
                <PaceBar value={snap.value} target={m.target} good={m.good} unit={m.unit} />
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ---- Cohorts & segments matrix (Company Tracker) ----
const SEGMENT_ROW_KEYS = [
  "revenue.arr",
  "revenue.mrr",
  "revenue.customer_count",
  "customer_success.retention_rate",
  "customer_success.churn_rate",
  "product.activation_rate",
];

const LIVE_SEG_STATUS_LABEL: Record<string, string> = {
  strong: "On track",
  achieved: "On track",
  watch: "Watch",
  risk: "At risk",
  critical: "Critical",
  active: "Active",
  missed: "Missed",
  available: "Available",
};

function planDimension(m: NormalizedMetric): MetricCohortDimension | undefined {
  return m.cohorts?.find((d) => d.id === "plan");
}

function SegmentMatrix({
  model,
  idx,
  onOpen,
}: {
  model: ImladrisModel;
  idx: number;
  onOpen: (key: string) => void;
}) {
  // Live mode: render the real benchmark cohorts from the company dashboard API.
  if (model.mode === "live") {
    const segs: LiveSegment[] = model.liveSegmentList ?? [];
    if (!model.hasLiveCohorts || !segs.length) return null;
    return (
      <Section title="Cohorts & segments" note="Benchmark cohorts from the company dashboard API">
        <div className={`${styles.grid} ${styles.g3}`}>
          {segs.map((seg, i) => {
            const v = numberOr0(seg.value);
            const target = seg.sourceMetricKeys?.[0];
            return (
              <button
                type="button"
                className={styles.tile}
                key={seg.id || i}
                onClick={() => target && onOpen(target)}
              >
                <div className={styles.tileTop}>
                  <span className={styles.tileLabel}>{seg.label}</span>
                  <span className={styles.sectionNote}>{LIVE_SEG_STATUS_LABEL[seg.status] || seg.status}</span>
                </div>
                <div className={`${styles.tileValue} ${styles.num}`} style={{ fontSize: 22 }}>
                  {seg.value == null || Number.isNaN(Number(seg.value)) ? "—" : fmtByUnit(v, seg.unit)}
                </div>
                <div className={styles.tileFoot}>
                  <span>{seg.detail || ""}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Section>
    );
  }

  // Demo mode: a plan-tier matrix across the segmentable metrics.
  const rows = SEGMENT_ROW_KEYS.map((k) => model.metricByKey[k]).filter(
    (m): m is NormalizedMetric => !!m && !!planDimension(m),
  );
  if (!rows.length) return null;
  const cols = planDimension(rows[0])!.groups.map((g) => g.label);
  return (
    <Section title="Cohorts & segments" note="By plan tier · click a row to drill in">
      <div className={`${styles.tile} ${styles.tileStatic}`} style={{ padding: "6px 18px 10px" }}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th>Segment</th>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const dim = planDimension(m)!;
              const total =
                dim.type === "additive" ? dim.groups.reduce((s, g) => s + g.history[idx], 0) : 0;
              return (
                <tr key={m.key} onClick={() => onOpen(m.key)}>
                  <td>
                    <span className={styles.mlabel}>
                      <MetricIcon metricKey={m.key} size={14} />
                      {m.label}
                    </span>
                  </td>
                  {cols.map((c) => {
                    const g = dim.groups.find((x) => x.label === c);
                    const v = g ? g.history[idx] : null;
                    return (
                      <td key={c}>
                        <div className={`${styles.mval} ${styles.num}`}>{v == null ? "—" : fmtMetric(m, v)}</div>
                        {dim.type === "additive" && v != null && total ? (
                          <div className={`${styles.mshare} ${styles.num}`}>{((v / total) * 100).toFixed(0)}%</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export interface CompanyDashboardViewProps {
  model: ImladrisModel;
  dashboard: DashboardDefinition;
  idx: number;
  months: string[];
  onOpen: (key: string) => void;
}

/**
 * The Company Tracker lead view. Mirrors the generic `DashboardView` shape
 * (same props) so the shell can render either behind a single branch, but
 * inserts the bespoke headline / board pacing / segment matrix sections between
 * the hero tiles and the grouped KPI sections.
 */
export function CompanyDashboardView({ model, dashboard, idx, months, onOpen }: CompanyDashboardViewProps) {
  const prevMonth = months[Math.max(0, idx - 1)];
  return (
    <div className={styles.canvas}>
      <Section title="What needs attention" note="Ranked by severity · click to inspect">
        <AttentionFeed model={model} idx={idx} onOpen={onOpen} />
      </Section>

      <Section title="Headline metrics" note={`Month over month · ${monthName(months[idx])}`}>
        <Tiles keys={dashboard.hero} model={model} idx={idx} onOpen={onOpen} month={months[idx]} prevMonth={prevMonth} hero />
      </Section>

      <CompanyHeadline model={model} idx={idx} months={months} onOpen={onOpen} />
      <BoardPacing model={model} idx={idx} onOpen={onOpen} />
      <SegmentMatrix model={model} idx={idx} onOpen={onOpen} />

      {dashboard.groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <Tiles keys={g.keys} model={model} idx={idx} onOpen={onOpen} month={months[idx]} prevMonth={prevMonth} />
        </Section>
      ))}
    </div>
  );
}
