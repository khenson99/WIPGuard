"use client";

/**
 * Metric drill-down drawer (right slide-over). Ported from `MetricDrawer` in
 * `prototype/app/components.jsx`. Sections: value + delta + trust → trend →
 * breakdown → cohort/live segments → pacing → what changed → source lineage.
 * Closes on Esc / scrim / ✕.
 */

import { useEffect } from "react";
import { X } from "lucide-react";
import { AreaChart } from "./charts";
import {
  DEPT_LABEL,
  fmtByUnit,
  fmtMetric,
  hasTrend,
  monthAbbr,
  PROVIDER_STATE_COLOR,
  snapshot,
  syncLabel,
} from "./format";
import { CohortBreakdown, Contribution, DeltaChip, LiveSegments, PaceBar, TrustChip } from "./primitives";
import styles from "./imladris-dashboard.module.css";
import type { ImladrisModel, NormalizedMetric } from "./types";

export interface MetricDrawerProps {
  metric: NormalizedMetric | null;
  model: ImladrisModel;
  idx: number;
  months: string[];
  onClose: () => void;
}

export function MetricDrawer({ metric, model, idx, months, onClose }: MetricDrawerProps) {
  const open = !!metric;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const m = metric ?? model.metrics[0];
  if (!m) return null;
  const snap = snapshot(m, idx);
  const showTrend = hasTrend(model, m);
  const confPct = Math.round(m.confidence * 100);

  return (
    <>
      <div
        className={`${styles.scrim} ${open ? styles.scrimOpen : ""}`}
        style={{ pointerEvents: open ? "auto" : "none", opacity: open ? 1 : 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`${m.label} detail`}
        aria-hidden={!open}
        style={{ transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 240ms cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className={styles.drawerHead}>
          <div>
            <div className={styles.drawerEyebrow}>{DEPT_LABEL[m.dept] ?? m.dept} metric</div>
            <div className={styles.drawerTitle}>{m.label}</div>
            <div className={`${styles.drawerKey} ${styles.num}`}>{m.key}</div>
          </div>
          <button type="button" className={styles.btnIcon} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className={styles.drawerBody}>
          <div className={styles.drawerValue}>
            <span className={`${styles.drawerValueV} ${styles.num}`}>{fmtMetric(m, snap.value)}</span>
            {showTrend && (
              <DeltaChip
                value={snap.value}
                prev={snap.prev}
                good={m.good}
                compareLabel={`vs ${monthAbbr(months[Math.max(0, snap.idx - 1)])}`}
              />
            )}
            <TrustChip status={m.status} />
          </div>

          <div className={styles.dblock}>
            <div className={styles.dblockTitle}>Trend{showTrend ? ` · ${months.length} months` : ""}</div>
            {showTrend ? (
              <AreaChart data={m.history} months={months} selected={snap.idx} height={188} />
            ) : (
              <p className={`${styles.narr} ${styles.narrMuted}`}>
                A historical time-series for this metric isn&apos;t published by the metrics API yet — only the current reported value is shown.
              </p>
            )}
          </div>

          {m.breakdown && (
            <div className={styles.dblock}>
              <div className={styles.dblockTitle}>{m.breakdown.label}</div>
              <Contribution parts={m.breakdown.parts} unit={m.unit} />
            </div>
          )}

          {m.cohorts && m.cohorts.length > 0 && <CohortBreakdown metric={m} idx={snap.idx} />}
          {m.liveSegments && m.liveSegments.length > 0 && (
            <div className={styles.dblock}>
              <div className={styles.dblockTitle}>Cohort &amp; segment breakdown</div>
              <LiveSegments segments={m.liveSegments} />
            </div>
          )}

          {m.target != null && (
            <div className={styles.dblock}>
              <div className={styles.dblockTitle}>Pacing to target</div>
              <div className={styles.bullet}>
                <div className={styles.bulletHead}>
                  <span className={`${styles.bulletName} ${styles.num}`}>{fmtMetric(m, snap.value)}</span>
                  <span className={`${styles.bulletSub} ${styles.num}`}>Target {m.targetLabel || fmtByUnit(m.target, m.unit)}</span>
                </div>
                <PaceBar value={snap.value} target={m.target} good={m.good} unit={m.unit} />
              </div>
            </div>
          )}

          {m.narrative && (
            <div className={styles.dblock}>
              <div className={styles.dblockTitle}>What changed</div>
              <p className={styles.narr}>{m.narrative}</p>
            </div>
          )}

          <div className={styles.dblock}>
            <div className={styles.dblockTitle}>Source lineage</div>
            <div className={styles.lin}>
              {m.sources.map((sk) => {
                const p = model.providers[sk];
                if (!p) return null;
                return (
                  <div className={styles.linRow} key={sk}>
                    <span className={styles.linDot} style={{ background: PROVIDER_STATE_COLOR[p.state] }} />
                    <span className={styles.linName}>{p.label}</span>
                    <span className={`${styles.linMeta} ${styles.num}`}>
                      {p.records.toLocaleString()} records · {syncLabel(p.daysAgo)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={styles.conf} style={{ marginTop: 14 }}>
              <span className={styles.confLabel}>Confidence</span>
              <span className={styles.confTrack}>
                <span className={styles.confFill} style={{ width: `${confPct}%` }} />
              </span>
              <span className={`${styles.confPct} ${styles.num}`}>{confPct}%</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
