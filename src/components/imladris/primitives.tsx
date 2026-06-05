"use client";

/**
 * Small composable primitives for the Imladris dashboards:
 * delta chip, trust chip, pacing bar, contribution bars, segmented control,
 * cohort breakdown, and live benchmark segments.
 * Ported from `prototype/app/components.jsx`.
 */

import { useState } from "react";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import {
  deltaPct,
  fmtByUnit,
  fmtCurrency,
  fmtMetric,
  numberOr0,
  PALETTE,
  paceState,
} from "./format";
import styles from "./imladris-dashboard.module.css";
import type {
  LiveSegment,
  MetricCohortDimension,
  MetricStatus,
  MetricUnit,
  NormalizedMetric,
} from "./types";

export interface DeltaChipProps {
  value: number;
  prev: number | null;
  good: "up" | "down";
  compareLabel?: string;
}

export function DeltaChip({ value, prev, good, compareLabel }: DeltaChipProps) {
  const d = deltaPct(value, prev);
  if (d == null) return null;
  const flat = Math.abs(d) < 0.15;
  const up = d > 0;
  const healthy = flat ? null : good === "down" ? !up : up;
  const cls = flat ? styles.deltaFlat : healthy ? styles.deltaGood : styles.deltaBad;
  return (
    <span className={styles.tileMeta} style={{ marginTop: 0, gap: 7 }}>
      <span className={`${styles.delta} ${cls}`}>
        {!flat && (up ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
        {`${up ? "+" : ""}${d.toFixed(1)}%`}
      </span>
      {compareLabel && <span className={`${styles.deltaCmp} ${styles.num}`}>{compareLabel}</span>}
    </span>
  );
}

const TRUST_LABEL: Record<string, string> = {
  stale: "Stale data",
  partial: "Partial",
  error: "Source error",
  missing: "Missing",
};
const TRUST_CLASS: Record<string, string> = {
  stale: styles.trustStale,
  partial: styles.trustPartial,
  error: styles.trustError,
  missing: styles.trustMissing,
};

export function TrustChip({ status }: { status: MetricStatus }) {
  if (!status || status === "ready") return null;
  return (
    <span className={`${styles.trust} ${TRUST_CLASS[status] ?? ""}`}>
      <AlertTriangle size={11} />
      {TRUST_LABEL[status] ?? status}
    </span>
  );
}

export interface PaceBarProps {
  value: number;
  target: number | null | undefined;
  good: "up" | "down";
  unit: MetricUnit;
}

export function PaceBar({ value, target, good, unit }: PaceBarProps) {
  if (target == null) return null;
  const scaleMax = Math.max(value, target) * 1.14;
  const fillW = Math.max(0, Math.min(1, value / scaleMax)) * 100;
  const tickPos = Math.max(0, Math.min(1, target / scaleMax)) * 100;
  const state = paceState(value, target, good);
  const color = state === "on" ? "var(--success-text)" : "var(--arda-orange)";
  return (
    <div className={styles.pace}>
      <div className={styles.paceTrack}>
        <div className={styles.paceFill} style={{ width: `${fillW}%`, background: color }} />
        <div className={styles.paceTick} style={{ left: `${tickPos}%` }} />
      </div>
      <div className={styles.paceRow}>
        <span>{state === "on" ? "On track" : "Behind target"}</span>
        <span className={styles.num}>Target {fmtByUnit(target, unit)}</span>
      </div>
    </div>
  );
}

export interface ContributionProps {
  parts: Array<{ label: string; value: number }>;
  unit: MetricUnit | string;
}

export function Contribution({ parts, unit }: ContributionProps) {
  const max = Math.max(...parts.map((p) => Math.abs(p.value)), 1);
  return (
    <div className={styles.contrib}>
      {parts.map((p, i) => {
        const neg = p.value < 0;
        const w = (Math.abs(p.value) / max) * 100;
        const color = neg ? "#DC2626" : PALETTE[i % PALETTE.length];
        return (
          <div className={styles.contribRow} key={`${p.label}-${i}`}>
            <span className={styles.contribLabel}>{p.label}</span>
            <span className={styles.contribBar}>
              <i style={{ width: `${w}%`, left: 0, background: color }} />
            </span>
            <span className={`${styles.contribVal} ${styles.num}`} style={neg ? { color: "#DC2626" } : undefined}>
              {unit === "currency" ? fmtCurrency(p.value) : Math.round(p.value).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface SegProps {
  options: string[];
  value: number;
  onChange: (index: number) => void;
}

export function Seg({ options, value, onChange }: SegProps) {
  return (
    <div className={styles.seg} role="tablist">
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          className={`${styles.segBtn} ${i === value ? styles.segBtnActive : ""}`}
          role="tab"
          aria-selected={i === value}
          onClick={() => onChange(i)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function miniDelta(value: number, prev: number | null, good: "up" | "down") {
  const d = deltaPct(value, prev);
  if (d == null) return null;
  const flat = Math.abs(d) < 0.15;
  const up = d > 0;
  const healthy = flat ? null : good === "down" ? !up : up;
  const cls = flat ? styles.mdeltaFlat : healthy ? styles.mdeltaGood : styles.mdeltaBad;
  return <span className={`${styles.mdelta} ${styles.num} ${cls}`}>{`${up ? "+" : ""}${d.toFixed(1)}%`}</span>;
}

export interface CohortBreakdownProps {
  metric: NormalizedMetric;
  idx: number;
}

/** Demo-only dimensional cohort breakdown (additive shares / comparative rates). */
export function CohortBreakdown({ metric, idx }: CohortBreakdownProps) {
  const dims: MetricCohortDimension[] = metric.cohorts ?? [];
  const [di, setDi] = useState(0);
  if (!dims.length) return null;
  const dim = dims[Math.min(di, dims.length - 1)];
  const groups = dim.groups.map((g, i) => ({
    label: g.label,
    value: g.history[idx],
    prev: idx > 0 ? g.history[idx - 1] : null,
    color: PALETTE[i % PALETTE.length],
  }));
  const sorted = groups.slice().sort((a, b) => b.value - a.value);
  const total = dim.type === "additive" ? groups.reduce((s, g) => s + g.value, 0) : 0;
  const max = Math.max(...groups.map((g) => g.value), 1);
  return (
    <div className={styles.dblock}>
      <div className={styles.dblockTitle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>Cohort &amp; segment breakdown</span>
        {dims.length > 1 && <Seg options={dims.map((d) => d.label)} value={di} onChange={setDi} />}
      </div>
      <div className={styles.coh}>
        {sorted.map((g) => {
          const w = dim.type === "additive" ? (total ? (g.value / total) * 100 : 0) : (g.value / max) * 100;
          return (
            <div className={styles.cohRow} key={g.label}>
              <span className={styles.cohName}>
                <span className={styles.cohDot} style={{ background: g.color }} />
                {g.label}
              </span>
              <span className={`${styles.cohVal} ${styles.num}`}>
                {fmtMetric(metric, g.value)}
                {miniDelta(g.value, g.prev, metric.good)}
              </span>
              <span className={styles.cohBar}>
                <i style={{ width: `${w.toFixed(1)}%`, background: g.color }} />
              </span>
              <span className={styles.cohFoot}>
                <span>
                  {dim.type === "additive"
                    ? `${w.toFixed(0)}% of total`
                    : `vs blended ${fmtMetric(metric, metric.history[idx])}`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SEG_STATUS: Record<string, string> = {
  strong: styles.mdeltaGood, achieved: styles.mdeltaGood, available: styles.mdeltaGood,
  watch: styles.mdeltaFlat, active: styles.mdeltaFlat,
  risk: styles.mdeltaBad, critical: styles.mdeltaBad, missed: styles.mdeltaBad,
};

/** Live benchmark segments sourced from `/dashboards/company`. */
export function LiveSegments({ segments }: { segments: LiveSegment[] }) {
  if (!segments.length) return null;
  const max = Math.max(...segments.map((s) => Math.abs(numberOr0(s.value))), 1);
  return (
    <div className={styles.coh}>
      {segments.map((s, i) => {
        const v = numberOr0(s.value);
        const w = (Math.abs(v) / max) * 100;
        const cls = SEG_STATUS[s.status] ?? styles.mdeltaFlat;
        return (
          <div className={styles.cohRow} key={s.id || i}>
            <span className={styles.cohName}>
              <span className={styles.cohDot} style={{ background: PALETTE[i % PALETTE.length] }} />
              {s.label}
            </span>
            <span className={`${styles.cohVal} ${styles.num}`}>
              {fmtByUnit(v, s.unit)}
              {s.status ? <span className={`${styles.mdelta} ${cls}`} style={{ textTransform: "capitalize" }}>{s.status}</span> : null}
            </span>
            <span className={styles.cohBar}>
              <i style={{ width: `${w.toFixed(1)}%`, background: PALETTE[i % PALETTE.length] }} />
            </span>
            <span className={styles.cohFoot}>
              <span>{s.detail || ""}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
