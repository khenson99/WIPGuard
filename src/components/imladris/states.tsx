"use client";

/**
 * Loading / error / demo-banner states + the topbar with month switcher.
 * Ported from `prototype/app/components.jsx` (LoadingState, ErrorState,
 * DemoBanner, MonthSwitcher, TopBar).
 */

import { Activity, AlertTriangle, ChevronLeft, ChevronRight, Clock, Download, Plug, ShieldCheck } from "lucide-react";
import { buildAttention } from "./attention";
import { downloadDashboardCsv } from "./export-csv";
import { monthName } from "./format";
import styles from "./imladris-dashboard.module.css";
import type { DashboardDefinition, ImladrisModel } from "./types";

export function LoadingState() {
  return (
    <div className={styles.centerPane}>
      <div style={{ textAlign: "center" }}>
        <div className={styles.spinner} />
        <div className={styles.loadingTxt}>Loading live metrics from Imladris…</div>
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  error?: string | null;
  endpoint: string;
  onRetry: () => void;
  onDemo: () => void;
}

export function ErrorState({ error, endpoint, onRetry, onDemo }: ErrorStateProps) {
  return (
    <div className={styles.centerPane}>
      <div className={styles.stateCard}>
        <div className={styles.stateIcon}>
          <Plug size={26} />
        </div>
        <div className={styles.stateTitle}>Can&apos;t reach the metrics API</div>
        <p className={styles.stateMsg}>
          Dashboards show live canonical metrics only — nothing is rendered from sample data.
          {error ? ` ${error}` : ""}
        </p>
        <div className={styles.stateEndpoint}>GET {endpoint}</div>
        <div className={styles.stateActions}>
          <button type="button" className={styles.btnPrimary} onClick={onRetry}>
            <Activity size={15} />
            Retry connection
          </button>
          <button type="button" className={styles.btnGhost} onClick={onDemo}>
            Preview with demo data
          </button>
        </div>
      </div>
    </div>
  );
}

export function DemoBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className={styles.demobar}>
      <AlertTriangle size={15} />
      Demo data — not connected to live Imladris metrics. Numbers are illustrative.
      <span className={styles.demobarSpacer} />
      <button type="button" onClick={onConnect}>
        <Activity size={13} />
        Connect live
      </button>
    </div>
  );
}

export interface MonthSwitcherProps {
  months: string[];
  idx: number;
  onChange: (idx: number) => void;
}

export function MonthSwitcher({ months, idx, onChange }: MonthSwitcherProps) {
  return (
    <div className={styles.monthsw}>
      <button type="button" onClick={() => onChange(idx - 1)} disabled={idx <= 1} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <span className={styles.monthswLabel}>
        {monthName(months[idx])}
        <small>vs {monthName(months[idx - 1] || months[idx])}</small>
      </span>
      <button type="button" onClick={() => onChange(idx + 1)} disabled={idx >= months.length - 1} aria-label="Next month">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export interface TopBarProps {
  dashboard: DashboardDefinition;
  model: ImladrisModel;
  idx: number;
  months: string[];
  dataSource: "live" | "demo";
  onMonth: (idx: number) => void;
}

export function TopBar({ dashboard, model, idx, months, dataSource, onMonth }: TopBarProps) {
  const att = buildAttention(model, idx);
  const clean = att.length === 0;
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarTitle}>
        <div className={styles.eyebrow}>{dashboard.eyebrow}</div>
        <h1>{dashboard.label}</h1>
      </div>
      <div className={styles.topbarSpacer} />
      <span
        className={`${styles.dsrc} ${dataSource === "live" ? styles.dsrcLive : styles.dsrcDemo}`}
        title={dataSource === "live" ? "Connected to the Imladris metrics API" : "Demo data — not connected to live metrics"}
      >
        <span className={styles.dsrcDot} />
        {dataSource === "live" ? "Live" : "Demo data"}
      </span>
      <span className={`${styles.pill} ${clean ? styles.pillOk : styles.pillWarn}`}>
        {clean ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
        {clean ? "All sources fresh" : `${att.length} need${att.length === 1 ? "s" : ""} attention`}
      </span>
      {model.trendsAvailable === false ? (
        <span className={styles.pill}>
          <Clock size={14} />
          {monthName(months[idx])} · latest
        </span>
      ) : (
        <MonthSwitcher months={months} idx={idx} onChange={onMonth} />
      )}
      <button
        type="button"
        className={styles.btnIcon}
        aria-label="Export CSV"
        title={`Export ${dashboard.label} metrics for ${monthName(months[idx])} as CSV`}
        onClick={() => downloadDashboardCsv(model, dashboard, idx)}
      >
        <Download size={16} />
      </button>
    </header>
  );
}
