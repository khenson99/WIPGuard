"use client";

/**
 * KPI tile + attention feed. Ported from `KpiTile` / `AttentionFeed` in
 * `prototype/app/components.jsx`. The whole tile is the click target → drawer.
 */

import { AlertTriangle, ArrowUpRight, CircleCheck, Plug } from "lucide-react";
import { buildAttention } from "./attention";
import { Sparkline } from "./charts";
import { fmtMetric, monthAbbr, snapshot } from "./format";
import { MetricIcon } from "./icons";
import { DeltaChip, PaceBar, TrustChip } from "./primitives";
import styles from "./imladris-dashboard.module.css";
import type { ImladrisModel, NormalizedMetric } from "./types";

export interface KpiTileProps {
  metric: NormalizedMetric;
  idx: number;
  onOpen: (key: string) => void;
  hero?: boolean;
  noTrend?: boolean;
  month: string;
  compareLabel?: string;
}

export function KpiTile({ metric, idx, onOpen, hero, noTrend, month, compareLabel }: KpiTileProps) {
  const snap = snapshot(metric, idx);
  const confPct = Math.round(metric.confidence * 100);
  return (
    <button type="button" className={`${styles.tile} ${hero ? styles.hero : ""}`} onClick={() => onOpen(metric.key)}>
      <div className={styles.tileTop}>
        <span className={styles.tileLabel}>
          <MetricIcon metricKey={metric.key} size={14} />
          {metric.label}
        </span>
        <TrustChip status={metric.status} />
      </div>
      <div className={`${styles.tileValue} ${styles.num}`}>{fmtMetric(metric, snap.value)}</div>
      {noTrend ? (
        <div className={styles.tileFoot} style={{ marginTop: 9 }}>
          <span>Live value · current period</span>
          <span className={styles.num}>{confPct}% conf.</span>
        </div>
      ) : (
        <>
          <DeltaChip value={snap.value} prev={snap.prev} good={metric.good} compareLabel={compareLabel} />
          <div className={styles.tileSpark}>
            <Sparkline
              data={metric.history.slice(0, snap.idx + 1)}
              good={metric.good}
              w={hero ? 240 : 200}
              h={hero ? 38 : 32}
            />
          </div>
          {metric.target != null ? (
            <PaceBar value={snap.value} target={metric.target} good={metric.good} unit={metric.unit} />
          ) : (
            <div className={styles.tileFoot}>
              <span>Recognized {monthAbbr(month)}</span>
              <span className={styles.num}>{confPct}% conf.</span>
            </div>
          )}
        </>
      )}
    </button>
  );
}

export interface AttentionFeedProps {
  model: ImladrisModel;
  idx: number;
  onOpen: (key: string) => void;
}

export function AttentionFeed({ model, idx, onOpen }: AttentionFeedProps) {
  const items = buildAttention(model, idx);
  if (!items.length) {
    return (
      <div className={styles.allclear}>
        <CircleCheck size={17} />
        All tracked metrics are within range and every source is fresh.
      </div>
    );
  }
  return (
    <div className={styles.attn}>
      {items.map((it, i) => {
        const iconCls =
          it.sev === "error" ? styles.attnIconError : it.sev === "warning" ? styles.attnIconWarning : styles.attnIconInfo;
        return (
          <button type="button" key={`${it.metricKey}-${i}`} className={styles.attnCard} onClick={() => onOpen(it.metricKey)}>
            <span className={`${styles.attnIcon} ${iconCls}`}>{it.sev === "error" ? <Plug size={16} /> : <AlertTriangle size={16} />}</span>
            <span className={styles.attnBody}>
              <span className={styles.attnTitle}>{it.title}</span>
              <span className={styles.attnDesc}>{it.desc}</span>
              <span className={styles.attnTag}>
                {it.tag}
                <ArrowUpRight size={11} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
